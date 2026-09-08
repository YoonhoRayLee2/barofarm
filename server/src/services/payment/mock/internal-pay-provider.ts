// 바로팜페이(자체 머니/포인트) Mock Provider
// 외부 PG를 거치지 않는 내부 결제이므로 카드/계좌 실패 시나리오가 없다.
// 잔액 부족 등 실제 판정은 지갑 차감 로직(Phase 3~4)에서 이루어지며,
// 여기서는 mockResult로 강제한 시나리오 외에는 항상 승인 성공으로 처리한다.

import {
  PaymentContext,
  CancelContext,
  ProviderResult,
  PaymentProvider,
  resolveMockResult,
} from '../provider';

// Phase 1: DB 영속 없이 프로세스 메모리에만 최근 상태를 보관(조회 동작 확인용).
// 실제 원장 기록은 payments/payment_transactions 테이블에 상위 서비스가 기록한다(TODO: Phase 3~4).
const store = new Map<string, ProviderResult>();

class InternalPayProvider implements PaymentProvider {
  readonly name = 'internal';

  async readyPayment(ctx: PaymentContext): Promise<ProviderResult> {
    const result: ProviderResult = { success: true, status: 'READY' };
    store.set(ctx.paymentKey, result);
    return result;
  }

  async authenticatePayment(ctx: PaymentContext): Promise<ProviderResult> {
    // 자체페이는 별도 본인인증 단계가 없다(결제비밀번호 인증은 payment_auth_sessions에서 처리).
    const result: ProviderResult = { success: true, status: 'AUTHORIZED' };
    store.set(ctx.paymentKey, result);
    return result;
  }

  async approvePayment(ctx: PaymentContext): Promise<ProviderResult> {
    const forced = resolveMockResult(ctx.mockResult, ctx.amount);
    const result: ProviderResult = forced ?? {
      success: true,
      status: 'PAID',
      approvedAmount: ctx.amount,
      providerTransactionId: `internal_${ctx.paymentKey}`,
    };
    store.set(ctx.paymentKey, result);
    return result;
  }

  async failPayment(ctx: PaymentContext, reason?: string): Promise<ProviderResult> {
    const result: ProviderResult = {
      success: false,
      status: 'FAILED',
      failureMessage: reason ?? '내부 결제 실패 처리',
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

export const internalPayProvider = new InternalPayProvider();
