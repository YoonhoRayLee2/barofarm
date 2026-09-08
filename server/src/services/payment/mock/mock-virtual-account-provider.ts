// 가상계좌 Mock Provider
// 카드/계좌와 달리 즉시 승인되지 않는다: readyPayment에서 가상계좌를 발급(마스킹된 번호)하고
// 입금 대기(READY) 상태로 두었다가, approvePayment 호출 시점에 "입금 확인"을 시뮬레이션한다.
// mockResult로 timeout/response_lost/success 시나리오를 강제할 수 있다(§13).

import {
  PaymentContext,
  CancelContext,
  ProviderResult,
  PaymentProvider,
  resolveMockResult,
} from '../provider';

const store = new Map<string, ProviderResult>(); // Phase 1: 메모리 임시 보관, 실 원장은 상위 서비스가 기록(TODO: Phase 3~4)

function issueVirtualAccountNumber(paymentKey: string): string {
  // 실계좌 발급 없이 마스킹된 Mock 가상계좌번호만 생성한다.
  const suffix = paymentKey.slice(-4).padStart(4, '0');
  return `MOCK-VBANK-****-${suffix}`;
}

class MockVirtualAccountProvider implements PaymentProvider {
  readonly name = 'mock_virtual_account';

  async readyPayment(ctx: PaymentContext): Promise<ProviderResult> {
    const result: ProviderResult = {
      success: true,
      status: 'READY',
      raw: { virtualAccountNumber: issueVirtualAccountNumber(ctx.paymentKey) },
    };
    store.set(ctx.paymentKey, result);
    return result;
  }

  async authenticatePayment(ctx: PaymentContext): Promise<ProviderResult> {
    // 가상계좌는 별도 본인인증 단계 없이 입금 대기 상태를 유지한다.
    const existing = store.get(ctx.paymentKey);
    const result: ProviderResult = existing ?? { success: true, status: 'READY' };
    return result;
  }

  /** 입금 확인(가상계좌 결제완료) 시뮬레이션 */
  async approvePayment(ctx: PaymentContext): Promise<ProviderResult> {
    const forced = resolveMockResult(ctx.mockResult, ctx.amount);
    const result: ProviderResult = forced ?? {
      success: true,
      status: 'PAID',
      approvedAmount: ctx.amount,
      providerTransactionId: `mock_vbank_${ctx.paymentKey}`,
    };
    store.set(ctx.paymentKey, result);
    return result;
  }

  async failPayment(ctx: PaymentContext, reason?: string): Promise<ProviderResult> {
    const result: ProviderResult = {
      success: false,
      status: 'EXPIRED',
      failureMessage: reason ?? '가상계좌 입금기한 만료 처리',
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

export const mockVirtualAccountProvider = new MockVirtualAccountProvider();
