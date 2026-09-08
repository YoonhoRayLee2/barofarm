// 휴대폰 소액결제 Mock Provider
// 카드/계좌처럼 정해진 결정론적 실패 끝자리는 없다(스펙 §13 미지정) — 기본은 항상 승인 성공이며,
// mockResult로만 timeout/response_lost/success 시나리오를 강제할 수 있다.

import {
  PaymentContext,
  CancelContext,
  ProviderResult,
  PaymentProvider,
  resolveMockResult,
} from '../provider';

const store = new Map<string, ProviderResult>(); // Phase 1: 메모리 임시 보관, 실 원장은 상위 서비스가 기록(TODO: Phase 3~4)

class MockMobileProvider implements PaymentProvider {
  readonly name = 'mock_mobile';

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
    const result: ProviderResult = forced ?? {
      success: true,
      status: 'PAID',
      approvedAmount: ctx.amount,
      providerTransactionId: `mock_mobile_${ctx.paymentKey}`,
    };
    store.set(ctx.paymentKey, result);
    return result;
  }

  async failPayment(ctx: PaymentContext, reason?: string): Promise<ProviderResult> {
    const result: ProviderResult = {
      success: false,
      status: 'FAILED',
      failureMessage: reason ?? '휴대폰 소액결제 실패 처리',
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

export const mockMobileProvider = new MockMobileProvider();
