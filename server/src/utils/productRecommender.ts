import fs from 'fs';
import path from 'path';

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
