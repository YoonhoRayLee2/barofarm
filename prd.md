# 바로팜 — 산지직송 P2C 라이브 커머스 PRD

> 최종 갱신: 2026-04-27 (rev 2) · 요구사항 추가

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 프로젝트명 | 바로팜 (Barofarm) — 산지직송 P2C(Producer To Customer) 라이브 커머스 |
| 목표 | 농부(셀러)가 스마트폰으로 라이브 방송을 열고, 소비자(바이어)가 실시간 경매·입찰로 농산물을 직거래하는 P2C 플랫폼 |
| 레퍼런스 | **와이스(WYYYES)** — 컬렉터블 라이브 경매 앱 (주식회사 볼라) |
| 핵심 메커니즘 | 서버 권위(authoritative) 30초 카운트다운, 종료 **10초 이내 새 입찰 시 자동 +10초 연장** |
| 개발 기간 | 총 7주 MVP |
| 현재 상태 | Stage 1~3 구현 진행 중 (서버 완료, Flutter main.dart 연결 필요) |

---

## 1-A. 추가 요구사항 (rev 2)

### REQ-1: 역할 통합 — 단일 계정으로 셀러·바이어 기능 모두 사용

| 항목 | 내용 |
|---|---|
| 로그인 | 이름 + 전화번호만 입력 → 역할 선택 없음 |
| 권한 | 모든 사용자가 **경매 개설(셀러)** + **입찰(바이어)** 동시 가능 |
| 라이브 입장 | 본인이 개설한 경매 → 셀러 WebView, 타인 경매 → 바이어 WebView |
| 토큰 발급 | 경매 개설자(`sellerId == userId`) → `canPublish: true`, 나머지 → `canPublish: false` |
| DB `role` 컬럼 | `ENUM('seller','buyer')` → 제거 또는 `VARCHAR` 자유 입력 (미사용 필드로 유지 가능) |

> 구분 기준은 "계정 역할"이 아니라 **"해당 경매의 개설자 여부"** 로 결정된다.

---

## 2. 확정 기술 스택

| 레이어 | 기술 | 버전/비고 |
|---|---|---|
| 앱 | Flutter + `webview_flutter` | SDK ^3.7.0 / webview_flutter ^4.7.0 |
| HTTP 클라이언트 | `dio` | ^5.4.0 |
| 실시간 클라이언트 | `socket_io_client` | ^3.0.1 |
| 보안 저장소 | `flutter_secure_storage` | ^9.2.2 |
| 푸시 알림 | `firebase_messaging` + `firebase_core` | ^15.1.3 / ^3.6.0 (2차) |
| WebRTC | **LiveKit Cloud** | livekit-client CDN (HTML/JS) |
| 백엔드 | Node.js + Express + TypeScript | ES2022 / CommonJS |
| 실시간 서버 | Socket.io | cors: origin: '*' |
| DB | MySQL + In-Memory Map | mysql2/promise 풀 |
| DB (2차) | Redis Pub/Sub | 트래픽 증가 후 도입 |
| 결제 (2차) | 카드 자동결제 | 토스페이먼츠 or 포트원 |
| 인프라 | Docker + AWS EC2 | 4단계 배포 |

---

## 3. 아키텍처 핵심 결정

### 3-1. Flutter + WebView 전략
- Flutter 앱 내부에 `webview_flutter`로 WebView를 띄우고, 라이브 화면은 **HTML/JS로 구현**
- WebRTC는 브라우저 네이티브 지원 → Flutter WebRTC 플러그인 없이 동작
- Flutter ↔ WebView JS 브릿지 채널명: `FlutterChannel`
  - `onLiveStart` — 바이어 첫 영상 수신 시
  - `onLiveEnd` — 셀러 방송 종료 / 연결 끊김
  - `onLiveError` — 연결 실패

### 3-2. WebRTC — LiveKit 위임 전략 (핵심 원칙, 변경 금지)
- **WebRTC 직접 구현 금지** — LiveKit이 SFU·STUN·TURN 모두 처리
- 개발자는 **토큰 발급 + 비즈니스 로직에만 집중**
- 셀러: `canPublish: true`, 바이어: `canPublish: false` (토큰 단 권한 분리)
- WebView URL 구조: `http://<host>:3000/live/live-{seller|buyer}.html?serverUrl=<wss>&token=<jwt>`

### 3-3. 실시간 경매 — Socket.io + 서버 권위 타이머
- 경매 상태는 서버 메모리(Map) → 서버가 1초마다 `setInterval`로 `timeLeft`를 감소
- 클라이언트가 아닌 **서버가 타이머를 소유** — 화면 표시만 클라이언트에서 처리
- 낙찰 시점에만 MySQL에 영구 저장 (DB 부하 최소화)

