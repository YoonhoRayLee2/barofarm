/**
 * REST API Client — Barofarm
 * Same-origin fetch wrapper. All non-2xx responses throw.
 * Auth token is stored via native-bridge (secure storage or localStorage fallback).
 * Every request automatically attaches Authorization: Bearer <token> if a token is stored.
 * 401 responses trigger a refresh attempt; if refresh also fails, user is logged out.
 *
 * @module api
 */

import { setSecureItem, getSecureItem } from './native-bridge.js';
import { replace } from './router.js';

const BASE = '';

/* ─── Token management ─────────────────────────────────────────────── */

const TOKEN_KEY   = 'barofarm_token';
const REFRESH_KEY = 'barofarm_refresh';
const USER_KEY    = 'user';

/**
 * Persist auth token (and optionally refreshToken + user) after login/signup.
 * Uses native secure storage when available, localStorage otherwise (via native-bridge).
 * @param {string} token
 * @param {string} [refreshToken]
 * @param {object} [user]
 */
export async function setAuthToken(token, refreshToken, user) {
  await setSecureItem(TOKEN_KEY, token);
  if (refreshToken) await setSecureItem(REFRESH_KEY, refreshToken);
  if (user)         await setSecureItem(USER_KEY, JSON.stringify(user));
}

/**
 * Clear all auth state (logout).
 */
export async function clearAuthToken() {
  await setSecureItem(TOKEN_KEY, '');
  await setSecureItem(REFRESH_KEY, '');
  await setSecureItem(USER_KEY, '');
}

/**
 * Get the currently stored access token, or null.
 * @returns {Promise<string|null>}
 */
export async function getToken() {
  const val = await getSecureItem(TOKEN_KEY);
  return val || null;
}

/** Whether a refresh is already in-flight (prevents concurrent refresh storms). */
let _refreshing = false;
let _refreshQueue = [];

async function _doRefresh() {
  const rt = await getSecureItem(REFRESH_KEY);
  if (!rt) throw new Error('no refresh token');
  const data = await _rawRequest('/api/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: rt }),
  });
  await setSecureItem(TOKEN_KEY, data.token);
  return data.token;
}

async function _refreshOrLogout() {
  if (_refreshing) {
    // Queue this call behind the in-flight refresh
    return new Promise((resolve, reject) => {
      _refreshQueue.push({ resolve, reject });
    });
  }
  _refreshing = true;
  try {
    const token = await _doRefresh();
    _refreshQueue.forEach(q => q.resolve(token));
    _refreshQueue = [];
    return token;
  } catch (err) {
    _refreshQueue.forEach(q => q.reject(err));
    _refreshQueue = [];
    // Refresh failed — log out and redirect
    await clearAuthToken();
    replace('/app/login');
    throw err;
  } finally {
    _refreshing = false;
  }
}

/* ─── Core fetch helpers ───────────────────────────────────────────── */

/**
 * Raw fetch (no retry, no auth header injection). Used internally for refresh.
 * @param {string} path
 * @param {RequestInit} opts
 * @returns {Promise<any>}
 */
