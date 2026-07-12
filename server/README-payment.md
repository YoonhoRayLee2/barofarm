# Barofarm 결제 시스템 (Payment System)

> **⚠️ 이 결제 시스템은 실제 PG(전자결제대행사)가 연동되지 않은 Mock 서비스입니다.**
>
> - 실제 카드번호 · 계좌번호 · CVC 등 진짜 금융정보를 어떤 화면에도 입력하지 마십시오. 카드/계좌 결제는
>   끝자리(last4) 4자리로 시나리오를 흉내내는 것뿐이며, 실제로 승인·매입·이체가 일어나지 않습니다.
> - 테스트포인트(TEST_POINT)·테스트머니는 **실자산이 아닙니다.** 어드민 화면에서 지급/회수할 수 있지만
>   실제 현금 가치가 없고, 운영 환경에서는 기본적으로 비활성화되어 있습니다(아래 §Feature Flag 참고).
> - 결제비밀번호(6자리 PIN)는 bcrypt 해시로만 저장되며 **원문은 어떤 경우에도 저장·로그·응답에 남지
>   않습니다.**
> - **운영 배포 전 반드시 확인**: `PAY_FF_DEVELOPER_TOOLS_ENABLED`, `PAY_FF_TEST_POINT_ENABLED`는
>   운영 환경에서 `false`여야 합니다(§운영 체크리스트 참고). `PAY_TEST_POINT_PRODUCTION_DISABLED`는
>   `NODE_ENV=production`이면 미설정 시 자동으로 `true`가 되는 2차 안전장치입니다.

---

## 1. 로컬 실행법

### 1.1 사전 준비
- MySQL 8 (Docker 예시: `docker run -d --name bf-dev-mysql -p 3306:3306 -e MYSQL_ROOT_PASSWORD=... mysql:8`)
- `server/.env` 파일 생성(`.env.example` 참고) — 최소 `DB_HOST`/`DB_USER`/`DB_PASS`/`DB_NAME`/`JWT_SECRET` 필수.

### 1.2 스키마 + 마이그레이션 적용
`server/db/schema.sql`은 초기 테이블 세트만 담고 있고, 결제 관련 테이블(045~059)은 **서버 시작 시
자동 적용되지 않습니다.** 신규 환경(빈 DB)에서는 아래 순서로 수동 적용하십시오.

```sql
SOURCE server/db/schema.sql;
-- 001~041(스키마와 이미 통합된 초기 이력) 은 신규 DB에서는 건너뛰어도 무방합니다.
-- 실제로 필요한 것은 043 이후(스키마에 아직 반영되지 않은 결제/경매 인증 기능)입니다.
SOURCE server/db/migrations/043_live_memo.sql;
SOURCE server/db/migrations/044_live_memo_images.sql;
SOURCE server/db/migrations/045_pay_wallets.sql;
SOURCE server/db/migrations/046_wallet_transactions.sql;
SOURCE server/db/migrations/047_admin_wallet_adjustments.sql;
SOURCE server/db/migrations/048_user_payment_credentials.sql;
SOURCE server/db/migrations/049_payment_auth_sessions.sql;
SOURCE server/db/migrations/050_auction_access_sessions.sql;
SOURCE server/db/migrations/051_orders.sql;
SOURCE server/db/migrations/052_payments.sql;
SOURCE server/db/migrations/053_payment_transactions.sql;
SOURCE server/db/migrations/054_auctions_payment_auth_columns.sql;
SOURCE server/db/migrations/055_users_developer_flag.sql;
SOURCE server/db/migrations/056_auction_access_sessions_scope.sql;
SOURCE server/db/migrations/057_pay_wallets_compensation_point.sql;
SOURCE server/db/migrations/058_rest_auction_bids.sql;
SOURCE server/db/migrations/059_admin_action_audit_log.sql;
```

이미 운영 중인 DB(스키마 001~041이 개별 마이그레이션으로 이미 적용된 환경)라면 043부터만 순서대로
실행하면 됩니다. **모든 054~059 계열 `ALTER TABLE ... ADD COLUMN`은 이미 컬럼이 있는 상태에서
재실행하면 `Duplicate column name` 오류가 나므로, 최초 1회만 실행**하십시오.

> ⚠️ **알려진 스키마 누락(이번 Phase 8 테스트 DB 구축 중 발견)**: `services/order.ts`와
> `routes/auctions.ts`는 `auctions.shipping_fee`(INT) 컬럼을 조회/갱신하지만, 이 컬럼을 추가하는
> 마이그레이션 파일이 `db/migrations/`에 존재하지 않습니다(개발 DB에는 어떤 경위로든 이미 컬럼이 있어
> 정상 동작하지만, 이 문서의 안내대로 새 DB를 만들면 `Unknown column 'shipping_fee'` 오류가 납니다).
> 신규 환경 구축 시 아래를 별도로 실행하십시오(정식 마이그레이션 파일로 등록하는 작업은 이번 Phase
> 범위 밖이라 별도 티켓으로 처리 필요):
> ```sql
> ALTER TABLE auctions ADD COLUMN shipping_fee INT NOT NULL DEFAULT 0 AFTER shipping_fee_status;
> ```

