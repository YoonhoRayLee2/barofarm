// 결제/지갑/경매인증 정책 — 하드코딩 금지, 전 항목 env override 가능
// 신규 정책 추가 시 이 파일에만 추가하고 다른 모듈에서 매직넘버로 재구현하지 말 것.

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function envBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

/** 인증세션(payment_auth_sessions) 만료 정책 — 목적(purpose)별 개별 만료시간 */
export interface AuthSessionPolicy {
  /** 비활동(마지막 사용 이후) 만료 — 분 단위 */
  inactivityExpiryMinutes: number;
  /** 세션 생성 후 절대 만료 — 분 단위 */
  absoluteExpiryMinutes: number;
}

export const authSessionPolicy = {
  default: {
    inactivityExpiryMinutes: envInt('PAY_AUTH_SESSION_INACTIVITY_MIN', 30),
    absoluteExpiryMinutes: envInt('PAY_AUTH_SESSION_ABSOLUTE_MIN', 120),
  } as AuthSessionPolicy,
  auctionEntry: {
    inactivityExpiryMinutes: envInt('PAY_AUTH_SESSION_AUCTION_INACTIVITY_MIN', 30),
    absoluteExpiryMinutes: envInt('PAY_AUTH_SESSION_AUCTION_ABSOLUTE_MIN', 120),
  } as AuthSessionPolicy,
  payment: {
    inactivityExpiryMinutes: envInt('PAY_AUTH_SESSION_PAYMENT_INACTIVITY_MIN', 30),
    absoluteExpiryMinutes: envInt('PAY_AUTH_SESSION_PAYMENT_ABSOLUTE_MIN', 120),
  } as AuthSessionPolicy,
};

/** 결제비밀번호 잠금 정책 */
export const lockoutPolicy = {
  /** 연속 실패 임계치 — 도달 시 잠금 */
  maxFailedAttempts: envInt('PAY_LOCKOUT_MAX_FAILED_ATTEMPTS', 5),
  /** 잠금 지속시간 — 분 단위 */
  lockoutMinutes: envInt('PAY_LOCKOUT_MINUTES', 10),
};

/** 재인증(승급 인증)이 요구되는 기준 금액 — 이상일 때 재인증 트리거 */
export const reauthThresholds = {
  /** 일반 결제 재인증 기준금액 (원) */
  highValuePayment: envInt('PAY_REAUTH_HIGH_VALUE_PAYMENT', 1_000_000),
  /** 고액 입찰 재인증 기준금액 (원) */
  highValueBid: envInt('PAY_REAUTH_HIGH_VALUE_BID', 10_000_000),
};

/** 결제비밀번호 정책 */
export const paymentPasswordPolicy = {
  /** 자릿수 */
  digitLength: envInt('PAY_PASSWORD_DIGIT_LENGTH', 6),
  /** true면 0000/1111 같은 단순/연속 번호 등록을 거부 */
  rejectSimplePatterns: envBool('PAY_PASSWORD_REJECT_SIMPLE', true),
};

export type RoundingPolicy = 'FLOOR' | 'ROUND' | 'CEIL';

/** 적립률 및 적립금 절사 정책 — 자체페이(바로팜페이)와 카드/계좌 결제 시 적립률이 다름 */
export const earnRatePolicy = {
  /** 바로팜페이(자체 머니) 결제 적립률 (0.02 = 2%) */
  barofarmPayRate: envInt('PAY_EARN_RATE_BAROFARM_PAY_BP', 200) / 10_000,
  /** 카드/계좌 등 외부 결제수단 적립률 (0.005 = 0.5%) */
  externalPaymentRate: envInt('PAY_EARN_RATE_EXTERNAL_BP', 50) / 10_000,
  /** 적립금 계산 시 원 단위 미만 절사/반올림/올림 정책 */
  rounding: (process.env.PAY_EARN_ROUNDING as RoundingPolicy) || 'FLOOR',
};

/**
 * 포인트 사용 우선순위 (낮은 index가 먼저 소진됨)
 * 기본: 만료임박 이벤트포인트 > 테스트포인트 > 일반적립포인트 > 보상포인트
 */
export type PointAssetType = 'EVENT_POINT' | 'TEST_POINT' | 'EARNED_POINT' | 'COMPENSATION_POINT';

export const pointUsePriority: PointAssetType[] = (
  process.env.PAY_POINT_USE_PRIORITY?.split(',').map((s) => s.trim()).filter(Boolean) as PointAssetType[]
) ?? ['EVENT_POINT', 'TEST_POINT', 'EARNED_POINT', 'COMPENSATION_POINT'];

if (pointUsePriority.length === 0) {
  pointUsePriority.push('EVENT_POINT', 'TEST_POINT', 'EARNED_POINT', 'COMPENSATION_POINT');
}

/** Feature Flag — 운영 환경 기본값에 주의 (테스트 포인트는 운영 기본 OFF) */
export const featureFlags = {
  /** 테스트 포인트 지급/사용 허용 여부 — 운영 기본 false */
  TEST_POINT_ENABLED: envBool('PAY_FF_TEST_POINT_ENABLED', false),
  /** 개발자 전용 도구(관리자 화면 내 디버그 패널 등) 노출 여부 */
  DEVELOPER_TOOLS_ENABLED: envBool('PAY_FF_DEVELOPER_TOOLS_ENABLED', false),
  /** Mock PG 사용 여부 — false면 실제 PG 연동 필요(Phase 1에서는 실제 PG 미구현) */
  MOCK_PG_ENABLED: envBool('PAY_FF_MOCK_PG_ENABLED', true),
};

/**
 * 어드민 테스트포인트/테스트머니 지급·회수 정책 (§10).
 * TEST_POINT_ENABLED가 true여도, 운영 환경에서는 이 정책이 2차 안전장치로 추가 차단한다
 * (플래그 오설정만으로 운영에 테스트 자산이 지급되는 사고를 막기 위한 방어적 장치).
 */
export const testPointPolicy = {
  /** 운영 환경에서 테스트포인트/테스트머니 지급을 하드 차단 — 기본값은 NODE_ENV=production이면 true */
  PRODUCTION_DISABLED: envBool('PAY_TEST_POINT_PRODUCTION_DISABLED', process.env.NODE_ENV === 'production'),
  /** PRODUCTION_DISABLED가 true여도 예외적으로 테스트 자산 지급을 허용할 사용자ID(QA 계정 등) */
  allowedUserIds: new Set(
    (process.env.PAY_TEST_POINT_ALLOWED_USER_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isFinite(n)),
  ),
};

/** REST 인증형 입찰(§22) 정책 — 경매별 auctions.minimum_bid_increment가 없을 때의 기본 최소 입찰단위 */
export const bidPolicy = {
  defaultMinimumIncrement: envInt('PAY_BID_DEFAULT_MIN_INCREMENT', 1_000),
};

export const paymentPolicy = {
  authSession: authSessionPolicy,
  lockout: lockoutPolicy,
  reauthThresholds,
  password: paymentPasswordPolicy,
  earnRate: earnRatePolicy,
  pointUsePriority,
  featureFlags,
  testPoint: testPointPolicy,
  bid: bidPolicy,
};

export default paymentPolicy;
