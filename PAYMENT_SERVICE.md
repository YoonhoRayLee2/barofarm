# 바로페이 — barofarm 결제·경매인증 서비스

> 경매 플랫폼 barofarm의 자체 결제 서비스. 한국 커머스·간편결제 스타일의 결제 흐름과
> 경매 특화 인증(경매장 입장·입찰·낙찰결제)을 제공한다.
> **현재는 개발/목업 단계로 실제 카드사·은행·PG와 연동하지 않으며, 모든 결제는 내부 Mock으로 동작한다.**
> 브랜치: `pay2` · 상세 실행/보안 안내: [`server/README-payment.md`](server/README-payment.md) · 다이어그램: [`server/docs/payment-diagrams.md`](server/docs/payment-diagrams.md)

---

## 1. 한눈에 보기

- **자체 페이 지갑**: 충전식 머니 + 포인트(적립/이벤트/테스트/보상)로 결제. 원장(ledger) 기반.
- **다양한 결제수단**: 자체페이 · 카드 · 계좌 · 기타(휴대폰/가상계좌 등) — 전부 Mock Provider.
- **복합 결제**: 포인트 + 머니 + 외부결제(카드/계좌)를 한 주문에서 조합. 잔여 0이면 PG 없이 내부 완료.
- **결제 비밀번호(PIN) + 인증 세션**: 매 결제마다 입력하지 않도록 세션 유지, 고액·위험 시 재인증.
- **경매 특화**: 경매장 입장 인증 → 입찰 → 낙찰 → 낙찰대금 결제 흐름.
- **관리자 도구**: 테스트 포인트/머니 지급·회수, 결제 취소, 지갑 원장·감사 로그.
- **교체 가능한 PG**: Provider Adapter 구조 — 나중에 토스페이먼츠/KG이니시스/NHN KCP/나이스페이를 **구현체 교체만**으로 연결.

---

## 2. 설계 원칙 (변경 금지)

1. **금액은 서버가 재계산** — 낙찰가·수수료·할인·포인트·머니·최종금액 등 클라이언트 값은 신뢰하지 않는다.
2. **잔액 변경은 원장으로만** — 잔액 컬럼을 직접 덮어쓰지 않고 `wallet_transactions` append로 기록(관리자 조정도 조정거래로).
3. **멱등성** — 입찰/충전/결제/취소/포인트 지급에 idempotencyKey. 재요청 시 새 거래를 만들지 않고 기존 결과 반환.
4. **트랜잭션 + 동시성** — 결제/취소는 단일 트랜잭션 + 행잠금(FOR UPDATE) + 데드락 재시도.
5. **비밀정보 미저장** — 결제비번은 bcrypt 해시, 세션토큰은 sha256 해시. 카드/계좌는 마스킹(끝 4자리)만. 원문은 로그·응답·저장 어디에도 없음.
6. **권한 검사** — 관리자/개발자 기능은 서버에서 반드시 검사, 위험 작업은 감사 로그.
7. **기존 소켓 라이브 경매 불가침** — 스트리밍 경매(Socket.io)는 그대로 두고, REST 인증형 경매를 `bidding_channel`로 분리·병행.

---

## 3. 아키텍처

```
┌────────────────────────── 클라이언트 ──────────────────────────┐
│  SPA(server/public/web)         관리자(server/public/admin)     │
│  결제비번모달·지갑·체크아웃·경매   결제/지갑/인증/경매 관리 화면    │
└───────────────┬───────────────────────────┬────────────────────┘
                │ REST (+ HttpOnly 인증 쿠키)  │ /admin/api (requireAdmin)
┌───────────────▼───────────────────────────▼────────────────────┐
│                         Express 라우트                           │
│  payment-credentials · payment-auth · orders · payments ·        │
│  pay/wallet · auctions(enter/bids) · admin-*                     │
├─────────────────────────────────────────────────────────────────┤
│                          서비스 계층                              │
│  payment-orchestrator  order  wallet  payment-auth-session       │
│  auction-access  auction-settlement  payment-credential          │
├─────────────────────────────────────────────────────────────────┤
│                   PaymentService (파사드/registry)               │
│   InternalPay · MockCard · MockAccount · MockMobile · MockVirtual│
│   └ 실 PG 전환 지점: TossPayments/KCP/Inicis/NicePay 구현체 추가  │
├─────────────────────────────────────────────────────────────────┤
│                          MySQL (원장/상태)                        │
└─────────────────────────────────────────────────────────────────┘
```

