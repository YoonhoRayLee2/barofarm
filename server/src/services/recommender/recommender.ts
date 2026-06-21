import type { Recommender } from './types';
import { RuleBasedRecommender } from './rule-based';
import { AIRecommender } from './ai-recommender';

export function createRecommender(): Recommender {
  const type = process.env.RECOMMENDER_TYPE ?? 'rule';
  if (type === 'ai') return new AIRecommender();
  return new RuleBasedRecommender();
}

export type { Recommender };
export type { AuctionWin, Recommendation, Product } from './types';