async function _rawRequest(path, opts = {}) {
  const url = `${BASE}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  let res;
  try {
    res = await fetch(url, { ...opts, headers });
  } catch (err) {
    throw new Error(`[api] network error on ${path}: ${err.message}`);
  }
  let body = null;
  const text = await res.text();
  if (text) { try { body = JSON.parse(text); } catch { body = text; } }
  if (!res.ok) {
    const e = new Error((body && body.error) || (typeof body === 'string' ? body : `HTTP ${res.status}`));
    e.status = res.status;
    throw e;
  }
  return body;
}

/**
 * Internal fetch helper — injects auth header, retries on 401 via token refresh.
 * Body가 FormData인 경우에는 Content-Type을 설정하지 않아 브라우저가 boundary를 자동 설정하도록 한다.
 * @param {string} path
 * @param {RequestInit} [opts]
 * @param {boolean} [_isRetry] - true on second attempt (after refresh)
 * @returns {Promise<any>}
 */
export async function request(path, opts = {}, _isRetry = false) {
  const url = `${BASE}${path}`;
  const token = await getToken();
  const isFormData = (typeof FormData !== 'undefined') && (opts.body instanceof FormData);
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers || {}),
  };

  let res;
  try {
    res = await fetch(url, { ...opts, headers });
  } catch (err) {
    throw new Error(`[api] network error on ${path}: ${err.message}`);
  }

  let body = null;
  const text = await res.text();
  if (text) { try { body = JSON.parse(text); } catch { body = text; } }

  // 결제 인증세션 401(PAYMENT_AUTH_*)은 로그인 토큰 만료가 아니라 "결제 인증 필요"를 뜻하므로
  // 토큰 갱신/로그아웃 흐름을 타지 않고 호출부로 그대로 전달한다(e.code로 분기).
  const isPaymentAuth401 = body && typeof body === 'object'
    && typeof body.error === 'string' && body.error.startsWith('PAYMENT_AUTH');

  if (res.status === 401 && !_isRetry && !isPaymentAuth401) {
    // Attempt token refresh once
    try {
      await _refreshOrLogout();
      return request(path, opts, true); // retry with new token
    } catch {
      throw new Error('[api 401] 로그인이 필요합니다.');
    }
  }

  if (!res.ok) {
    const e = new Error((body && body.error) || (typeof body === 'string' ? body : `HTTP ${res.status}`));
    e.status = res.status;
    // Expose the parsed error body so callers can branch on server error codes
    // (e.g. PAYMENT_PASSWORD_LOCKED) and show the server message. Additive — does
    // not change existing e.message/e.status behaviour.
    e.code = (body && typeof body === 'object' && body.error) || null;
    e.body = (body && typeof body === 'object') ? body : null;
    throw e;
  }

  return body;
}

/* ─── Auth API ──────────────────────────────────────────────────────── */

/**
 * Register a new user.
 * @param {{ username: string, password: string, phone: string }} payload
 * @returns {Promise<{ user: { id, username, nickname, phone }, token: string, refreshToken: string }>}
 */
export async function signup({ username, password, phone }) {
  const data = await _rawRequest('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ username, password, phone }),
  });
  await setAuthToken(data.token, data.refreshToken, data.user);
  return data;
}

/**
 * Login with username + password.
 * @param {{ username: string, password: string }} payload
 * @returns {Promise<{ user: { id, username, nickname, phone }, token: string, refreshToken: string }>}
 */
export async function login({ username, password }) {
  const data = await _rawRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  await setAuthToken(data.token, data.refreshToken, data.user);
  return data;
}

/**
 * Refresh the access token using the stored refresh token.
 * @returns {Promise<string>} new access token
 */
export async function refreshToken() {
  return _doRefresh();
}

/**
 * Fetch the currently authenticated user.
 * @returns {Promise<{ id, username, nickname, phone }>}
 */
export async function getMe() {
  return request('/api/auth/me', { method: 'GET' });
}

/* ─── Users (legacy) ─────────────────────────────────────────────── */

/**
 * Create a user (legacy endpoint — deprecated, kept for pages that still use it).
 * @param {{ name: string, phone: string }} payload
 * @returns {Promise<import('./models.js').User>}
 */
export async function createUser({ name, phone }) {
  return request('/api/users', {
    method: 'POST',
    body: JSON.stringify({ name, phone }),
  });
}

/* ─── Auctions ──────────────────────────────────────────────────────── */

/**
 * List auctions.
 * @returns {Promise<import('./models.js').Auction[]>}
 */
export async function getAuctions() {
  return request('/api/auctions', { method: 'GET' });
}

/**
 * Check if a buyer can combine shipping with an existing pending order from the same seller.
 * @param {string|number} sellerId
 * @param {string|number} buyerId
 * @returns {Promise<{ combinable: boolean, pendingCount: number }>}
 */
export async function getCombinableShipping(sellerId, buyerId) {
  return request(`/api/auctions/combinable-shipping?sellerId=${encodeURIComponent(sellerId)}&buyerId=${encodeURIComponent(buyerId)}`);
}

/* ─── Lives ─────────────────────────────────────────────────────────── */

/**
 * List lives.
 * @returns {Promise<import('./models.js').Live[]>}
 */
export async function getLives() {
  return request('/api/lives', { method: 'GET' });
}

/**
 * Get a single live session by id.
 * @param {string} liveId
 * @returns {Promise<import('./models.js').Live>}
 */
export async function getLive(liveId) {
  return request(`/api/lives/${encodeURIComponent(liveId)}`);
}

/**
 * Get a user's public profile.
 * @param {string|number} userId
 * @returns {Promise<{ id: number, displayName: string, nickname: string|null, avatarUrl: string|null, role: string }>}
 */
export async function getUser(userId) {
  return request(`/api/users/${encodeURIComponent(userId)}`);
}

export async function getPublicProfile(userId, viewerId) {
  return request(`/api/users/${encodeURIComponent(userId)}/public-profile?viewerId=${encodeURIComponent(viewerId)}`);
}

/**
 * Get a user's membership tier info.
 * @param {string|number} userId
 * @returns {Promise<{ tier: 'sprout'|'farmer'|'elite'|'master', label: string, emoji: string,
 *   totalSpend: number, sellerFeeRate: number, buyerDiscountRate: number,
 *   nextTier: string|null, nextThreshold: number|null, progressPct: number }>}
 */
export async function getUserTier(userId) {
  return request(`/api/users/${encodeURIComponent(userId)}/tier`);
}

/**
 * Get a user's seller-side tier info (sales-based fee tier).
 * @param {string|number} userId
 * @returns {Promise<{ tier: string, label: string, emoji: string,
 *   totalSales: number, sellerFeeRate: number,
 *   nextTier: string|null, nextThreshold: number|null, progressPct: number }>}
 */
export async function getSellerTier(userId) {
  return request(`/api/users/${encodeURIComponent(userId)}/seller-tier`);
}

/**
 * Create a live session.
 * thumbnail이 있으면 multipart/form-data, 없으면 JSON으로 전송한다.
 * @param {{ sellerId: string, title: string, thumbnail?: File|Blob|null, scheduledAt?: number|null, memo?: string|null, memoImages?: File[] }} payload
 * @returns {Promise<import('./models.js').Live>}
 */
export async function createLive({ sellerId, title, thumbnail = null, category = null, scheduledAt = null, memo = null, memoImages = [] }) {
  const memoFiles = Array.isArray(memoImages) ? memoImages.filter(Boolean) : [];
  if (thumbnail || memoFiles.length) {
    const fd = new FormData();
    fd.append('sellerId', String(sellerId));
    fd.append('title', title);
    if (category) fd.append('category', String(category));
    if (thumbnail) fd.append('thumbnail', thumbnail);
    if (scheduledAt) fd.append('scheduledAt', String(scheduledAt));
    if (memo) fd.append('memo', String(memo));
    for (const f of memoFiles) fd.append('memoImages', f);
    return request('/api/lives', { method: 'POST', body: fd });
  }
  return request('/api/lives', {
    method: 'POST',
    body: JSON.stringify({ sellerId, title, ...(category ? { category } : {}), ...(scheduledAt ? { scheduledAt } : {}), ...(memo ? { memo } : {}) }),
  });
}

/**
 * Update a live's memo (seller only, Bearer auth attached by request()).
 * keepImageUrls/newMemoImages가 주어지면 multipart(FormData)로 전송해 사진을 함께 갱신한다.
 * 둘 다 생략하면 기존처럼 텍스트만 JSON으로 수정한다(하위호환).
 * @param {string} liveId
 * @param {string} memo
 * @param {string|number} sellerId
 * @param {{ keepImageUrls?: string[], newMemoImages?: File[] }} [photoOpts]
 * @returns {Promise<{ memo: string, memoImages?: string[] }>}
 */
export async function updateLiveMemo(liveId, memo, sellerId, photoOpts) {
  const path = `/api/lives/${encodeURIComponent(liveId)}/memo`;
  if (photoOpts && (photoOpts.keepImageUrls || photoOpts.newMemoImages)) {
    const fd = new FormData();
    fd.append('memo', memo == null ? '' : String(memo));
    fd.append('sellerId', String(sellerId));
    if (photoOpts.keepImageUrls) fd.append('keepImageUrls', JSON.stringify(photoOpts.keepImageUrls));
    for (const f of (photoOpts.newMemoImages || [])) fd.append('newMemoImages', f);
    return request(path, { method: 'PATCH', body: fd });
  }
  return request(path, {
    method: 'PATCH',
    body: JSON.stringify({ memo, sellerId }),
  });
}

/**
 * End a live session.
 * @param {string} liveId
 * @param {string|number} sellerId
 * @returns {Promise<import('./models.js').Live>}
 */
export async function endLive(liveId, sellerId) {
  const sid = Number(sellerId);
  if (!sellerId || Number.isNaN(sid)) {
    throw new Error('[api] endLive: sellerId is required');
  }
  return request(`/api/lives/${encodeURIComponent(liveId)}/end`, {
    method: 'PATCH',
    body: JSON.stringify({ sellerId: sid }),
  });
}

/**
 * 예약된 라이브를 실제 방송 시작.
 * @param {string} liveId
 * @param {string|number} sellerId
 * @returns {Promise<{ id: string, token: string|null, serverUrl: string|null }>}
 */
export async function goLive(liveId, sellerId) {
  return request(`/api/lives/${encodeURIComponent(liveId)}/go-live`, {
    method: 'PATCH',
    body: JSON.stringify({ sellerId: Number(sellerId) }),
  });
}

/**
 * Create an auction inside a live.
 * imageBlob가 있으면 multipart/form-data, 없으면 JSON으로 전송한다.
 *
 * @param {string} liveId
 * @param {{ productName: string, startPrice: number, mode?: 'normal'|'fcfs'|'blind', durationSec?: number, stockTotal?: number }} payload
 * @param {Blob} [imageBlob]
 * @returns {Promise<import('./models.js').Auction>}
 */
export async function createAuctionInLive(liveId, payload, imageBlob) {
  const path = `/api/lives/${encodeURIComponent(liveId)}/auctions`;

  if (imageBlob) {
    const fd = new FormData();
    Object.entries(payload).forEach(([k, v]) => {
      if (v !== undefined && v !== null) fd.append(k, String(v));
    });
    fd.append('image', imageBlob, 'product.jpg');

    const url = `${BASE}${path}`;
    const token = await getToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    let res;
    try {
      res = await fetch(url, { method: 'POST', body: fd, headers });
    } catch (err) {
      throw new Error(`[api] network error on ${path}: ${err.message}`);
    }
    let body = null;
    const text = await res.text();
    if (text) { try { body = JSON.parse(text); } catch { body = text; } }
    if (!res.ok) {
      const msg = (body && body.error) || (typeof body === 'string' ? body : `HTTP ${res.status}`);
      throw new Error(`[api ${res.status}] ${path} — ${msg}`);
    }
    return body;
  }

  return request(path, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Alias: createAuction — same as createAuctionInLive.
 */
export const createAuction = createAuctionInLive;

/**
 * End a fcfs auction early (seller).
 * @param {string} liveId
 * @param {string} auctionId
 * @returns {Promise<import('./models.js').Auction>}
 */
export async function endFcfsAuction(liveId, auctionId) {
  return request(
    `/api/lives/${encodeURIComponent(liveId)}/auctions/${encodeURIComponent(auctionId)}/end-fcfs`,
    { method: 'PATCH' },
  );
}

/**
 * Get blind auction bids (available only after auction ends).
 * @param {string} liveId
 * @param {string} auctionId
 * @returns {Promise<Array<{ userName: string, price: number }>>}
 */
export async function getBlindBids(liveId, auctionId) {
  return request(
    `/api/lives/${encodeURIComponent(liveId)}/auctions/${encodeURIComponent(auctionId)}/bids`,
    { method: 'GET' },
  );
}

/**
 * Start an auction inside a live.
 * @param {string} liveId
 * @param {string} auctionId
 * @returns {Promise<import('./models.js').Auction>}
 */
export async function startAuction(liveId, auctionId) {
  return request(
    `/api/lives/${encodeURIComponent(liveId)}/auctions/${encodeURIComponent(auctionId)}/start`,
    { method: 'PATCH' },
  );
}

/* ─── Favorites ─────────────────────────────────────────────────────── */

/**
 * Get favorites for a user.
 * @param {string} userId
 */
export async function getFavorites(userId) {
  return request(`/api/favorites?userId=${encodeURIComponent(userId)}`, { method: 'GET' });
}

/**
 * Toggle favorite for a live.
 * @param {{ userId: string, liveId: string }} payload
 * @returns {Promise<{ favorited: boolean }>}
 */
export async function toggleFavorite({ userId, liveId }) {
  return request('/api/favorites', {
    method: 'POST',
    body: JSON.stringify({ userId, liveId }),
  });
}

/* ─── Wishlist ───────────────────────────────────────────────────────── */

/**
 * Get wishlist products for a user.
 * @param {string} userId
 * @returns {Promise<Array>}
 */
export async function getWishlist(userId) {
  return request(`/api/wishlist?userId=${encodeURIComponent(userId)}`, { method: 'GET' });
}

/**
 * Toggle wishlist for a product.
 * @param {{ userId: string, productId: string }} payload
 * @returns {Promise<{ wishlisted: boolean }>}
 */
export async function toggleWishlist({ userId, productId }) {
  return request('/api/wishlist', {
    method: 'POST',
    body: JSON.stringify({ userId, productId }),
  });
}

/* ─── Notifications ──────────────────────────────────────────────────── */

/**
 * Get notifications for a user.
 * @param {string|number} userId
 * @returns {Promise<{ items: Array<{ id, type, title, body, link, isRead, createdAt }>, unreadCount: number }>}
 */
export async function getNotifications(userId) {
  return request(`/api/notifications?userId=${encodeURIComponent(userId)}`, { method: 'GET' });
}

/**
 * Mark a notification as read.
 * @param {string|number} id
 * @param {string|number} userId
 * @returns {Promise<{ ok: boolean }>}
 */
export async function markNotificationRead(id, userId) {
  return request(`/api/notifications/${encodeURIComponent(id)}/read`, {
    method: 'PATCH',
    body: JSON.stringify({ userId }),
  });
}

/**
 * 단골(구독) 맺기 — subscriberId는 서버가 인증 토큰에서 취득한다.
 * @param {number|string} sellerId
 * @returns {Promise<{ ok: boolean }>}
 */
export async function subscribe(sellerId) {
  return request(`/api/users/${encodeURIComponent(sellerId)}/subscribe`, { method: 'POST' });
}

/**
 * 단골(구독) 해제.
 * @param {number|string} sellerId
 * @returns {Promise<{ ok: boolean }>}
 */
export async function unsubscribe(sellerId) {
  return request(`/api/users/${encodeURIComponent(sellerId)}/subscribe`, { method: 'DELETE' });
}

/* ─── User-scoped ───────────────────────────────────────────────────── */

/**
 * Get dashboard summary stats for a seller.
 * @param {string} userId
 */
export async function getDashboardSummary(userId) {
  return request(`/api/users/${encodeURIComponent(userId)}/dashboard-summary`, { method: 'GET' });
}

/**
 * List lives for a user (seller's own lives).
 * @param {string} userId
 */
export async function getUserLives(userId) {
  return request(`/api/users/${encodeURIComponent(userId)}/lives`, { method: 'GET' });
}

/* ─── LiveKit ───────────────────────────────────────────────────────── */

/**
 * Issue a LiveKit access token.
 * @param {{ roomName: string, userId: string, role: 'seller'|'buyer' }} payload
 * @returns {Promise<{ token: string, url: string }>}
 */
export async function getLiveToken({ roomName, userId, role }) {
  return request('/api/live/token', {
    method: 'POST',
    body: JSON.stringify({ roomName, userId, role }),
  });
}

/* ─── Products ──────────────────────────────────────────────────────── */

/**
 * 상품 등록.
 * @param {{ sellerId: string|number, name: string, price: number, description?: string,
 *            category?: string, features?: string, attributes?: string,
 *            image?: File, images?: File[] }} fields
 */
export async function createProduct(fields) {
  const fd = new FormData();
  const { image, images, ...rest } = fields;
  Object.entries(rest).forEach(([k, v]) => {
    if (v != null) fd.append(k, String(v));
  });
  if (image instanceof File) fd.set('image', image);
  if (Array.isArray(images)) {
    images.forEach((f) => { if (f instanceof File) fd.append('images', f); });
  }
  return request('/api/products', { method: 'POST', body: fd });
}

/**
 * 상품 목록 조회.
 * @param {{ sellerId?: string|number, category?: string }} [params]
 */
export async function getProducts(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return request(`/api/products${qs ? '?' + qs : ''}`);
}

/**
 * 상품 단건 조회.
 * @param {string|number} id
 */
export async function getProduct(id) {
  return request(`/api/products/${encodeURIComponent(id)}`);
}

/**
 * 상품 수정 (있는 필드만 PATCH).
 * @param {string|number} id
 * @param {{ name?: string, price?: number, description?: string,
 *            category?: string, features?: string, attributes?: string,
 *            status?: string, image?: File, images?: File[] }} fields
 */
export async function updateProduct(id, fields) {
  const fd = new FormData();
  const { image, images, ...rest } = fields;
  Object.entries(rest).forEach(([k, v]) => {
    if (v != null) fd.append(k, String(v));
  });
  if (image instanceof File) fd.set('image', image);
  if (Array.isArray(images)) {
    images.forEach((f) => { if (f instanceof File) fd.append('images', f); });
  }
  return request(`/api/products/${encodeURIComponent(id)}`, { method: 'PATCH', body: fd });
}

/**
 * 상품 삭제 (소프트 삭제 — status='hidden').
 * @param {string|number} id
 */
export async function deleteProduct(id) {
  return request(`/api/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/**
 * 통합 검색.
 * @param {{ q?: string, category?: string, minPrice?: number, maxPrice?: number }} params
 * @returns {Promise<{ products: Object[], sellers: Object[] }>}
 */
export async function search(params = {}) {
  const qs = new URLSearchParams();
  if (params.q != null && params.q !== '') qs.append('q', params.q);
  if (params.category != null && params.category !== '') qs.append('category', params.category);
  if (params.minPrice != null && params.minPrice !== '') qs.append('minPrice', params.minPrice);
  if (params.maxPrice != null && params.maxPrice !== '') qs.append('maxPrice', params.maxPrice);
  const qstr = qs.toString();
  return request(`/api/search${qstr ? '?' + qstr : ''}`);
}

/* ─── Reviews ────────────────────────────────────────────────── */

/**
 * 리뷰 작성 (인증 필요).
 * @param {{ auctionId: string|number, rating: number, comment?: string }} payload
 * @returns {Promise<{ id, auctionId, reviewerId, sellerId, rating, comment, sellerReply }>}
 */
export async function createReview({ auctionId, rating, comment }) {
  return request('/api/reviews', {
    method: 'POST',
    body: JSON.stringify({ auctionId, rating, comment }),
  });
}

/**
 * 판매자 리뷰 목록 + 평균.
 * @param {string|number} sellerId
 * @returns {Promise<{ average: number|null, count: number, items: Array }>}
 */
export async function getSellerReviews(sellerId) {
  return request(`/api/reviews/seller/${encodeURIComponent(sellerId)}`);
}

/**
 * 거래 단위 리뷰 조회 (본인 것만).
 * @param {string|number} auctionId
 * @returns {Promise<object|null>} 리뷰 객체 또는 null
 */
export async function getReviewByAuction(auctionId) {
  return request(`/api/reviews/by-auction/${encodeURIComponent(auctionId)}`);
}

/**
 * 프로필 수정 (아바타, 닉네임, 배송지)
 * @param {string|number} userId
 * @param {{ avatar?: File, nickname?: string, deliveryName?: string, deliveryPhone?: string,
 *            deliveryAddress?: string, deliveryDetail?: string, deliveryZipcode?: string }} fields
 */
export async function updateProfile(userId, fields) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => {
    if (v != null) fd.append(k, v);
  });
  return request(`/api/users/${userId}`, { method: 'PATCH', body: fd });
}