---

## 4. 서버 REST API

```
POST   /api/users            사용자 생성/upsert (name, phone, role)
POST   /api/live/token       LiveKit 토큰 발급 (roomName, userId, role)
POST   /api/auctions         경매 생성 (sellerId, productName, startPrice)
GET    /api/auctions         진행 중 경매 목록 (status != ended)
GET    /api/auctions/:id     경매 상세 (DB + 메모리 상태 merge)
PATCH  /api/auctions/:id/start  라이브 시작 → 메모리 올림 + setInterval 타이머 시작
PATCH  /api/auctions/:id/end    낙찰 처리 → DB 저장 + 메모리/타이머 제거
```

**`POST /api/live/token` 응답 예:**
```json
{
  "token": "eyJhbGciOi...",
  "serverUrl": "wss://barofarm-xxxxx.livekit.cloud",
  "role": "seller",
  "roomName": "auction_42"
}
```

---

## 5. Socket.io 이벤트

### 클라이언트 → 서버
| 이벤트 | 페이로드 | 설명 |
|---|---|---|
| `join` | `{ roomId }` | 경매 룸 입장, 현재 상태 즉시 수신 |
| `bid` | `{ roomId, price, userId }` | 입찰 (현재가 이하 무시) |
| `chat` | `{ roomId, message, userId }` | 채팅 메시지 전송 |

### 서버 → 클라이언트
| 이벤트 | 페이로드 | 발화 시점 |
|---|---|---|
| `auction:update` | `AuctionState` | 매 1초 tick + 입찰 발생 시 |
| `auction:ended` | `{ id, winner, price }` | 타이머 0초 도달 시 |
| `chat:message` | `{ userId, message, ts }` | 채팅 수신 |

**`AuctionState` 구조:**
```ts
{
  id: string;
  productName: string;
  sellerId: string;
  currentPrice: number;
  topBidder: string | null;
  timeLeft: number;       // 서버 권위, 0이면 종료
  status: 'live' | 'ended';
}
```

---

## 6. 서버 디렉토리 구조

```
server/
├── src/
│   ├── index.ts            Express + Socket.io 초기화 + 정적서빙(/live)
│   ├── routes/
│   │   ├── auctions.ts     경매 CRUD (io 주입 받음)
│   │   ├── live.ts         LiveKit 토큰 발급
│   │   └── users.ts        사용자 생성/upsert
│   ├── socket/
│   │   └── auction.ts      join/bid/chat 이벤트 핸들러
│   ├── store/
│   │   └── memory.ts       AuctionState Map + createAuction + startTimer + stopTimer
│   └── db/
│       └── mysql.ts        mysql2/promise 풀
├── public/
│   ├── live-seller.html    셀러용 LiveKit WebView (후면카메라 publish)
│   └── live-buyer.html     바이어용 LiveKit WebView (fullscreen 수신)
├── db/
│   └── schema.sql          users/auctions/bids/chats DDL
├── dist/                   TypeScript 컴파일 출력
├── .env.example
└── tsconfig.json           target: ES2022, strict: true
```

---

## 7. DB 스키마

```sql
users      (id, name, role ENUM('seller','buyer'), phone, created_at)
auctions   (id, seller_id, product_name, start_price, current_price,
            top_bidder_id, status ENUM('pending','live','ended'), ends_at, created_at)
bids       (id, auction_id, bidder_id, price, created_at)
chats      (id, auction_id, user_id, message, created_at)
```

> 경매 진행 중 현재가·타이머는 서버 메모리(Map)에 보관, 낙찰 시점에만 DB에 영구 저장

---

## 8. Flutter 앱 구조

```
app/lib/
├── main.dart               ← 미연결 (기본 템플릿, 연결 필요)
├── app_config.dart         baseUrl 설정 (Android: 10.0.2.2:3000)
├── app_theme.dart          Fresh Field 팔레트 (라이트/다크 ThemeData)
├── models/
│   ├── auction.dart        Auction (id, productName, currentPrice, timeLeft, status, topBidder)
│   ├── user.dart           User (id, name, phone, role)
│   └── message.dart        ChatMessage (userId, message, ts)
├── services/
│   ├── api_service.dart    Dio singleton (createUser, getAuctions, getAuction, getToken)
│   └── socket_service.dart Socket.io singleton (connect, join, bid, sendChat, stream)
└── features/
    ├── auth/
    │   └── login_screen.dart   이름/전화번호/역할 입력 → POST /api/users
    ├── home/
    │   ├── home_screen.dart    경매 목록 + 새로고침 + 네비게이션 바
    │   └── widgets/
    │       └── auction_card.dart
    └── live/
        ├── live_screen.dart    WebView + Socket.io 오버레이 (풀스크린 Stack)
        └── widgets/
            ├── live_badge.dart     LIVE 뱃지 (live-red)
            ├── timer_display.dart  카운트다운 + 색상 변화 (30~11s 그린/10~4s 앰버/3s↓ 레드)
            ├── chat_overlay.dart   채팅 오버레이 (좌측 반투명)
            ├── bid_chips.dart      입찰 단위 선택 (+500/+1,000/+2,000/+5,000)
            └── slide_bid.dart      슬라이드 입찰 확인
```

