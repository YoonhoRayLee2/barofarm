"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRecommender = createRecommender;
const rule_based_1 = require("./rule-based");
const ai_recommender_1 = require("./ai-recommender");
function createRecommender() {
    const type = process.env.RECOMMENDER_TYPE ?? 'rule';
    if (type === 'ai')
        return new ai_recommender_1.AIRecommender();
    return new rule_based_1.RuleBasedRecommender();
}
