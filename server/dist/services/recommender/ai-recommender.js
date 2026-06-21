"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIRecommender = void 0;
/**
 * AIRecommender — placeholder
 *
 * 발표 시 RuleBasedRecommender가 실패할 경우 OpenAI/Claude API 호출로 대체 예정.
 * 현재는 stub 상태이며, RECOMMENDER_TYPE=ai 환경변수로 선택 가능.
 *
 * 구현 예시 (미구현):
 *   POST https://api.openai.com/v1/chat/completions 또는
 *   POST https://api.anthropic.com/v1/messages
 *   → mall-products 목록 + AuctionWin 컨텍스트 전달 → JSON 추천 파싱
 */
class AIRecommender {
    async recommend(_win, _topN) {
        throw new Error('AIRecommender not yet implemented — set RECOMMENDER_TYPE=rule');
    }
}
exports.AIRecommender = AIRecommender;