---

## 9. 디자인 시스템

**테마:** Fresh Field (B) 팔레트 — 라이트/다크 모드 지원

| 역할 | 라이트 | 다크 |
|---|---|---|
| 배경 | `#F4F2EA` | `#11140D` |
| 서피스 | `#FFFFFF` | `#1F2417` |
| 강조 (accent) | `#5B7A35` | `#A8C766` |
| 강조 소프트 | `#C9D8A8` | `#2E3D17` |
| 본문 텍스트 | `#1F2417` | `#EEF0E4` |
| 뮤트 텍스트 | `#7E8675` | `#7E8675` |
| LIVE 뱃지 | `#B23A2C` | `#B23A2C` |
| 구분선 | `#DCDCC9` | `#2E3525` |

**타이포그래피:** Material 3 TextTheme (Pretendard 적용 예정)
- 현재가·타이머: fontWeight w700~w900
- 타이머 색상: 30~11s 그린 / 10~4s 앰버 / 3s↓ 레드 + shake 애니메이션

**와이스 벤치마크 채택 목록:**
- ✅ 풀스크린 세로 라이브 영상
- ✅ 30초 카운트다운 + 10초 연장 메커니즘
- ✅ 실시간 채팅 오버레이
- ✅ 입찰 단위 선택 (+500 / +1,000 / +2,000 / +5,000)
- ✅ 슬라이드 입찰 확인 UI
- ✅ 경매 종료 오버레이 (낙찰자·낙찰가 표시)
- ⬜ 셀러 팔로우 + 알림 설정 (2차)
- ⬜ 사전 카드 등록 즉시 결제 (2차)

---

## 10. 환경 변수

```env
PORT=3000
LIVEKIT_KEY=APIxxxxxxxxxxxxx
LIVEKIT_SECRET=secret_xxxxxxxxxxxxxx
LIVEKIT_URL=wss://<project>.livekit.cloud
DB_HOST=localhost
DB_USER=root
DB_PASS=
DB_NAME=barofarm
```

---

## 11. 알려진 이슈 (개발 중)

| 구분 | 위치 | 내용 | 우선순위 |
|---|---|---|---|
| W1 | `routes/auctions.ts:46` | `PATCH /:id/start` 중복 호출 시 메모리 상태 덮어씀 | 높음 |
| W2 | `routes/auctions.ts:46` | start 시 룸에 초기 상태 emit 없음 | 중간 |
| W3 | `socket/auction.ts:12` | 셀러 본인 입찰 차단 없음 | 높음 |
| W4 | `routes/live.ts:59` | `LIVEKIT_URL` 미설정 시 `serverUrl: null` 그대로 응답 | 중간 |
| W5 | `store/memory.ts` | 서버 재시작 시 진행 중 경매 메모리 손실 | 낮음 (Redis 2차 도입) |
| M1 | `app/lib/main.dart` | 기본 Flutter 템플릿 미연결 (LoginScreen 진입 필요) | 긴급 |

---

## 12. 2차 개발 항목 (MVP 이후)

| 항목 | 내용 |
|---|---|
| 자동결제 | 낙찰 후 사전 등록 카드 자동 청구 (토스페이먼츠 or 포트원) |
| Redis | 경매 상태 Redis 이전, Pub/Sub 다중 서버 대응 |
| FCM 푸시 | 낙찰·경매 시작·입찰 알림 (패키지 추가 완료, 서버 미구현) |
| 셀러 대시보드 | 판매 이력·수익·리뷰 관리 |
| 배송 연동 | 낙찰 후 배송지 수집·택배사 API 연동 |
| Pretendard 폰트 | 앱 assets 등록 필요 |

---

> **핵심 원칙 3가지 (변경 금지)**
> 1. WebRTC는 LiveKit에 위임 — 직접 구현 없이 비즈니스 로직에만 집중
> 2. Flutter는 WebView로 단순하게 — 라이브 화면은 HTML/JS, Flutter는 알림·네비만
> 3. 타이머는 서버가 소유 — 클라이언트는 표시만 담당, DB는 낙찰 시점에만 기록
