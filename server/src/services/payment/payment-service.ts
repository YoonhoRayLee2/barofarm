// PaymentService 파사드 — 상위 레이어(주문/결제 오케스트레이션, Phase 3~4)는 이 클래스만 알면 된다.
// method(결제수단) 또는 provider명으로 실제 PaymentProvider 구현체를 선택한다.
// 실제 PG(TossPaymentsProvider 등) 추가 시 registerProvider()로 등록하고
// methodDefaults만 교체하면 되므로, 호출부(라우트/서비스) 코드는 변경하지 않아도 된다.

import {
  PaymentContext,
  CancelContext,
  ProviderResult,
  PaymentProvider,
  PaymentMethodType,
  PaymentStatus,
} from './provider';

export class PaymentService {
  private readonly registry = new Map<string, PaymentProvider>();
  private readonly methodDefaults = new Map<PaymentMethodType, string>();

  /** Provider 구현체 등록. 동일 name으로 재등록 시 덮어쓴다(실제 PG 전환 시 사용). */
  registerProvider(providerName: string, provider: PaymentProvider): void {
    this.registry.set(providerName, provider);
  }

  /** 결제수단(method)의 기본 Provider명 설정 */
  setMethodDefault(method: PaymentMethodType, providerName: string): void {
    this.methodDefaults.set(method, providerName);
  }

  getProvider(providerName: string): PaymentProvider {
    const provider = this.registry.get(providerName);
    if (!provider) {
      throw new Error(`[PaymentService] provider not registered: ${providerName}`);
    }
    return provider;
  }

  /** method 기본값 또는 명시적 providerNameOverride로 Provider 결정 */
  resolveProviderForMethod(method: PaymentMethodType, providerNameOverride?: string): PaymentProvider {
    const providerName = providerNameOverride ?? this.methodDefaults.get(method);
    if (!providerName) {
      throw new Error(`[PaymentService] no default provider for method: ${method}`);
    }
    return this.getProvider(providerName);
  }

  readyPayment(ctx: PaymentContext, providerNameOverride?: string): Promise<ProviderResult> {
    return this.resolveProviderForMethod(ctx.method, providerNameOverride).readyPayment(ctx);
  }

  authenticatePayment(ctx: PaymentContext, providerNameOverride?: string): Promise<ProviderResult> {
    return this.resolveProviderForMethod(ctx.method, providerNameOverride).authenticatePayment(ctx);
  }

  approvePayment(ctx: PaymentContext, providerNameOverride?: string): Promise<ProviderResult> {
    return this.resolveProviderForMethod(ctx.method, providerNameOverride).approvePayment(ctx);
  }

  failPayment(ctx: PaymentContext, reason?: string, providerNameOverride?: string): Promise<ProviderResult> {
    return this.resolveProviderForMethod(ctx.method, providerNameOverride).failPayment(ctx, reason);
  }

  // 취소/환불/조회는 CancelContext·paymentKey만으로는 method를 알 수 없으므로 providerName을 명시적으로 받는다.
  cancelPayment(providerName: string, ctx: CancelContext): Promise<ProviderResult> {
    return this.getProvider(providerName).cancelPayment(ctx);
  }

  partialCancelPayment(providerName: string, ctx: CancelContext): Promise<ProviderResult> {
    return this.getProvider(providerName).partialCancelPayment(ctx);
  }

  refundPayment(providerName: string, ctx: CancelContext): Promise<ProviderResult> {
    return this.getProvider(providerName).refundPayment(ctx);
  }

  getPayment(providerName: string, paymentKey: string): Promise<ProviderResult | null> {
    return this.getProvider(providerName).getPayment(paymentKey);
  }

  getPaymentStatus(providerName: string, paymentKey: string): Promise<PaymentStatus | null> {
    return this.getProvider(providerName).getPaymentStatus(paymentKey);
  }
}
