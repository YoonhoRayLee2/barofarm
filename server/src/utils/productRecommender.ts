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

export function getRecommendationsByCategories(
  categories: string[],
  limit = 8
): Pick<Product, 'wrsC' | 'name' | 'price' | 'listPrice' | 'discountRate' | 'imgUrl' | 'category' | 'detailUrl'>[] {
  if (allProducts.length === 0 || categories.length === 0) return [];

  const candidates = allProducts.filter(
    (p) => !p.soldOut && categories.includes(p.category)
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
  limit = 6
): Pick<Product, 'wrsC' | 'name' | 'price' | 'listPrice' | 'discountRate' | 'imgUrl' | 'category' | 'detailUrl'>[] {
  if (allProducts.length === 0) return [];

  const keywords = extractKeywords(productName);
  if (keywords.length === 0) return [];

  let candidates = allProducts.filter((p) => !p.soldOut);

  // 같은 카테고리 우선
  if (category) {
    const sameCat = candidates.filter((p) => p.category === category);
    if (sameCat.length > 0) {
      candidates = sameCat;
    }
  }

  // 점수 계산: 키워드 매칭(키워드당 2점), items 매칭(키워드당 1점)
  const scored = candidates.map((p) => {
    let score = 0;
    for (const kw of keywords) {
      if (p.name.includes(kw)) score += 2;
      if (p.items.some((item) => item.includes(kw))) score += 1;
    }
    return { p, score };
  });

  return scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.p.price - b.p.price)
    .slice(0, limit)
    .map(({ p }) => ({
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

// 경매 종료 시 개인화 추천에 쓰이는 통일 상품 형태.
// barofarm 자체 상품(source:'barofarm')은 url 없음 — 프론트가 내부 id로 라우팅.
// 농협몰 스냅샷(source:'nonghyup')은 detailUrl 포함.
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
}

/**
 * 라이브 경매 종료 시 낙찰자/패찰자에게 보여줄 개인화 추천 상품 목록.
 * 1순위: barofarm 자체 products 테이블에서 다중신호 스코어링.
 * 2순위: 결과가 부족하면(6개 미만) 농협몰 스냅샷(productRecommender 기존 함수)으로 보강.
 */
export async function getAuctionEndRecommendations(
  { category, productName, priceRange, userId }: AuctionEndRecommendationParams,
  limit = 8,
): Promise<RecommendedProduct[]> {
  const results: RecommendedProduct[] = [];

  try {
    if (category) {
      const [candidateRows] = await pool.query<any[]>(
        `SELECT id, name, price, category, image_url, created_at
           FROM products
          WHERE category = ? AND status = 'active'`,
        [category],
      );

      if (candidateRows.length > 0) {
        // 실시간 인기도: 최근 24시간 내 같은 카테고리 낙찰 건수(상품명 매칭)를 상품별로 집계.
        // auctions에는 product_id가 없으므로 product_name 일치로 근사한다.
        const [popularityRows] = await pool.query<any[]>(
          `SELECT product_name, COUNT(*) AS cnt
             FROM auctions
            WHERE status = 'ended' AND created_at > NOW() - INTERVAL 1 DAY
            GROUP BY product_name`,
        );
        const popularityByName = new Map<string, number>(
          popularityRows.map((r) => [String(r.product_name), Number(r.cnt)]),
        );

        // 개인 낙찰 이력의 카테고리 집합 — 협업 신호(+2점)용.
        let userCategorySet = new Set<string>();
        if (userId) {
          const [historyRows] = await pool.query<any[]>(
            `SELECT DISTINCT p.category AS category
               FROM auctions a
               JOIN products p ON p.name = a.product_name
              WHERE a.top_bidder_id = ? AND a.status = 'ended'`,
            [Number(userId)],
          );
          userCategorySet = new Set(historyRows.map((r) => String(r.category)).filter(Boolean));
        }

        const now = Date.now();
        const scored = candidateRows.map((row) => {
          let score = 0;
          const price = Number(row.price);

          // 카테고리 일치 (조회 자체가 카테고리 필터이므로 항상 성립)
          score += 3;

          // 가격대 유사도
          if (priceRange > 0) {
            const diffRatio = Math.abs(price - priceRange) / priceRange;
            if (diffRatio <= 0.3) score += 2;
            else if (diffRatio <= 0.5) score += 1;
          }

          // 실시간 인기도 (로그 스케일 근사: min(count, 5))
          const popCount = popularityByName.get(String(row.name)) ?? 0;
          score += Math.min(popCount, 5);

          // 개인 낙찰 이력 카테고리 겹침
          if (userCategorySet.has(String(row.category))) score += 2;

          // 최신 등록 가산 (최근 7일 이내 소폭 가산, 0~1점)
          const createdAt = new Date(row.created_at).getTime();
          const daysAgo = (now - createdAt) / (24 * 60 * 60 * 1000);
          score += daysAgo <= 7 ? Math.max(0, 1 - daysAgo / 7) : 0;

          return { row, score };
        });

        scored.sort((a, b) => b.score - a.score);
        for (const { row } of scored.slice(0, limit)) {
          results.push({
            source: 'barofarm',
            id: String(row.id),
            name: row.name,
            price: Number(row.price),
            imageUrl: row.image_url ?? null,
            category: row.category,
          });
        }
      }
    }
  } catch (err) {
    console.error('[productRecommender] getAuctionEndRecommendations DB 조회 실패:', (err as Error).message);
  }

  // 2순위 보강: barofarm 결과가 부족하면 농협몰 스냅샷으로 채운다.
  if (results.length < 6) {
    const fallbackLimit = limit - results.length;
    const fallback = category
      ? getRecommendations(productName, category, fallbackLimit)
      : getRecommendationsByCategories(ALL_CATEGORIES_FALLBACK, fallbackLimit);
    for (const p of fallback) {
      results.push({
        source: 'nonghyup',
        id: p.wrsC,
        name: p.name,
        price: p.price,
        imageUrl: p.imgUrl,
        category: p.category,
        url: p.detailUrl,
      });
    }
  }

  return results.slice(0, limit);
}
