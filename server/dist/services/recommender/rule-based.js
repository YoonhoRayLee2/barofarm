"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuleBasedRecommender = void 0;
const catalog_1 = require("./catalog");
// ── 가중치 ────────────────────────────────────────────────────
const W_CATEGORY = 0.35;
const W_PRICE = 0.25;
const W_CONTENT = 0.25;
const W_DIVERSITY = 0.15;
// ── 바로팜 경매 카테고리 → mall 보완재 키워드 매핑 ─────────────
// 광범위 키워드 순서로 기재. 키워드가 mall 상품 complementaryHints에
// 포함되거나, 상품명·설명·tags에 포함되면 카테고리 신호로 사용한다.
const CATEGORY_BROAD_KEYWORDS = {
    '과일': ['과일', '농산물', '디저트', '잼', '착즙'],
    '채소': ['채소', '농산물', '나물', '쌈', '김치'],
    '수산': ['생선', '수산', '회', '해산물', '조개', '다시마', '멸치', '굴'],
    '축산': ['고기', '육류', '한우', '돼지', '닭', '소고기', '축산'],
    '곡물': ['곡물', '쌀', '잡곡', '견과', '두부', '콩'],
    '기타': [],
};
// ── 가격 티어 분류 ────────────────────────────────────────────
function classifyPriceTier(price) {
    if (price < 10000)
        return 'low';
    if (price < 50000)
        return 'mid';
    return 'high';
}
// ── 티어 거리 (0=일치, 1=인접, 2=반대) ───────────────────────
const TIER_ORDER = ['low', 'mid', 'high'];
function tierDistance(a, b) {
    return Math.abs(TIER_ORDER.indexOf(a) - TIER_ORDER.indexOf(b));
}
// ── 토큰화 (2자 이상 단어) ────────────────────────────────────
function tokenize(text) {
    return new Set(text
        .replace(/[^가-힣ᄀ-ᇿ㄰-㆏\w]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 2)
        .map(t => t.toLowerCase()));
}
// ── Jaccard 유사도 ────────────────────────────────────────────
function jaccard(a, b) {
    if (a.size === 0 && b.size === 0)
        return 0;
    let intersection = 0;
    for (const tok of a) {
        if (b.has(tok))
            intersection++;
    }
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
}
// ── 핵심 키워드 추출 (조사·단위 제거) ────────────────────────
function extractCoreKeyword(itemName) {
    // "갈치 1박스" → "갈치", "한우 등심 500g" → "한우"
    return itemName.trim().split(/\s+/)[0] ?? itemName;
}
// ── 카테고리 신호 점수 (0|0.3|0.6|1.0) ───────────────────────
function categoryScore(win, product) {
    const core = extractCoreKeyword(win.itemName);
    const broadKws = CATEGORY_BROAD_KEYWORDS[win.category] ?? [];
    const hints = product.complementaryHints.join(' ').toLowerCase();
    const productText = `${product.name} ${product.description} ${product.tags.join(' ')}`.toLowerCase();
    // 정확 키워드 매칭 (itemName 핵심어)
    if (hints.includes(core.toLowerCase()) || productText.includes(core.toLowerCase())) {
        return { score: 1.0, matchedKw: [core] };
    }
    // 광범위 키워드 매칭
    const matched = [];
    for (const kw of broadKws) {
        if (hints.includes(kw) || productText.includes(kw)) {
            matched.push(kw);
        }
    }
    if (matched.length > 0) {
        return { score: 0.6, matchedKw: matched.slice(0, 2) };
    }
    // 같은 상위 카테고리 (농산물 등)
    const categoryAlias = {
        '과일': ['농산물'],
        '채소': ['농산물'],
        '수산': ['수산물'],
        '축산': ['축산물'],
        '곡물': ['농산물'],
    };
    const aliases = categoryAlias[win.category] ?? [];
    if (aliases.includes(product.category)) {
        return { score: 0.3, matchedKw: [] };
    }
    return { score: 0, matchedKw: [] };
}
// ── 가격 신호 점수 ────────────────────────────────────────────
function priceScore(win, product) {
    const winTier = classifyPriceTier(win.finalPrice);
    const dist = tierDistance(winTier, product.priceTier);
    if (dist === 0)
        return 1.0;
    if (dist === 1)
        return 0.5;
    return 0.0;
}
// ── 콘텐츠 유사도 점수 ────────────────────────────────────────
function contentScore(win, product) {
    const srcText = `${win.itemName} ${win.description ?? ''}`;
    const dstText = `${product.name} ${product.description} ${product.tags.join(' ')}`;
    const srcTokens = tokenize(srcText);
    const dstTokens = tokenize(dstText);
    const commonTokens = [];
    for (const tok of srcTokens) {
        if (dstTokens.has(tok))
            commonTokens.push(tok);
    }
    return { score: jaccard(srcTokens, dstTokens), commonTokens: commonTokens.slice(0, 3) };
}
// ── RuleBasedRecommender ─────────────────────────────────────
class RuleBasedRecommender {
    async recommend(win, topN) {
        const products = (0, catalog_1.getMallProducts)();
        const winTier = classifyPriceTier(win.finalPrice);
        const scored = products.map(product => {
            const catResult = categoryScore(win, product);
            const pScore = priceScore(win, product);
            const ctResult = contentScore(win, product);
            const raw = W_CATEGORY * catResult.score +
                W_PRICE * pScore +
                W_CONTENT * ctResult.score;
            // diversity bonus는 후처리에서 적용
            const reasons = [];
            if (catResult.score > 0) {
                if (catResult.matchedKw.length > 0) {
                    reasons.push(`${win.category} 카테고리 매칭 (${catResult.matchedKw.join(', ')})`);
                }
                else {
                    reasons.push(`${win.category} 카테고리 연관`);
                }
            }
            if (pScore > 0) {
                const tierLabel = { low: '소액', mid: '중간', high: '고가' };
                reasons.push(`낙찰가대(${tierLabel[winTier]})와 ${pScore === 1.0 ? '일치' : '근접'}`);
            }
            if (ctResult.commonTokens.length > 0) {
                reasons.push(`공통 키워드: ${ctResult.commonTokens.join(', ')}`);
            }
            return { product, raw, reasons };
        });
        // 2차: raw 내림차순 정렬
        scored.sort((a, b) => b.raw - a.raw);
        // 3차: 다양성 후처리 — 상위 결과에서 동일 카테고리가 topN/2 초과 시 페널티
        const half = Math.ceil(topN / 2);
        const categoryCounts = {};
        const result = [];
        for (const s of scored) {
            if (result.length >= topN)
                break;
            const cat = s.product.category;
            const count = categoryCounts[cat] ?? 0;
            const penalty = count >= half ? 0.1 : 0;
            const finalScore = Math.max(0, s.raw + W_DIVERSITY * (penalty === 0 ? 1 : 0) - penalty);
            categoryCounts[cat] = count + 1;
            result.push({
                product: s.product,
                score: Math.round(finalScore * 1000) / 1000,
                reasons: s.reasons.length > 0 ? s.reasons.slice(0, 3) : ['일반 추천'],
            });
        }
        return result;
    }
}
exports.RuleBasedRecommender = RuleBasedRecommender;
