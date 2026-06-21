"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecommendationsByCategories = getRecommendationsByCategories;
exports.getRecommendations = getRecommendations;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// 서버 시작 시 1회 로드, 이후 메모리 캐시
let allProducts = [];
function loadProducts() {
    const filePath = path_1.default.resolve(__dirname, '../../data/products.json');
    try {
        const raw = fs_1.default.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw);
        allProducts = data.categories.flatMap((cat) => cat.products.map((p) => ({ ...p, category: cat.key })));
        console.log(`[productRecommender] loaded ${allProducts.length} products`);
    }
    catch (err) {
        console.error('[productRecommender] products.json load failed, recommendations will be empty:', err);
        allProducts = [];
    }
}
loadProducts();
// 상품명에서 의미있는 키워드 추출 (2자 이상 한글 단어)
function extractKeywords(name) {
    const tokens = name.split(/[\s,()[\]\/·★]+/);
    return tokens.filter((t) => /^[가-힣]{2,}$/.test(t));
}
function getRecommendationsByCategories(categories, limit = 8) {
    if (allProducts.length === 0 || categories.length === 0)
        return [];
    const candidates = allProducts.filter((p) => !p.soldOut && categories.includes(p.category));
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
function getRecommendations(productName, category, limit = 6) {
    if (allProducts.length === 0)
        return [];
    const keywords = extractKeywords(productName);
    if (keywords.length === 0)
        return [];
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
            if (p.name.includes(kw))
                score += 2;
            if (p.items.some((item) => item.includes(kw)))
                score += 1;
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
