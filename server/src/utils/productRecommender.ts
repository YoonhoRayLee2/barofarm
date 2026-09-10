import fs from 'fs';
import path from 'path';
import pool from '../db/mysql';

const ALL_CATEGORIES_FALLBACK = ['과일', '채소', '수산', '축산', '곡물', '기타'];

interface Product {
  wrsC: string;
  name: string;
  price: number;
  listPrice: number;
  discountRate: number;
  imgUrl: string;
  detailUrl: string;
  category: string;
  items: string[];
  soldOut: boolean;
}

interface ProductsJson {
  categories: Array<{
    key: string;
    products: Product[];
  }>;
}

// 서버 시작 시 1회 로드, 이후 메모리 캐시
let allProducts: Product[] = [];

function loadProducts(): void {
  const filePath = path.resolve(__dirname, '../../data/products.json');
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data: ProductsJson = JSON.parse(raw);
    allProducts = data.categories.flatMap((cat) =>
      cat.products.map((p) => ({ ...p, category: cat.key }))
    );
    console.log(`[productRecommender] loaded ${allProducts.length} products`);
  } catch (err) {
    console.error('[productRecommender] products.json load failed, recommendations will be empty:', err);
    allProducts = [];
  }
}

loadProducts();

// 상품 정체성과 무관한 노이즈 키워드 (마케팅 수식어·유통·포장·원산지·등급 등).
// products.json 상품명 빈도 분석 기반 — 매칭 정확도를 크게 떨어뜨리는 고빈도 일반어.
const STOPWORDS = new Set([
  // 마케팅/수식
  '선물세트', '세트', '프리미엄', '명품', '특가', '입점특가', '쿠폰', '특대', '대용량',
  '가정용', '실속', '실속형', '혼합', '모음', '골라담기', '기획', '행사', '최대',
  // 원산지/품질/인증 (카테고리로 이미 커버됨)
  '국내산', '국산', '제주', '완도', '산지직송', '직송', '유기농', '무항생제', '친환경',
  '무농약', '내외', '엄선', '농가',
  // 유통/보관/포장
  '냉장', '냉동', '손질', '반건조', '건조', '생물', '활', '진공', '포장', '박스',
  '출고', '당일', '도정', '택배', '무료배송', '배송',
  // 유통사/브랜드 노이즈
  '농협', '온도씨', '해맑은푸드', '바다원', '자연애', '바로바로팜', '푸른들',
  '농협안심한우',
  // 연도/등급
  '년산', '상등급', '특품', '대품', '중품', '등급',
]);

// 상품명에서 의미있는 키워드 추출 (2자 이상 한글 단어, 노이즈/단위 제외)
function extractKeywords(name: string): string[] {
  const tokens = name.split(/[\s,()[\]\/·★+]+/);
  return tokens.filter((t) => {
    if (!/^[가-힣]{2,}$/.test(t)) return false;     // 2자 이상 순수 한글
    if (STOPWORDS.has(t)) return false;             // 노이즈 제거
    if (/^\d/.test(t)) return false;                // 숫자 시작 (한글 정규식상 거의 없음)
    return true;
  });
}

// 카테고리별 키워드 인덱스 — 농협몰 스냅샷(카테고리 라벨 보유)의 상품명에서 추출한 키워드가
// 어느 카테고리에 몇 번 등장하는지 집계한다. 상품명 기반 카테고리 추론(inferCategoryFromName)에 사용.
// allProducts 로드 직후 1회 구축, 이후 재사용(요청마다 1.27만개 재순회하지 않도록).
let categoryKeywordIndex: Map<string, Map<string, number>> | null = null;

function buildCategoryKeywordIndex(): Map<string, Map<string, number>> {
  const index = new Map<string, Map<string, number>>();
  for (const p of allProducts) {
    for (const kw of extractKeywords(p.name)) {
      let byCategory = index.get(kw);
      if (!byCategory) { byCategory = new Map(); index.set(kw, byCategory); }
      byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + 1);
    }
  }
  return index;
}

/**
 * 경매 상품명에서 실제 카테고리를 추론한다. 라이브 자체에 설정된 카테고리(판매자가 방송
 * 개설 시 한 번 고르는 값)는 방송 중인 개별 경매 상품과 다를 수 있으므로, 카테고리 판정은
 * 상품명 기반 추론을 우선하고, 추론 실패 시에만 라이브 카테고리로 폴백한다.
 *
 * 방식: 상품명에서 키워드를 추출해 각 키워드가 농협몰 스냅샷에서 가장 많이 등장하는
 * 카테고리에 1표씩 던지고(키워드 내 최빈 카테고리에 그 키워드의 총 등장수만큼 가중),
 * 최다 득표 카테고리를 반환한다. 키워드가 없거나 매칭 카테고리가 없으면 null.
 */
