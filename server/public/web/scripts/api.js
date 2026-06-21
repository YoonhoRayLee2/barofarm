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
async function request(path, opts = {}, _isRetry = false) {
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

  if (res.status === 401 && !_isRetry) {
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
 * @param {{ sellerId: string, title: string, thumbnail?: File|Blob|null, scheduledAt?: number|null }} payload
 * @returns {Promise<import('./models.js').Live>}
 */
export async function createLive({ sellerId, title, thumbnail = null, category = null, scheduledAt = null }) {
  if (thumbnail) {
    const fd = new FormData();
    fd.append('sellerId', String(sellerId));
    fd.append('title', title);
    if (category) fd.append('category', String(category));
    fd.append('thumbnail', thumbnail);
    if (scheduledAt) fd.append('scheduledAt', String(scheduledAt));
    return request('/api/lives', { method: 'POST', body: fd });
  }
  return request('/api/lives', {
    method: 'POST',
    body: JSON.stringify({ sellerId, title, ...(category ? { category } : {}), ...(scheduledAt ? { scheduledAt } : {}) }),
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

/**
 * 낙찰 직후 임시 쇼핑몰(mall-demo)에서 추천 상품을 가져온다.
 * @param {string|number} auctionId
 * @param {number} [limit=5] — 1~10
 * @returns {Promise<{
 *   auction: { id: string, itemName: string, category: string, finalPrice: number, winnerNickname?: string },
 *   recommendations: Array<{ product: object, score: number, reasons: string[] }>,
 *   meta: { algorithm: string, generatedAt: string }
 * }>}
 */
export async function getRecommendations(auctionId, limit = 5) {
  const qs = new URLSearchParams({
    auctionId: String(auctionId),
    limit: String(limit),
  }).toString();
  return request(`/api/recommend?${qs}`);
}