정책값(세션 만료·잠금·재인증 기준금액·적립률·포인트 우선순위·Feature Flag)은 전부
`server/src/config/payment-policy.ts`에서 `PAY_*` 환경변수로 관리한다(코드 하드코딩 없음).

---

## 4. 자체 페이 지갑

### 자산 종류 (버킷별 구분, 합산 저장 금지)
| 자산 | 설명 | 충전 | 적립률(기본) |
|---|---|---|---|
| **머니(MONEY)** | 선불 충전 잔액, 현금성 | O | — |
| **적립 포인트(EARNED)** | 구매 적립 | X | — |
| **이벤트 포인트(EVENT)** | 이벤트/프로모션 | X | — |
| **테스트 포인트(TEST)** | 개발/QA 전용(운영 비활성) | 관리자 | 정산 제외 |
| **보상 포인트(COMPENSATION)** | 보상성 | 관리자 | — |

### 적립 (spec §9.5)
- 자체페이(머니/포인트) 결제분 **2%**, 카드/계좌 등 외부결제분 **0.5%** — 결제수단별 **안분** 계산.
- 절사/반올림·요율은 정책값. 취소 시 적립 포인트를 정확히 회수(대칭).

### 포인트 사용 우선순위
만료 임박 이벤트 → 테스트 → 일반 적립 → 보상 (정책으로 관리). 운영 환경엔 테스트 포인트가 존재하지 않는다.

---

## 5. 결제 비밀번호 & 인증 세션

- **PIN(기본 6자리)**: 로그인 비번과 별도 필드·해시. 단순번호(생일/연속/반복) 거부. **5회 실패 → 10분 잠금**(정책값).
- **인증 세션**: PIN 검증 성공 시 발급. 토큰은 **HttpOnly·Secure·SameSite 쿠키**로만 전달(localStorage 미사용), 서버엔 해시만 저장. 인증 성공 시 세션ID 재발급(고정 공격 방지).
- **재인증 조건**: 만료(비활동 30분/절대 2시간)·비번 변경·초기화·다른 디바이스·잠금·고액 초과·관리자 강제종료·사용자 직접 해제.
- **인증 모드**(경매/정책별): `PAYMENT_ONLY` · `AUCTION_ENTRY` · `ENTRY_AND_PAYMENT` · `ALWAYS`.
- **고액 재인증**: 기준금액 초과 입찰/결제는 세션이 유효해도 PIN 재확인.

---

## 6. 경매 흐름 (REST 인증형)

```
경매장 입장(PIN 인증) → 입장 세션 발급 → 입찰(세션 검증·최소단위·멱등·동시성)
     → 경매 종료(서버시간) → 최고 입찰자 낙찰 → 낙찰 주문 생성(PAYMENT_PENDING)
     → 낙찰자 결제(복합결제) → PAID → (기한 초과 시 PAYMENT_EXPIRED)
```

- 입장/입찰/낙찰 검증은 전부 **서버가 판단**(클라 표시와 무관).
- 낙찰 정산은 폴링 스케줄러가 "종료된 REST 경매"를 찾아 주문을 생성.
- 스트리밍 라이브 경매(Socket.io)는 별도 채널(`bidding_channel='SOCKET'`)로 병행.

---

## 7. 결제 흐름 & 상태

**결제**: `POST /payments/ready` → (인증 세션 확인) → `POST /payments/:id/approve` → PAID
`READY → AUTHORIZED → PAID` / `FAILED · CANCELED · PARTIALLY_CANCELED · REFUNDED · EXPIRED`

**주문**: `CREATED → PAYMENT_PENDING → PAID → PREPARING → SHIPPED → COMPLETED` / `CANCELED · PAYMENT_EXPIRED`

승인은 단일 트랜잭션에서 **포인트 → 머니 → 외부 PG** 순으로 차감/승인하고, 성공 시 적립·원장 기록까지 함께 커밋. 취소는 포인트/머니 복원 + 적립 회수 + PG 취소를 대칭으로 처리.

---

## 8. 주요 API (요약)

