# 결제 시스템 다이어그램 (Phase 8)

실제 코드(`services/payment-orchestrator.ts`, `socket/auction.ts`, `routes/auction-bids.ts`,
`services/auction-settlement.ts`, `services/payment-auth-session.ts`, `middleware/payment-auth.ts`,
`services/auction-access.ts`, `services/payment/`)를 기준으로 작성했다. 코드에 없는 전이는 포함하지 않았다.

## 1. 결제 상태전이 (`payments.status`)

`services/payment-orchestrator.ts`의 `transitionPayment()`만이 `payments.status`를 바꾸는 유일한 경로다
(from 목록에 없는 상태에서 호출되면 `INVALID_PAYMENT_STATUS`로 거부됨). `AUTHENTICATION_REQUIRED` /
`AUTHENTICATING`(진입) / `AUTHORIZED` / `EXPIRED`는 `PaymentRowStatus` 타입과 `transitionPayment`의 허용
`from` 목록에는 존재하지만, 현재 Mock Provider 흐름(`readyPayment`가 항상 `READY`로 insert)에서는 실제로
도달하는 코드 경로가 없다 — 실 PG 3DS 인증 등 향후 확장을 위해 타입만 예약되어 있는 상태다(점선으로 표시).

```mermaid
stateDiagram-v2
    [*] --> READY: readyPayment() insert\n(Mock Provider는 항상 READY)
    READY --> PAID: approvePayment() 성공
    READY --> FAILED: approvePayment() 실패\n(providerResult.success=false)
    AUTHENTICATING --> PAID: approvePayment() 성공
    AUTHENTICATING --> FAILED: approvePayment() 실패
    PAID --> PARTIALLY_CANCELED: partialCancelPayment()\n(cancelAmount < 취소가능잔액)
    PARTIALLY_CANCELED --> PARTIALLY_CANCELED: partialCancelPayment() 반복\n(여전히 취소가능잔액 남음)
    PAID --> CANCELED: cancelPayment() 전체취소\n(order.status가 아직 PREPARING/SHIPPED/COMPLETED 이전)
    PAID --> REFUNDED: cancelPayment() 전체취소\n(order.status가 이미 PREPARING/SHIPPED/COMPLETED)
    PARTIALLY_CANCELED --> CANCELED: 누적취소액=승인액 도달\n(order.status가 PREPARING/SHIPPED/COMPLETED 이전)
    PARTIALLY_CANCELED --> REFUNDED: 누적취소액=승인액 도달\n(order.status가 PREPARING/SHIPPED/COMPLETED 이후)

    note right of AUTHENTICATING
        readyPayment()이 이 상태로 insert하는
        코드 경로는 현재 없음(실PG 3DS 인증 등
        향후 확장을 위한 예약 상태)
    end note
```

approve 실패 시 `payments.status`만 별도 트랜잭션으로 `FAILED`로 기록되고(포인트/머니 차감은 같은
트랜잭션 안에서 롤백됨), 멱등 재요청(`payment_transactions.idempotency_key` 재사용)은 상태 전이 없이
기존 결과를 그대로 반환한다(`findIdempotentReplay`).

---

## 2. 경매 상태전이

기존 소켓 경매(`socket/auction.ts` + `store/memory.ts`, `bidding_channel='SOCKET'`)와 REST 인증형 입찰
(`routes/auction-bids.ts` + `services/auction-settlement.ts`, `bidding_channel='REST'`)은 서로 다른 "진실
공급원"을 쓴다 — 전자는 메모리(`AuctionState.status`)가 authoritative이고 DB `auctions.status`는 낙찰
시점에만 기록되며, 후자는 처음부터 DB `auctions.status`/`ends_at`이 유일한 진실 공급원이다.

```mermaid
stateDiagram-v2
    state "SOCKET 채널 (메모리 authoritative)" as socket {
        [*] --> mem_pending: createAuctionState()\n(scheduledAt 있으면 live 항목은 'upcoming')
        mem_pending --> mem_live: 방송 시작 / 즉시 진행
        mem_live --> mem_live: bid 이벤트\n(10초 이내 입찰 시 timeLeft+=10, socket/auction.ts:112)
        mem_live --> mem_ended: 타이머 종료 또는 강제종료(endAuctionState)
        mem_ended --> [*]: services/livekit-service.ts endAuction()\n이 시점에만 DB auctions.status/bids 기록
    }

    state "REST 채널 (DB auctions.status가 유일한 진실 공급원)" as rest {
        [*] --> live: auctions.status='live' (bidding_channel='REST')
        live --> live: POST /api/auctions/:id/bids\n(현재가+최소단위 조건부 UPDATE, 낙관적 원자 갱신)
        live --> ended: ends_at 경과 판정\n(polling: settleExpiredRestAuctions, services/auction-settlement.ts)
        ended --> [*]
    }

    note right of rest
        settleAuctionIfDue()에서 bids.status도 함께 전이:
        WINNING → WON(낙찰), CREATED/VALID/OUTBID → LOST
    end note
```