### 1.3 서버 기동
```bash
cd server
npm install
npm run dev   # tsx watch, 개발용
# 또는
npm run build && npm start
```

---

## 2. 실 PG 연동 시 교체 지점

`server/src/services/payment/` 디렉토리가 Provider 어댑터 계층입니다.

```
services/payment/
├── provider.ts                        # PaymentProvider 공통 인터페이스 + 표준 오류코드(PaymentErrorCode)
├── payment-service.ts                 # PaymentService — method/providerName → Provider 라우팅 파사드
├── index.ts                           # Provider 등록 + method별 기본 Provider 배선
└── mock/
    ├── internal-pay-provider.ts       # MONEY(바로팜페이 자체 머니) — 실PG 대상 아님, 계속 내부 처리
    ├── mock-card-provider.ts          # CARD → 교체 대상
    ├── mock-account-provider.ts       # ACCOUNT → 교체 대상
    ├── mock-mobile-provider.ts        # MOBILE → 교체 대상
    └── mock-virtual-account-provider.ts # VIRTUAL_ACCOUNT → 교체 대상
```

실제 PG(예: Toss Payments) 연동 절차:
1. `services/payment/provider.ts`의 `PaymentProvider` 인터페이스(`readyPayment`/`authenticatePayment`/
   `approvePayment`/`failPayment`/`cancelPayment`/`partialCancelPayment`/`refundPayment`/`getPayment`/
   `getPaymentStatus`)를 구현하는 새 클래스를 `services/payment/toss-payments-provider.ts` 등으로 작성.
   반환값은 반드시 `ProviderResult`(성공 시 `approvedAmount`/`providerTransactionId`, 실패 시
   `failureCode`(`PaymentErrorCode`)/`failureMessage`) 형태로 맞출 것 — 상위 계층
   (`services/payment-orchestrator.ts`)은 이 형태만 알고 있어 변경이 필요 없다.
2. `services/payment/index.ts`에서 `paymentService.registerProvider(name, new TossPaymentsProvider())` 로
   등록하고, `paymentService.setMethodDefault('CARD', name)` 처럼 교체할 method의 기본 Provider만 바꾼다.
3. `config/payment-policy.ts`의 `featureFlags.MOCK_PG_ENABLED`를 `false`로 전환(env: `PAY_FF_MOCK_PG_ENABLED=false`).
   이 플래그 자체가 자동으로 Provider를 바꿔주지는 않으며(2번 단계가 실제 교체), 배포 체크리스트/모니터링용
   플래그로 사용한다.
4. `services/payment-orchestrator.ts`, `routes/pay-wallet.ts` 등 호출부는 **수정할 필요가 없다** — 전부
   `paymentService`(파사드)를 통해서만 Provider를 호출하기 때문이다.
5. `MONEY`(바로팜페이 자체 머니)는 PG 연동 대상이 아니다 — `internal-pay-provider.ts`는 앞으로도 지갑
   원장(`services/wallet.ts`)을 직접 다루는 내부 처리로 유지된다.

---

## 3. Mock 결제 시나리오 사용법

모든 Mock Provider는 `services/payment/provider.ts`의 `MockResult`(`'success' | 'timeout' | 'response_lost'`)
공통 파라미터를 최우선으로 따르고, 미지정 시 결제수단별 끝자리(last4) 분기를 따른다.

### 카드(CARD) — `mock-card-provider.ts`
| cardInfo.last4 | 결과 |
|---|---|
| `0000` (또는 그 외 대부분) | 승인 성공 |
| `1111` | 승인 실패 (`PAYMENT_APPROVAL_FAILED`) |
| `2222` | 한도초과 (`CARD_LIMIT_EXCEEDED`) |

### 계좌이체(ACCOUNT) — `mock-account-provider.ts`
| accountInfo.last4 | mockResult | 결과 |
|---|---|---|
| `3333` | (미지정) | 잔액부족 (`INSUFFICIENT_BALANCE`) |
| `3333` | `response_lost` | 계좌 인증실패 (`AUTHENTICATION_FAILED`) |
| 아무 값 | `timeout` | 시간초과 (`PAYMENT_TIMEOUT`) |
| 아무 값 | `success` | 위 분기 전체 무시하고 강제 승인 성공 |
| 그 외 끝자리 | (미지정) | 승인 성공 |

