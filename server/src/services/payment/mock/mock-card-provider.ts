// 카드결제 Mock Provider
// 카드번호 끝자리로 결정론적 시나리오를 재현한다(§13):
//   0000 → 승인 성공
//   1111 → 승인 실패 (PAYMENT_APPROVAL_FAILED)
//   2222 → 한도초과 (CARD_LIMIT_EXCEEDED)
//   그 외 → 승인 성공(기본값)
// mockResult가 명시되면 끝자리 분기보다 우선한다(예: 0000 카드에 timeout 강제 등 예외 테스트용).
// 실카드번호/CVC는 저장·요구하지 않는다 — 마스킹된 끝자리(last4)만 다룬다.

import {
  PaymentContext,
  CancelContext,
  ProviderResult,
  PaymentProvider,
  PaymentErrorCode,
  resolveMockResult,
} from '../provider';

const store = new Map<string, ProviderResult>(); // Phase 1: 메모리 임시 보관, 실 원장은 상위 서비스가 기록(TODO: Phase 3~4)

function approveByCardLast4(ctx: PaymentContext): ProviderResult {
  const last4 = ctx.cardInfo?.last4;
  if (last4 === '1111') {
    return {
      success: false,
      status: 'FAILED',
      failureCode: PaymentErrorCode.PAYMENT_APPROVAL_FAILED,
      failureMessage: '카드 승인 실패 (Mock)',
    };
  }
  if (last4 === '2222') {
    return {
      success: false,
      status: 'FAILED',
      failureCode: PaymentErrorCode.CARD_LIMIT_EXCEEDED,
      failureMessage: '카드 한도초과 (Mock)',
    };
  }
  // '0000' 및 그 외 모든 끝자리는 기본 성공 처리
  return {
    success: true,
    status: 'PAID',
    approvedAmount: ctx.amount,
    providerTransactionId: `mock_card_${ctx.paymentKey}`,
  };
}

class MockCardProvider implements PaymentProvider {
  readonly name = 'mock_card';

  async readyPayment(ctx: PaymentContext): Promise<ProviderResult> {
    const result: ProviderResult = { success: true, status: 'READY' };
    store.set(ctx.paymentKey, result);
    return result;
  }

  async authenticatePayment(ctx: PaymentContext): Promise<ProviderResult> {
    const forced = resolveMockResult(ctx.mockResult, ctx.amount);
    const result: ProviderResult = forced ?? { success: true, status: 'AUTHORIZED' };
    store.set(ctx.paymentKey, result);
    return result;
  }

  async approvePayment(ctx: PaymentContext): Promise<ProviderResult> {
    const forced = resolveMockResult(ctx.mockResult, ctx.amount);
    const result = forced ?? approveByCardLast4(ctx);
    store.set(ctx.paymentKey, result);
    return result;
  }

  async failPayment(ctx: PaymentContext, reason?: string): Promise<ProviderResult> {
    const result: ProviderResult = {
      success: false,
      status: 'FAILED',
      failureMessage: reason ?? '카드 결제 실패 처리',
    };
    store.set(ctx.paymentKey, result);
    return result;
  }

  async cancelPayment(ctx: CancelContext): Promise<ProviderResult> {
    const result: ProviderResult = { success: true, status: 'CANCELED', canceledAmount: ctx.cancelAmount };
    store.set(ctx.paymentKey, result);
    return result;
  }

  async partialCancelPayment(ctx: CancelContext): Promise<ProviderResult> {
    const result: ProviderResult = {
      success: true,
      status: 'PARTIALLY_CANCELED',
      canceledAmount: ctx.cancelAmount,
    };
    store.set(ctx.paymentKey, result);
    return result;
  }

  async refundPayment(ctx: CancelContext): Promise<ProviderResult> {
    const result: ProviderResult = { success: true, status: 'REFUNDED', canceledAmount: ctx.cancelAmount };
    store.set(ctx.paymentKey, result);
    return result;
  }

  async getPayment(paymentKey: string): Promise<ProviderResult | null> {
    return store.get(paymentKey) ?? null;
  }

  async getPaymentStatus(paymentKey: string) {
    return store.get(paymentKey)?.status ?? null;
  }
}

export const mockCardProvider = new MockCardProvider();