| 영역 | 엔드포인트 |
|---|---|
| 결제비번 | `POST/PUT /api/payment-credentials` · `POST /verify` · `POST /reset` · `GET /status` |
| 인증세션 | `POST /api/payment-auth/sessions` · `GET/DELETE /sessions/current` · `DELETE /sessions/all` |
| 경매입장 | `POST /api/auctions/:id/enter` · `GET /access-status` · `DELETE /access-session` |
| 입찰 | `POST /api/auctions/:id/bids` · `GET /bids` · `GET /my-bids` |
| 주문 | `POST /api/orders` · `GET /:id` · `POST /:id/cancel` |
| 결제 | `POST /api/payments/ready` · `/:id/approve` · `/:id/cancel` · `/:id/partial-cancel` · `GET /:id` · `GET /by-order/:orderId` |
| 자체페이 | `GET /api/pay/wallet` · `POST /wallet/charge` · `GET /wallet/transactions` · `PUT /wallet/auto-charge` |
| 관리자 | `/api/admin/users/:id/wallet*` · `/admin/api/*`(결제·인증·경매 관리) |

> 결제수단(method) 값은 대문자: `MONEY` · `CARD` · `ACCOUNT` · `MOBILE` · `VIRTUAL_ACCOUNT`.

---

## 9. 데이터 모델 (핵심 테이블, 마이그 045~059)

`pay_wallets`(잔액 버킷) · `wallet_transactions`(지갑 원장) · `admin_wallet_adjustments`(관리자 조정)
· `user_payment_credentials`(PIN 해시) · `payment_auth_sessions` · `auction_access_sessions`
· `orders` · `payments` · `payment_transactions`(결제 원장) · `admin_action_audit_log`(관리자 감사)
+ `auctions`/`users` 컬럼 확장.

> 마이그레이션은 서버 시작 시 자동 적용되지 않는다 — 수동 실행 필요(README 참고).

---

## 10. Mock 결제 & 테스트 시나리오

개발용으로 결과를 제어할 수 있다(spec §13):
- 카드 끝자리: `0000` 성공 / `1111` 승인실패 / `2222` 한도초과
- 계좌 끝자리 `3333`: 잔액부족, `mockResult=timeout` 타임아웃, `response_lost` 응답유실 등
- 자체페이 잔액부족, 결제 비번 불일치/잠금, 인증세션 만료, 경매 종료, 동시 입찰 등

**실제 개인정보·실 카드번호를 입력하지 않는다.**

---

## 11. 관리자 기능

- **결제 관리**: 내역 검색·상세·이벤트 로그·전체/부분 취소(사유·감사)
- **지갑 관리**: 잔액·원장 조회, 테스트 포인트/머니 지급·회수(조정거래·멱등·사유·유효기간)
- **인증 관리**: 결제비번 상태(해시 미노출)·초기화, 인증/입장 세션 강제종료
- **경매 관리**: REST 경매 상태·입찰·낙찰자, 인증모드·고액 재인증 기준 설정

관리자는 **잔액을 직접 수정하지 않고 반드시 조정 거래를 생성**하며, 결제 상태 강제 변경은 원칙적으로 금지(정상 취소 API 경유).

---

## 12. 실 PG 연동 전환

1. `server/src/services/payment/`에 `TossPaymentsProvider` 등 `PaymentProvider` 인터페이스 구현체 추가.
2. `index.ts`의 registry에 등록 + 결제수단 기본 매핑 교체(`setMethodDefault`).
3. `MOCK_PG_ENABLED=false` 등 환경변수 전환.
4. 주문/결제 서비스는 `PaymentService` 파사드만 호출하므로 **오케스트레이션 코드는 그대로**.

---

## 13. 보안 & 운영 주의

- 실 PG 미연동 Mock 서비스임을 명확히 인지(실 결제 아님).
- 테스트 포인트는 실자산이 아니며, **운영 환경에서는 테스트 포인트·개발자 기능을 Feature Flag로 비활성화**.
- 결제비번/인증토큰 원문을 저장·로깅하지 않는다.
- 운영 비활성 대상 목록은 `server/README-payment.md` 참고.

### 알려진 이슈(후속)
1. `/admin/api/login`이 `is_admin`만 허용 → DEVELOPER 로그인 경로 미개통.
2. 결제비번 잠금 만료 비교가 앱/DB 타임존 스큐에 취약(테스트는 UTC 고정 우회).
3. `auctions.shipping_fee` 대응 마이그레이션 파일 부재(base 스키마 드리프트).
4. 일부 테스트 케이스 미커버(절사 모드, MOBILE/VIRTUAL Provider, REFUNDED 분기 등).

---

## 14. 검증 상태

- `npx tsc --noEmit` 0 에러, **통합 테스트 36/36 통과**(`npm test`).
- e2e 확인: 결제비번 → 인증세션 → 지갑 충전 → 경매 입장·입찰 → 낙찰 → **복합결제(포인트+머니+카드) approve→PAID** → 취소/환불(복원·적립 회수 대칭).