REST 채널 입찰(`placeBid`, `routes/auction-bids.ts`)은 단일 트랜잭션 안에서 `auctions` 행을 `FOR UPDATE`로
잠그고, 채널/진행상태/서버시간 만료(`ends_at <= NOW()`, DB 서버 시간 기준)/최소입찰단위를 검증한 뒤
`WHERE current_price < ?` 조건부 `UPDATE`로 현재가를 원자적으로 갱신한다(동시입찰/종료직전입찰 방지).

---

## 3. 결제 인증세션 흐름

`services/payment-auth-session.ts`(세션 발급/검증/폐기) + `middleware/payment-auth.ts`
(`requirePaymentAuth`/`requireAuctionAccess`)를 기준으로 한다.

```mermaid
sequenceDiagram
    participant U as 사용자
    participant API as POST /api/payment-auth/sessions
    participant Cred as payment-credential.ts
    participant Sess as payment-auth-session.ts
    participant Guard as requirePaymentAuth (middleware)
    participant Biz as 보호된 라우트(결제승인/고액입찰 등)

    U->>API: password + purpose(PAYMENT|AUCTION_ENTRY|HIGH_VALUE_BID|HIGH_VALUE_PAYMENT)
    API->>Cred: verifyCredential(userId, password)
    alt 검증 실패(오답/잠금)
        Cred-->>API: PaymentCredentialError(INVALID/LOCKED)
        API-->>U: 400
    else 검증 성공
        Cred-->>API: ok
        API->>Sess: issueSession()\n(동일 purpose/scope의 기존 ACTIVE 세션은 REPLACED 폐기)
        Sess-->>API: token(원문, HttpOnly 쿠키 전달용) + 세션ID
        API-->>U: 201 + Set-Cookie(baro_pay_auth)
    end

    U->>Biz: 요청 (Cookie: baro_pay_auth)
    Biz->>Guard: requirePaymentAuth(purpose, amountResolver?)
    Guard->>Sess: validateSessionToken(token, deviceId?)
    alt 세션 없음/만료/폐기/기기불일치
        Sess-->>Guard: invalid(reason)
        Guard-->>U: 401 (EXPIRED|REVOKED)
    else 세션 유효하지만 목적 불일치
        Guard-->>U: 401 (요청 목적에 맞는 세션 아님)
    else 금액이 고액 기준 초과 & 현재 세션이 고액용 아님
        Guard-->>U: 403 HIGH_VALUE_REAUTH_REQUIRED
    else 통과
        Guard->>Biz: next() (req.paymentAuthSession 주입)
        Biz-->>U: 정상 처리
    end

    Note over Sess: 비밀번호 변경/초기화/로그아웃 시\nrevokeAllSessionsForUser()로 전체 세션 폐기
```

만료 정책은 목적별로 분리되어 있다(`config/payment-policy.ts` `authSessionPolicy`): 비활동 만료(슬라이딩
윈도우, 매 검증 시 연장되지만 절대만료는 넘지 않음) + 절대만료(발급 시점 고정). 고액 기준 초과 여부는
`exceedsHighValueThreshold()`가 판정하며, 경매별 `high_value_reauth_amount`가 있으면 config 기본값보다
우선한다.

---

## 4. 경매장 입장 인증 흐름

`services/auction-access.ts` 기준. `auctions.authentication_mode`가 `AUCTION_ENTRY` 이상일 때만 입장
인증(`auction_access_sessions`)이 필요하고, `PAYMENT_ONLY`(기본값)는 입장 인증 없이 바로 참여 가능하다.

