import path from 'path';
import fs from 'fs';
import type { Product } from './types';

// mall-products.json 을 모듈 로드 시 1회만 읽어 캐시
const dataPath = path.join(__dirname, '..', '..', '..', 'public', 'data', 'mall-products.json');
const _cache: Product[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8')) as Product[];

export function getMallProducts(): Product[] {
  return _cache;
}

export function getProductById(id: string): Product | null {
  return _cache.find(p => p.id === id) ?? null;
}