function inferCategoryFromName(productName: string): string | null {
  if (allProducts.length === 0) return null;
  if (!categoryKeywordIndex) categoryKeywordIndex = buildCategoryKeywordIndex();

  const keywords = extractKeywords(productName);
  if (keywords.length === 0) return null;

  const votes = new Map<string, number>();
  for (const kw of keywords) {
    const byCategory = categoryKeywordIndex.get(kw);
    if (!byCategory || byCategory.size === 0) continue;
    let bestCategory: string | null = null;
    let bestCount = 0;
    for (const [cat, count] of byCategory) {
      if (count > bestCount) { bestCategory = cat; bestCount = count; }
    }
    if (bestCategory) votes.set(bestCategory, (votes.get(bestCategory) ?? 0) + bestCount);
  }

  let winner: string | null = null;
  let winnerVotes = 0;
  for (const [cat, v] of votes) {
    if (v > winnerVotes) { winner = cat; winnerVotes = v; }
  }
  return winner;
}

export function getRecommendationsByCategories(
  categories: string[],
  limit = 8,
  excludeName?: string,
): Pick<Product, 'wrsC' | 'name' | 'price' | 'listPrice' | 'discountRate' | 'imgUrl' | 'category' | 'detailUrl'>[] {
  if (allProducts.length === 0 || categories.length === 0) return [];

  const candidates = allProducts.filter(
    (p) => !p.soldOut && categories.includes(p.category) && p.name !== excludeName
  );

  return candidates
    .sort((a, b) => b.discountRate - a.discountRate || a.price - b.price)
    .slice(0, limit)
    .map((p) => ({
      wrsC: p.wrsC,
      name: p.name,
      price: p.price,
      listPrice: p.listPrice,
      discountRate: p.discountRate,
      imgUrl: p.imgUrl,
      category: p.category,
      detailUrl: p.detailUrl,
    }));
}

type RecResult = Pick<Product, 'wrsC' | 'name' | 'price' | 'listPrice' | 'discountRate' | 'imgUrl' | 'category' | 'detailUrl'>;

function toResult(p: Product): RecResult {
  return {
    wrsC: p.wrsC,
    name: p.name,
    price: p.price,
    listPrice: p.listPrice,
    discountRate: p.discountRate,
    imgUrl: p.imgUrl,
    category: p.category,
    detailUrl: p.detailUrl,
  };
}

/**
 * 개인화 추천 — 구매내역(상품명 키워드 매칭) + 관심 카테고리 혼합.
 *
 * 구매 상품명 키워드를 최근 구매일수록 높은 가중치로 반영한다.
 * @param purchasedNames 구매 상품명 — **최근순(최신이 index 0)** 으로 전달해야 시간 가중치가 올바르게 적용됨.
 * @param interestCategories 사용자 관심 카테고리.
 */
export function getPersonalizedRecommendations(
  purchasedNames: string[],
  interestCategories: string[],
  limit = 8
): RecResult[] {
  if (allProducts.length === 0) return [];

  // 구매 상품명 키워드에 최근성(recency) 가중치 부여.
  // 최신 구매(index 0)는 1.0, 오래될수록 선형 감쇠하여 최저 0.4까지.
  const keywordWeight = new Map<string, number>();
  const n = purchasedNames.length;
  purchasedNames.forEach((name, i) => {
    const recency = n <= 1 ? 1 : 1 - 0.6 * (i / (n - 1)); // 1.0 → 0.4
    for (const kw of extractKeywords(name)) {
      // 같은 키워드가 여러 번 등장하면 가장 높은(최근) 가중치 유지
      keywordWeight.set(kw, Math.max(keywordWeight.get(kw) ?? 0, recency));
    }
  });

  const interestSet = new Set(interestCategories);

  // 구매내역도 관심사도 없으면 빈 결과 (호출부에서 fallback 처리)
  if (keywordWeight.size === 0 && interestSet.size === 0) return [];

  const scored = allProducts
    .filter((p) => !p.soldOut)
    .map((p) => {
      let score = 0;
      // 구매 키워드 매칭 (상품명 +3, items +1) × 최근성 가중치 — 구매내역을 가장 강하게 반영.
      // 매칭된 키워드 점수를 합산하되, 단일 키워드 폭주를 막기 위해 키워드별로 1회만 계산.
      for (const [kw, w] of keywordWeight) {
        if (p.name.includes(kw)) score += 3 * w;
        if (p.items.some((item) => item.includes(kw))) score += 1 * w;
      }
      // 관심 카테고리 보완 가산
      if (interestSet.has(p.category)) score += 2;
      return { p, score };
    })
    .filter(({ score }) => score > 0);

  return scored
    .sort((a, b) => b.score - a.score || b.p.discountRate - a.p.discountRate || a.p.price - b.p.price)
    .slice(0, limit)
    .map(({ p }) => toResult(p));
}

