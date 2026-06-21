"use strict";
/**
 * 추천 알고리즘 데모 스크립트
 *
 * 실행:  npx ts-node server/src/services/recommender/__demo__.ts
 */
Object.defineProperty(exports, "__esModule", { value: true });
const rule_based_1 = require("./rule-based");
const recommender = new rule_based_1.RuleBasedRecommender();
const scenarios = [
    {
        auctionId: 'demo-001',
        itemName: '갈치 1박스',
        category: '수산',
        finalPrice: 35000,
        description: '제주산 은갈치 1박스, 5~6마리 손질 완료',
    },
    {
        auctionId: 'demo-002',
        itemName: '한우 등심 500g',
        category: '축산',
        finalPrice: 80000,
        description: '1++ 등급 한우 등심, 마블링 최상',
    },
    {
        auctionId: 'demo-003',
        itemName: '충주 사과 5kg',
        category: '과일',
        finalPrice: 25000,
        description: '무농약 재배 당도 13Brix 이상',
    },
];
async function run() {
    for (const win of scenarios) {
        console.log('\n' + '='.repeat(60));
        console.log(`낙찰 상품: ${win.itemName}  |  카테고리: ${win.category}  |  낙찰가: ${win.finalPrice.toLocaleString()}원`);
        console.log('='.repeat(60));
        const recs = await recommender.recommend(win, 5);
        recs.forEach((r, i) => {
            console.log(`\n  ${i + 1}. [${r.product.category}] ${r.product.name}  ₩${r.product.price.toLocaleString()}  (score: ${r.score})`);
            r.reasons.forEach(reason => console.log(`     - ${reason}`));
        });
    }
    console.log('\n');
}
run().catch(err => {
    console.error(err);
    process.exit(1);
});
