// 계좌이체 Mock Provider
// 계좌번호 끝자리 3333은 "실패 계좌"로 예약되어 있고, 3가지 실패 시나리오는 mockResult로 선택한다(§13):
//   accountInfo.last4 === '3333' 이고
//     mockResult 미지정        → 잔액부족 (INSUFFICIENT_BALANCE, 기본값)
//     mockResult === 'response_lost' → 계좌 인증실패 (AUTHENTICATION_FAILED)
//     mockResult === 'timeout'  → 타임아웃 (PAYMENT_TIMEOUT)
//   mockResult === 'success'   → 위 분기 전체를 무시하고 강제 승인 성공(예외 테스트용)
//   그 외 끝자리 → 승인 성공(기본값)
// 실계좌번호는 저장·요구하지 않는다 — 마스킹된 끝자리(last4)만 다룬다.

import {
  PaymentContext,
  CancelContext,
  ProviderResult,
  PaymentProvider,
  PaymentErrorCode,
} from '../provider';

const store = new Map<string, ProviderResult>(); // Phase 1: 메모리 임시 보관, 실 원장은 상위 서비스가 기록(TODO: Phase 3~4)

function timeoutResult(): ProviderResult {
  return {
    success: false,
    status: 'FAILED',
    failureCode: PaymentErrorCode.PAYMENT_TIMEOUT,
    failureMessage: '계좌이체 처리 시간 초과 (Mock)',
  };
}

function approveByAccountLast4(ctx: PaymentContext): ProviderResult {
  if (ctx.mockResult === 'success') {
    return { success: true, status: 'PAID', approvedAmount: ctx.amount, providerTransactionId: `mock_account_${ctx.paymentKey}` };
  }
  if (ctx.mockResult === 'timeout') {
    return timeoutResult();
  }
  if (ctx.accountInfo?.last4 === '3333') {
    if (ctx.mockResult === 'response_lost') {
      return {
        success: false,
        status: 'FAILED',
        failureCode: PaymentErrorCode.AUTHENTICATION_FAILED,
        failureMessage: '계좌 인증 실패 (Mock)',
      };
    }
    return {
      success: false,
      status: 'FAILED',
      failureCode: PaymentErrorCode.INSUFFICIENT_BALANCE,
      failureMessage: '계좌 잔액 부족 (Mock)',
    };
  }
  return {
    success: true,
    status: 'PAID',
    approvedAmount: ctx.amount,
    providerTransactionId: `mock_account_${ctx.paymentKey}`,
  };
}

class MockAccountProvider implements PaymentProvider {
  readonly name = 'mock_account';

  async readyPayment(ctx: PaymentContext): Promise<ProviderResult> {
    const result: ProviderResult = { success: true, status: 'READY' };
    store.set(ctx.paymentKey, result);
    return result;
  }

  async authenticatePayment(ctx: PaymentContext): Promise<ProviderResult> {
    if (ctx.accountInfo?.last4 === '3333' && ctx.mockResult === 'response_lost') {
      const result: ProviderResult = {
        success: false,
        status: 'FAILED',
        failureCode: PaymentErrorCode.AUTHENTICATION_FAILED,
        failureMessage: '계좌 인증 실패 (Mock)',
      };
      store.set(ctx.paymentKey, result);
      return result;
    }
    const result: ProviderResult = { success: true, status: 'AUTHORIZED' };
    store.set(ctx.paymentKey, result);
    return result;
  }

  async approvePayment(ctx: PaymentContext): Promise<ProviderResult> {
    const result = approveByAccountLast4(ctx);
    store.set(ctx.paymentKey, result);
    return result;
  }

  async failPayment(ctx: PaymentContext, reason?: string): Promise<ProviderResult> {
    const result: ProviderResult = {
      success: false,
      status: 'FAILED',
      failureMessage: reason ?? '계좌이체 실패 처리',
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

export const mockAccountProvider = new MockAccountProvider();