export function getRecommendations(
  productName: string,
  category?: string,
  limit = 6,
  excludeName?: string,
): Pick<Product, 'wrsC' | 'name' | 'price' | 'listPrice' | 'discountRate' | 'imgUrl' | 'category' | 'detailUrl'>[] {
  if (allProducts.length === 0) return [];

  const keywords = extractKeywords(productName);
  if (keywords.length === 0) return [];

  const allCandidates = allProducts.filter((p) => !p.soldOut && p.name !== excludeName);

  // 카테고리가 지정되면 그 카테고리를 벗어나지 않는다(호출부가 의도적으로 다른 카테고리를
  // 지정한 경우 — 예: 낙찰자에게 다른 카테고리를 추천 — 매칭 실패를 이유로 카테고리 밖의
  // 상품을 섞으면 그 의도가 무력화된다). 카테고리 미지정 시에만 전체 상품을 후보로 쓴다.
  const candidates = category
    ? allCandidates.filter((p) => p.category === category)
    : allCandidates;

  // 점수 계산: 키워드 매칭(키워드당 2점), items 매칭(키워드당 1점)
  const scoreOf = (pool: Product[]) =>
    pool.map((p) => {
      let score = 0;
      for (const kw of keywords) {
        if (p.name.includes(kw)) score += 2;
        if (p.items.some((item) => item.includes(kw))) score += 1;
      }
      return { p, score };
    }).filter(({ score }) => score > 0);

  const scored = scoreOf(candidates);

  // 카테고리 내 키워드 매칭이 0건이면, 카테고리는 유지한 채 할인율순으로 채운다
  // (카테고리 자체를 이탈하는 폴백은 하지 않는다).
  const finalPicks = scored.length > 0
    ? scored.sort((a, b) => b.score - a.score || a.p.price - b.p.price).map(({ p }) => p)
    : [...candidates].sort((a, b) => b.discountRate - a.discountRate || a.price - b.price);

  return finalPicks
    .slice(0, limit)
    .map((p) => ({
      wrsC: p.wrsC,
      name: p.name,
      price: p.price,
      listPrice: p.listPrice,
      discountRate: p.discountRate,
      imgUrl: p.imgUrl,
      category: p.category,
      detailUrl: p.detailUrl,
    }));
}

// 경매 종료 시 개인화 추천에 쓰이는 통일 상품 형태. 항상 농협몰 스냅샷(source:'nonghyup', detailUrl 포함)만 반환한다.
export interface RecommendedProduct {
  source: 'barofarm' | 'nonghyup';
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
  category: string;
  url?: string;
}

interface AuctionEndRecommendationParams {
  category?: string | null;
  productName: string;
  priceRange: number; // 종료된 경매 낙찰가(스코어링 기준가)
  userId?: string | null;
  isWinner?: boolean;
}

/**
 * 사용자의 낙찰(구매) 또는 입찰 이력이 1건이라도 있는지 확인.
 * 이력 없는 사용자에게 추천 슬라이더를 숨기기 위한 판단 기준.
 */
export async function hasBidOrPurchaseHistory(userId: number): Promise<boolean> {
  const [wonRows] = await pool.query<any[]>(
    `SELECT 1 FROM auctions WHERE top_bidder_id = ? AND status = 'ended' LIMIT 1`,
    [userId],
  );
  if (wonRows.length > 0) return true;

  const [bidRows] = await pool.query<any[]>(
    `SELECT 1 FROM bids WHERE bidder_id = ? LIMIT 1`,
    [userId],
  );
  return bidRows.length > 0;
}

