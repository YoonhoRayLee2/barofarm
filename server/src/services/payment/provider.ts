// 결제 프로바이더 공통 인터페이스 — 실제 PG(Toss 등) 연동 시에도 이 인터페이스만 구현하면
// payment-service.ts의 registry에 등록하는 것만으로 교체 가능하다.
//
// Phase 1 범위: 인터페이스 정의 + 표준 오류코드 + Mock Provider 스켈레톤.
// 실제 지갑 차감/주문 생성/원장 기록(트랜잭션 오케스트레이션)은 Phase 3~4에서 payment-service.ts 상위 계층에 연결한다.

export type PaymentMethodType = 'MONEY' | 'CARD' | 'ACCOUNT' | 'MOBILE' | 'VIRTUAL_ACCOUNT';

export type PaymentStatus =
  | 'READY'
  | 'AUTHENTICATION_REQUIRED'
  | 'AUTHENTICATING'
  | 'AUTHORIZED'
  | 'PAID'
  | 'FAILED'
  | 'CANCELED'
  | 'PARTIALLY_CANCELED'
  | 'REFUNDED'
  | 'EXPIRED';

/**
 * Mock 전용 시나리오 강제 파라미터 (§13).
 * - 'success': 카드끝자리/계좌끝자리 등 기본 분기와 무관하게 강제 성공 처리
 * - 'timeout': PG 응답 시간초과 시뮬레이션
 * - 'response_lost': 승인은 됐으나 응답이 유실된 상황(상태조회로만 확인 가능) 시뮬레이션
 * 미지정 시 각 Provider의 기본 분기(카드/계좌 끝자리 등)를 따른다.
 * 실제 PG Provider 구현체에서는 이 필드를 무시한다.
 */
export type MockResult = 'success' | 'timeout' | 'response_lost';

/** 표준 오류코드 (§20) */
export enum PaymentErrorCode {
  PAYMENT_APPROVAL_FAILED = 'PAYMENT_APPROVAL_FAILED',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  INSUFFICIENT_LIMIT = 'INSUFFICIENT_LIMIT',
  CARD_LIMIT_EXCEEDED = 'CARD_LIMIT_EXCEEDED',
  PAYMENT_TIMEOUT = 'PAYMENT_TIMEOUT',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  RESPONSE_LOST = 'RESPONSE_LOST',
  INVALID_REQUEST = 'INVALID_REQUEST',
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  ALREADY_PROCESSED = 'ALREADY_PROCESSED',
}

/** 카드 결제 부가정보 — 마스킹된 정보만 다룬다. 실카드번호/CVC 저장·요구 금지. */
export interface CardInfo {
  last4: string;
  brand?: string;
}

/** 계좌이체 부가정보 — 마스킹된 정보만 다룬다. 실계좌번호 저장·요구 금지. */
export interface AccountInfo {
  last4: string;
  bankCode?: string;
}

/** Provider 메서드에 공통으로 전달되는 결제 컨텍스트 */
export interface PaymentContext {
  paymentKey: string;
  orderId: number;
  orderNumber: string;
  method: PaymentMethodType;
  /** 원 단위 금액 */
  amount: number;
  idempotencyKey: string;
  cardInfo?: CardInfo;
  accountInfo?: AccountInfo;
  /** Mock Provider 시나리오 강제용. 실제 PG 연동 시 무시됨. */
  mockResult?: MockResult;
  metadata?: Record<string, unknown>;
}

/** 취소/부분취소/환불 요청 컨텍스트 */
export interface CancelContext {
  paymentKey: string;
  providerTransactionId?: string;
  /** 원 단위 취소 금액 */
  cancelAmount: number;
  reason?: string;
  idempotencyKey: string;
}

/** Provider 처리 결과 — payments/payment_transactions 테이블에 매핑되는 표준 형태 */
export interface ProviderResult {
  success: boolean;
  status: PaymentStatus;
  approvedAmount?: number;
  canceledAmount?: number;
  providerTransactionId?: string;
  failureCode?: PaymentErrorCode;
  failureMessage?: string;
  raw?: Record<string, unknown>;
}

/**
 * 결제 프로바이더 공통 인터페이스.
 * Mock(internal/card/account/mobile/virtual-account) 및 향후 실제 PG(TossPaymentsProvider 등)가
 * 이 인터페이스를 구현한다. payment-service.ts는 이 인터페이스만 알면 된다.
 */
export interface PaymentProvider {
  readonly name: string;

  /** 결제 준비(결제창 오픈 전 사전 등록). 가상계좌는 여기서 계좌 발급까지 수행. */
  readyPayment(ctx: PaymentContext): Promise<ProviderResult>;
  /** 본인/카드/계좌 인증 단계. 인증이 불필요한 수단(MONEY 등)은 즉시 통과 처리. */
  authenticatePayment(ctx: PaymentContext): Promise<ProviderResult>;
  /** 승인 요청 */
  approvePayment(ctx: PaymentContext): Promise<ProviderResult>;
  /** 승인 실패 처리(명시적 실패 마킹) */
  failPayment(ctx: PaymentContext, reason?: string): Promise<ProviderResult>;
  /** 전체 취소 */
  cancelPayment(ctx: CancelContext): Promise<ProviderResult>;
  /** 부분 취소 */
  partialCancelPayment(ctx: CancelContext): Promise<ProviderResult>;
  /** 환불(승인 완료 건에 대한 사후 환불) */
  refundPayment(ctx: CancelContext): Promise<ProviderResult>;
  /** 단건 조회 */
  getPayment(paymentKey: string): Promise<ProviderResult | null>;
  /** 상태만 조회(response_lost 등 응답 유실 시 재확인용) */
  getPaymentStatus(paymentKey: string): Promise<PaymentStatus | null>;
}

/**
 * mockResult 공통 처리 헬퍼 — 5개 Mock Provider가 공유.
 * 'success' | 'timeout'은 카드/계좌 끝자리 등 기본 분기보다 우선 적용된다.
 * 'response_lost'는 여기서는 범용 처리만 하고, 계좌 Provider처럼 도메인 특화 의미가
 * 필요한 경우 해당 Provider에서 개별 분기한다(§13 참고, mock-account-provider.ts 주석 참조).
 */
export function resolveMockResult(mockResult: MockResult | undefined, amount: number): ProviderResult | null {
  if (!mockResult || mockResult === 'success') {
    if (mockResult === 'success') {
      return { success: true, status: 'PAID', approvedAmount: amount };
    }
    return null; // 미지정 → Provider 기본 분기(카드/계좌 끝자리 등) 수행
  }
  if (mockResult === 'timeout') {
    return {
      success: false,
      status: 'FAILED',
      failureCode: PaymentErrorCode.PAYMENT_TIMEOUT,
      failureMessage: '결제 처리 시간 초과 (Mock)',
    };
  }
  // response_lost
  return {
    success: false,
    status: 'AUTHENTICATING',
    failureCode: PaymentErrorCode.RESPONSE_LOST,
    failureMessage: 'PG 응답 유실 (Mock) — 상태 조회로 재확인 필요',
  };
}