```mermaid
flowchart TD
    A[GET/POST 경매 관련 요청] --> B{authentication_mode?}
    B -- PAYMENT_ONLY(기본) --> Z[입장 인증 불필요 → 통과]
    B -- AUCTION_ENTRY / ENTRY_AND_PAYMENT / ALWAYS --> C[findActiveAccessSession]
    C --> D{스코프 일치하는\nACTIVE 세션 존재?}
    D -- 있음 --> E{ALWAYS 모드?}
    E -- 아니오 --> Z2[통과, last_used_at 등\n별도 갱신 없음]
    E -- 예 --> F[매번 재인증 요구\n기존 세션 무시]
    D -- 없음 --> F
    F --> G[결제비밀번호 재검증\n+ issueSession purpose=AUCTION_ENTRY/HIGH_VALUE_BID]
    G --> H[issueAccessSession\n스코프: AUCTION 또는 GROUP\n동일 스코프 기존 ACTIVE는 REPLACED 폐기]
    H --> Z

    subgraph 스코프 판정 resolveDefaultScope
      S1[auction_group_id 있음 → GROUP]
      S2[없음 → AUCTION]
    end
```

`assertCanParticipate()`가 스코프/모드 판정과 별개로 항상 먼저 검사하는 것: 이미 종료된 경매(`status=
'ended'`) → 거부, 판매자 본인 → 거부, 계정 상태 `suspended` → 거부. 고액 입찰(`requiresHighValueBidReauth`)은
입장 인증과 별개로 `payment_auth_sessions`(purpose=`HIGH_VALUE_BID`)를 추가로 요구한다(§3 참고).

---

## 5. Provider Adapter 구조

```mermaid
classDiagram
    class PaymentProvider {
        <<interface>>
        +name: string
        +readyPayment(ctx) ProviderResult
        +authenticatePayment(ctx) ProviderResult
        +approvePayment(ctx) ProviderResult
        +failPayment(ctx, reason?) ProviderResult
        +cancelPayment(ctx) ProviderResult
        +partialCancelPayment(ctx) ProviderResult
        +refundPayment(ctx) ProviderResult
        +getPayment(paymentKey) ProviderResult?
        +getPaymentStatus(paymentKey) PaymentStatus?
    }

    class PaymentService {
        -registry: Map~string, PaymentProvider~
        -methodDefaults: Map~PaymentMethodType, string~
        +registerProvider(name, provider)
        +setMethodDefault(method, providerName)
        +resolveProviderForMethod(method, override?) PaymentProvider
        +readyPayment(ctx) ProviderResult
        +approvePayment(ctx) ProviderResult
        +cancelPayment(providerName, ctx) ProviderResult
        +partialCancelPayment(providerName, ctx) ProviderResult
    }

    class InternalPayProvider {
        +name = "internal"
        MONEY(바로팜페이 자체 머니)\n실PG 대상 아님, 계속 내부 유지
    }
    class MockCardProvider {
        +name = "mock_card"
        last4 0000/1111/2222 분기
    }
    class MockAccountProvider {
        +name = "mock_account"
        last4 3333 + mockResult 분기
    }
    class MockMobileProvider {
        +name = "mock_mobile"
    }
    class MockVirtualAccountProvider {
        +name = "mock_virtual_account"
    }
    class TossPaymentsProvider {
        <<향후 구현>>
        실PG 연동 시 CARD/ACCOUNT/MOBILE/\nVIRTUAL_ACCOUNT의 기본 Provider로 교체
    }

    PaymentProvider <|.. InternalPayProvider
    PaymentProvider <|.. MockCardProvider
    PaymentProvider <|.. MockAccountProvider
    PaymentProvider <|.. MockMobileProvider
    PaymentProvider <|.. MockVirtualAccountProvider
    PaymentProvider <|.. TossPaymentsProvider : 구현 예정(README-payment.md §2 참고)
    PaymentService --> PaymentProvider : registry/methodDefaults로 라우팅
    PaymentOrchestrator ..> PaymentService : paymentService만 알고\nProvider 구현은 모른다

    class PaymentOrchestrator {
        <<services/payment-orchestrator.ts>>
        readyPayment() / approvePayment()
        cancelPayment() / partialCancelPayment()
    }
```

`services/payment/index.ts`가 유일한 배선 지점이다 — `paymentService.registerProvider(...)` +
`paymentService.setMethodDefault(method, providerName)`만 바꾸면 상위 계층(오케스트레이터/라우트) 코드
변경 없이 실제 PG로 교체된다(§README-payment.md 2절 참고).
