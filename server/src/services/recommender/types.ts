export type PriceTier = 'low' | 'mid' | 'high';

export interface Product {
  id: string;
  category: string;
  subCategory: string;
  name: string;
  origin: string;
  price: number;
  unit: string;
  description: string;
  imageUrl: string;
  tags: string[];
  complementaryHints: string[];
  priceTier: PriceTier;
  stock: number;
  createdAt: string;
}

export interface AuctionWin {
  auctionId: string;
  itemName: string;       // 예: "갈치 1박스"
  category: string;       // 바로팜 카테고리: 과일|채소|수산|축산|곡물|기타
  finalPrice: number;     // 낙찰가 (KRW)
  description?: string;   // 경매 상품 설명 (선택)
}

export interface Recommendation {
  product: Product;
  score: number;          // 0~1
  reasons: string[];      // 점수 기여 사유 (시연 시 UI 노출용)
}

export interface Recommender {
  recommend(win: AuctionWin, topN: number): Promise<Recommendation[]>;
}