// 낙찰자의 과거 낙찰+입찰 이력을 카테고리별로 집계해, 방금 낙찰받은 카테고리를 제외한
// 최선호 카테고리를 반환한다. 이력이 없으면 null(호출부에서 인기순 폴백 처리).
//
// 카테고리는 barofarm 자체 products 테이블 조인이 아니라 상품명(product_name) 기반
// inferCategoryFromName으로 추론한다 — products 테이블은 실사용 안 되는 소수 row뿐이라
// 조인 시 실제 낙찰/입찰 상품명("배추 10kg" 등)과 거의 매칭되지 않아 이 함수가 항상 null을
// 반환하는 죽은 코드였다(호출부는 항상 인기순 폴백으로 흐름).
async function getPreferredCategoryExcluding(
  userId: string,
  excludeCategory?: string | null,
): Promise<string | null> {
  const [wonRows] = await pool.query<any[]>(
    `SELECT product_name, COUNT(*) AS cnt
       FROM auctions
      WHERE top_bidder_id = ? AND status = 'ended'
      GROUP BY product_name`,
    [Number(userId)],
  );
  const [bidRows] = await pool.query<any[]>(
    `SELECT a.product_name AS product_name, COUNT(*) AS cnt
       FROM bids b
       JOIN auctions a ON a.id = b.auction_id
      WHERE b.bidder_id = ?
      GROUP BY a.product_name`,
    [Number(userId)],
  );

  const scoreByCategory = new Map<string, number>();
  for (const row of wonRows) {
    const cat = inferCategoryFromName(String(row.product_name));
    if (!cat) continue;
    scoreByCategory.set(cat, (scoreByCategory.get(cat) ?? 0) + Number(row.cnt) * 2);
  }
  for (const row of bidRows) {
    const cat = inferCategoryFromName(String(row.product_name));
    if (!cat) continue;
    scoreByCategory.set(cat, (scoreByCategory.get(cat) ?? 0) + Number(row.cnt) * 1);
  }
  if (excludeCategory) scoreByCategory.delete(excludeCategory);

  if (scoreByCategory.size === 0) return null;

  let best: string | null = null;
  let bestScore = -1;
  for (const [cat, score] of scoreByCategory) {
    if (score > bestScore) {
      best = cat;
      bestScore = score;
    }
  }
  return best;
}

// 낙찰자용: 방금 카테고리를 제외한 전체 카테고리 중 최근 24시간 인기순(낙찰 건수)으로 1개 선택.
// getPreferredCategoryExcluding과 동일한 이유로 products 테이블 조인 대신 상품명 추론을 사용한다.
async function getPopularCategoryExcluding(excludeCategory?: string | null): Promise<string | null> {
  const [endedRows] = await pool.query<any[]>(
    `SELECT product_name, COUNT(*) AS cnt
       FROM auctions
      WHERE status = 'ended' AND created_at > NOW() - INTERVAL 1 DAY
      GROUP BY product_name`,
  );
  const cntByCategory = new Map<string, number>();
  for (const row of endedRows) {
    const cat = inferCategoryFromName(String(row.product_name));
    if (!cat) continue;
    cntByCategory.set(cat, (cntByCategory.get(cat) ?? 0) + Number(row.cnt));
  }
  const sorted = [...cntByCategory.entries()].sort((a, b) => b[1] - a[1]);
  for (const [cat] of sorted) {
    if (cat !== excludeCategory) return cat;
  }
  const fallbackPool = ALL_CATEGORIES_FALLBACK.filter((c) => c !== excludeCategory);
  return fallbackPool.length > 0 ? fallbackPool[0] : null;
}

/**
 * 라이브 경매 종료 시 낙찰자/패찰자에게 보여줄 추천 상품 목록. 항상 농협몰 스냅샷에서만 추천한다.
 *
 * 낙찰자(isWinner=true): 방금 낙찰받은 카테고리는 제외하고, 과거 낙찰+입찰 이력 기반
 * 선호 카테고리(없으면 최근 인기 카테고리)로 방향을 바꾼다.
 * 패찰자(isWinner=false): 방금 낙찰된 카테고리 위주로 추천(같은 카테고리 그대로).
 */
export async function getAuctionEndRecommendations(
  { category, productName, priceRange: _priceRange, userId, isWinner }: AuctionEndRecommendationParams,
  limit = 8,
): Promise<RecommendedProduct[]> {
  // 카테고리 판정은 라이브 자체의 category 필드(방송 개설 시 선택, 개별 상품과 불일치 가능)가
  // 아니라 실제 경매 상품명에서 추론한 카테고리를 우선한다. 추론 실패 시에만 라이브 필드로 폴백.
  const inferredCategory = inferCategoryFromName(productName);
  const baseCategory = inferredCategory ?? category;

  // 낙찰자는 조회 대상 카테고리를 "선호 카테고리"로 치환한다(없으면 인기 카테고리 폴백).
  // 패찰자는 방금 낙찰된 카테고리 그대로 유지한다.
  let queryCategory = baseCategory;
  if (isWinner) {
    queryCategory = userId
      ? (await getPreferredCategoryExcluding(userId, baseCategory).catch(() => null)) ??
        (await getPopularCategoryExcluding(baseCategory).catch(() => null))
      : await getPopularCategoryExcluding(baseCategory).catch(() => null);
  }

  const fallback = queryCategory
    ? getRecommendations(productName, queryCategory, limit, productName)
    : getRecommendationsByCategories(ALL_CATEGORIES_FALLBACK, limit, productName);

  return fallback.map((p) => ({
    source: 'nonghyup' as const,
    id: p.wrsC,
    name: p.name,
    price: p.price,
    imageUrl: p.imgUrl,
    category: p.category,
    url: p.detailUrl,
  }));
}
