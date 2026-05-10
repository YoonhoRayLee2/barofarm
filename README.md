<div align="center">

# 🌾 바로팜 (Barofarm)

**농부가 스마트폰을 들고, 소비자가 실시간으로 입찰하는**  
**산지직송 P2C 라이브 커머스 플랫폼**

<br/>

[![Node.js](https://img.shields.io/badge/Node.js-22-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Flutter](https://img.shields.io/badge/Flutter-3.7-02569B?style=for-the-badge&logo=flutter&logoColor=white)](https://flutter.dev)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.8-010101?style=for-the-badge&logo=socket.io&logoColor=white)](https://socket.io)
[![LiveKit](https://img.shields.io/badge/LiveKit-Cloud-FF6B35?style=for-the-badge)](https://livekit.io)
[![MySQL](https://img.shields.io/badge/MySQL-9.6-4479A1?style=for-the-badge&logo=mysql&logoColor=white)](https://www.mysql.com)

<br/>

> P2C (Producer to Customer) — 중간 유통 없이 농부와 소비자를 실시간으로 연결합니다

</div>

---

## 📌 프로젝트 소개

바로팜은 농부(셀러)가 스마트폰 하나로 라이브 방송을 열고,  
소비자(바이어)가 **실시간 경매·입찰**로 신선한 농산물을 산지에서 직접 구매하는 플랫폼입니다.

```
🌽 농부가 방송 시작
    └─> 실시간 30초 카운트다운 경매
          └─> 마지막 10초 내 입찰 시 자동 +10초 연장
                └─> 최고가 입찰자 낙찰 → 산지직송
```

단일 계정으로 셀러·바이어를 동시에 수행할 수 있으며,  
경매 개설자 여부에 따라 셀러/바이어 화면이 자동 분기됩니다.

---

## ✨ 주요 기능

| 기능 | 설명 |
|------|------|
| 🔴 **라이브 경매** | 30초 타이머 + 10초 자동 연장 실시간 경매 |
| ⚡ **선착순 구매** | 먼저 구매 버튼 누른 사람이 낙찰 |
| 🎭 **블라인드 경매** | 다른 입찰가 안 보이는 밀봉 경매 |
| 🎁 **무료 나눔** | 추첨 방식 증정 |
| 🛒 **일반 판매** | 라이브 없이 상품 직접 구매 |
| 💬 **채팅 / DM** | 오픈 채팅방 + 1:1 다이렉트 메시지 |
| 📦 **위탁판매** | 농협 위탁판매 신청 및 관리 |
| 📊 **실시간 시세** | KAMIS API 연동 농산물 일별 시세 티커 |
| 👤 **팔로우** | 단골 셀러 팔로우 및 LIVE 알림 |
| 📍 **배송지 관리** | 다중 배송지 등록 및 관리 |

---

## 🏗 아키텍처

```
┌─────────────────────────────────────────────┐
│               Flutter App (Shell)            │
│  WebView ─────────────────────────────────  │
│  │  server/public/web/ (SPA)             │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │  27+ Pages  │  Design Tokens    │  │  │
│  │  │  Router     │  Components       │  │  │
│  │  └─────────────────────────────────┘  │  │
│  └── JS Bridge (권한·푸시·시큐어스토리지) ─┘  │
└─────────────────────────────────────────────┘
                       │ HTTP / WebSocket
┌─────────────────────────────────────────────┐
│           Node.js + Express Server           │
│                                              │
│  REST API ─── 11 Routes                      │
│  Socket.io ── Auction Engine (In-Memory)     │
│  LiveKit SDK ─ Room 관리 + 토큰 발급          │
│  KAMIS API ── 농산물 시세 캐싱               │
└──────────────────┬──────────────────────────┘
                   │
     ┌─────────────┴──────────┐
     │          MySQL          │
     │  users / products       │
     │  auctions / bids        │
     │  chat_rooms / messages  │
     │  market_prices          │
     └─────────────────────────┘
```

**경매 상태는 In-Memory Map으로 관리 (응답 속도 최우선)**  
**낙찰 이벤트 발생 시에만 MySQL에 영구 저장**

---

## 🔴 라이브 경매 엔진

```
셀러 PATCH /api/auctions/:id/start
        │
        ▼
   startTimer() ← 1초 setInterval
        │  매 tick: auction:update emit
        │  timeLeft = 0: auction:ended emit
        ▼
   Socket.io "bid" 이벤트 수신
        │  timeLeft ≤ 10 → +10초 자동 연장
        │  sellerId === bidderId → 차단
        ▼
   auction:ended → endAuction()
        │  DB INSERT … ON DUPLICATE KEY UPDATE
        │  LiveKit Room 삭제
        └→ 낙찰자에게 알림
```

---

## 📁 프로젝트 구조

```
barofarm/
├── app/                        # Flutter WebView 셸
│   └── lib/
│       ├── main.dart           # WebView + JS 브릿지
│       └── services/           # 네이티브 권한·푸시
│
├── server/                     # Node.js 서버
│   ├── src/
│   │   ├── index.ts            # Express + Socket.io 엔트리
│   │   ├── routes/             # REST API (11개)
│   │   ├── services/           # LiveKit, KAMIS, Auth, JWT
│   │   ├── store/              # In-Memory 경매 상태
│   │   └── middleware/         # Auth 미들웨어
│   │
│   ├── public/web/             # SPA 웹앱
│   │   ├── index.html          # 진입점
│   │   ├── scripts/            # Router, Socket, API, Bridge
│   │   ├── styles/             # Design Tokens (tokens.css)
│   │   ├── components/         # 공유 컴포넌트
│   │   └── pages/              # 27개 페이지 (JS + CSS)
│   │
│   └── db/
│       ├── schema.sql          # 초기 스키마
│       └── migrations/         # 020개 마이그레이션
│
├── docker-compose.yml
└── nginx/
```

---

## 🛠 기술 스택

### Backend
| 기술 | 버전 | 용도 |
|------|------|------|
| Node.js | 22 | 런타임 |
| Express | 4.21 | REST API 서버 |
| TypeScript | 5.8 | 타입 안전성 |
| Socket.io | 4.8 | 실시간 경매·채팅 |
| MySQL2 | 3.12 | 영구 데이터 저장 |
| LiveKit Server SDK | 2.13 | WebRTC 토큰·룸 관리 |
| bcrypt + JWT | — | 인증·보안 |

### Frontend (SPA)
| 기술 | 용도 |
|------|------|
| Vanilla JS (ES Module) | 프레임워크 없는 경량 SPA |
| CSS Custom Properties | Fresh Field 디자인 토큰 시스템 |
| Socket.io Client | 실시간 경매 상태 수신 |
| LiveKit Client (CDN) | 브라우저 WebRTC |

### Mobile Shell
| 기술 | 버전 | 용도 |
|------|------|------|
| Flutter | 3.7 | WebView 셸 |
| webview_flutter | 4.7 | 웹앱 렌더링 |
| flutter_secure_storage | 9.2 | 토큰 보안 저장 |
| firebase_messaging | 15.1 | 푸시 알림 (2차) |

---

## 🚀 로컬 실행

### 사전 요구사항

- Node.js 22+
- MySQL 9.6
- Flutter 3.7+ (앱 실행 시)
- [LiveKit Cloud](https://livekit.io) 계정

### 1. 환경 변수 설정

```bash
cp server/.env.example server/.env
```

```env
# DB
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASS=your_password
DB_NAME=barofarm

# JWT
JWT_SECRET=your_jwt_secret

# LiveKit
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_KEY=your_api_key
LIVEKIT_SECRET=your_api_secret

# KAMIS 농산물 시세 API
KAMIS_KEY=your_kamis_cert_key
KAMIS_ID=your_kamis_cert_id
```

### 2. DB 초기화

```bash
mysql -u root -p < server/db/schema.sql

# 마이그레이션 순차 적용
for f in server/db/migrations/*.sql; do
  mysql -u root -p barofarm < "$f"
done
```

### 3. 서버 실행

```bash
cd server
npm install
npm run dev          # tsx watch — 핫 리로드
```

서버 기동 후 브라우저에서 `http://localhost:3000/app/` 접속

### 4. Flutter 앱 실행 (선택)

```bash
cd app
flutter pub get
flutter run
```

---

## 📡 API 개요

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/api/auth/signup` | 회원가입 |
| `POST` | `/api/auth/login` | 로그인 |
| `GET` | `/api/auth/me` | 내 정보 조회 |
| `GET` | `/api/lives` | 라이브 목록 |
| `POST` | `/api/live/token` | LiveKit 토큰 발급 |
| `GET/POST` | `/api/auctions` | 경매 목록·생성 |
| `PATCH` | `/api/auctions/:id/start` | 경매 시작 |
| `GET/POST` | `/api/products` | 상품 목록·등록 |
| `POST` | `/api/products/:id/purchase` | 즉시 구매 |
| `GET/POST` | `/api/chat-rooms` | 채팅방 목록·생성 |
| `GET` | `/api/market-prices` | 농산물 일별 시세 |
| `GET` | `/api/market-prices/:itemCode/history` | 시세 이력 |

### Socket.io 이벤트

| 이벤트 | 방향 | 설명 |
|--------|------|------|
| `auction:join` | Client → Server | 경매 룸 입장 |
| `auction:bid` | Client → Server | 입찰가 전송 |
| `auction:update` | Server → Client | 1초 tick (가격·시간) |
| `auction:ended` | Server → Client | 낙찰 결과 |
| `auction:chat` | 양방향 | 라이브 채팅 |
| `cr:message` | 양방향 | 채팅방 메시지 |

---

## 🎨 디자인 시스템

`server/public/web/styles/tokens.css` 가 **단일 진실 공급원**입니다.  
모든 페이지·컴포넌트는 CSS 변수만 참조하며 색상 리터럴을 직접 사용하지 않습니다.

```css
--color-accent        /* 브랜드 그린 */
--color-ink           /* 주요 텍스트 */
--color-ink-mute      /* 보조 텍스트 */
--color-surface       /* 카드 배경 */
--color-bg            /* 페이지 배경 */
--color-line          /* 구분선 */
```

---

## 📊 농산물 시세 연동 (KAMIS)

[한국농수산식품유통공사 KAMIS OpenAPI](https://www.kamis.or.kr/customer/reference/openapi_list.do)를 활용해  
과일·채소·곡물·축산·수산 15개 대표 품목의 일별 시세를 제공합니다.

- **캐싱 전략**: 당일 첫 조회 시 KAMIS API 호출 → MySQL `market_prices` 테이블 저장 → 이후 DB 조회
- **홈화면**: 무한 루프 가로 스크롤 티커
- **상세 화면**: 30일 가격 추이 SVG 차트 + 등락 표시

---

## 🗺 개발 로드맵

| Stage | 내용 | 상태 |
|-------|------|------|
| Stage 1 | LiveKit 인프라 + 서버 기반 구축 | ✅ 완료 |
| Stage 2 | Socket.io 경매 엔진 | ✅ 완료 |
| Stage 3 | SPA 웹앱 + Flutter WebView 셸 | 🔧 진행 중 |
| Stage 4 | UI 고도화 + AWS 배포 | ❌ 예정 |

---

## 📄 라이선스

Private — All rights reserved © 2026 Barofarm

---

<div align="center">

**🌱 농부와 소비자를 직접 잇는 바로팜**

</div>