### 공통 `mockResult` (모든 Mock Provider 공통)
- `mockResult: 'timeout'` → `PAYMENT_TIMEOUT`(HTTP 504)
- `mockResult: 'response_lost'` → 승인은 됐으나 응답 유실된 상황을 흉내(계좌 Provider는 도메인 특화 의미로
  `AUTHENTICATION_FAILED`를 반환하도록 별도 분기됨 — 위 표 참고)
- `mockResult: 'success'` → 끝자리 분기를 무시하고 강제 성공(예외 케이스 테스트용)

예시(REST):
```
POST /api/payments/:paymentId/approve
{ "idempotencyKey": "...", "cardInfo": { "last4": "1111" } }
```
→ `402 { "error": "PAYMENT_APPROVAL_FAILED", ... }`

---

## 4. 어드민 테스트포인트/테스트머니 사용법

- 엔드포인트(모두 `Authorization: Bearer <admin JWT>` 필요 — `POST /admin/api/login`으로 발급):
  - `POST /api/admin/users/:userId/wallet/test-points/grant` / `.../revoke`
  - `POST /api/admin/users/:userId/wallet/test-money/grant` / `.../revoke`
  - body 공통: `{ amount, reason, idempotencyKey, internalMemo?, referenceId?, expiresAt? }`
    (revoke는 `amount` 대신 `revokeAll: true` 또는 `sourceTransactionId`로 특정 지급건 지정 가능)
- Feature Flag 켜는 법: `.env`에 `PAY_FF_TEST_POINT_ENABLED=true` 설정 후 서버 재기동.
  운영 환경(`NODE_ENV=production`)에서는 `PAY_TEST_POINT_PRODUCTION_DISABLED`가 미설정 시 자동으로
  `true`가 되어 위 플래그를 켜도 2차로 차단된다 — 예외적으로 QA 계정에만 허용하려면
  `PAY_TEST_POINT_ALLOWED_USER_IDS=12,34` 처럼 사용자 ID를 등록한다.
- 권한: `test-points`/`test-money` 라우트는 **ADMIN 또는 DEVELOPER**(`users.is_admin` 또는
  `users.is_developer`) 계정만 호출 가능(`middleware/admin-auth.ts`의 `requireAdminOrDeveloper`).
  일반 조정(`/adjustments`, MONEY 포함)은 ADMIN만 가능하다.

---

## 5. 운영 환경 Feature Flag 체크리스트

`config/payment-policy.ts`의 `featureFlags`/`testPoint` 전체 — 배포 전 반드시 아래 값을 확인하십시오.

| 플래그 | env 변수 | 기본값 | 운영 권장값 | 설명 |
|---|---|---|---|---|
| TEST_POINT_ENABLED | `PAY_FF_TEST_POINT_ENABLED` | `false` | **false** | 테스트포인트/테스트머니 지급·사용 자체를 허용할지 |
| DEVELOPER_TOOLS_ENABLED | `PAY_FF_DEVELOPER_TOOLS_ENABLED` | `false` | **false** | 어드민 화면 내 개발자 전용 디버그 패널 노출 여부 |
| MOCK_PG_ENABLED | `PAY_FF_MOCK_PG_ENABLED` | `true` | 실 PG 연동 완료 시 **false** | Mock PG 사용 여부(§2 실 PG 연동 참고, 플래그 자체가 Provider를 바꾸지는 않음) |
| PRODUCTION_DISABLED | `PAY_TEST_POINT_PRODUCTION_DISABLED` | `NODE_ENV==='production'` | **true**(운영) | TEST_POINT_ENABLED가 실수로 켜져도 운영에서 테스트 자산 지급을 하드 차단하는 2차 안전장치 |
| allowedUserIds | `PAY_TEST_POINT_ALLOWED_USER_IDS` | (빈 값) | 필요한 QA 계정만 최소한으로 | PRODUCTION_DISABLED가 true여도 예외 허용할 사용자 ID |

---

## 6. 테스트

`server/tests/`에 `node --test` + `tsx` 기반 통합 테스트가 있습니다. 실행 방법과 DB 격리 방식은
프로젝트 루트가 아닌 `server/tests/` 하위 코드 주석과 `_workspace/pay2_p8_finalize.md`를 참고하십시오.

```bash
cd server
npm test
```

- 테스트는 `barofarm`(개발 DB)이 아닌 **별도 테스트 전용 DB**를 사용하도록 `DB_NAME`을 코드에서 강제
  덮어씁니다(`tests/helpers/env.ts`) — 개발 DB의 데이터를 건드리지 않습니다.
- 각 테스트는 고유 식별자로 데이터를 만들고 스위트 종료 시 스스로 정리하며, DB 커넥션 풀도 종료합니다
  (좀비 프로세스 방지).
