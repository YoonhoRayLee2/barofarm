/**
 * Payment Methods (deprecated) — 바로팜페이 통합 허브로 이전됨.
 * Route: /app/payment-methods → /app/pay-wallet 리다이렉트.
 *
 * 카드/계좌 등록·관리 기능은 pay-wallet(바로팜페이) 화면의 "등록 결제수단" 섹션으로 통합되었다.
 *
 * @module pages/payment-methods
 */

import { replace } from '/app/scripts/router.js';

export default async function load() {
  await replace('/app/pay-wallet');
  return document.createElement('div');
}
