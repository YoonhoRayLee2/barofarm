# 바로팜 개발 페이즈 — 진행 현황

> 최종 갱신: 2026-04-27 (4차)

---

## 범례

| 아이콘 | 의미 |
|---|---|
| ✅ | 완료 |
| ⚠️ | 완료 (이슈 있음) |
| 🔧 | 진행 중 |
| ❌ | 미착수 |

---

## Stage 1 — LiveKit 인프라 + 서버 기반 구축 ✅ 완료

> 목표: LiveKit 토큰 API + 셀러→바이어 영상 전송 데모

| # | 작업 | 파일 | 상태 |
|---|------|------|------|
| 1-1 | TypeScript 프로젝트 설정 | `server/tsconfig.json` | ✅ |
| 1-2 | Express + Socket.io + CORS 초기화 | `server/src/index.ts` | ✅ |
| 1-3 | MySQL 연결 풀 | `server/src/db/mysql.ts` | ✅ |
| 1-4 | DB 스키마 (users/auctions/bids/chats) | `server/db/schema.sql` | ✅ |
| 1-5 | LiveKit 토큰 발급 API (`POST /api/live/token`) | `server/src/routes/live.ts` | ✅ |
| 1-6 | 정적 파일 서빙 (`/live` 경로) | `server/src/index.ts:21` | ✅ |
| 1-7 | 셀러용 LiveKit WebView HTML | `server/public/live-seller.html` | ✅ |
| 1-8 | 바이어용 LiveKit WebView HTML | `server/public/live-buyer.html` | ✅ |
| 1-9 | `.env.example` 작성 | `server/.env.example` | ✅ |
| 1-10 | MySQL 9.6 설치 (MariaDB 제거) + DB 초기화 | 로컬 환경 | ✅ |
| 1-11 | `barofarm` DB + 테이블 4개 생성 (schema.sql 적용) | `server/db/schema.sql` | ✅ |
| 1-12 | `.env` DB_PASS=1234 설정 + 서버 정상 기동 확인 | `server/.env` | ✅ |

**검증 포인트:** 셀러 카메라가 바이어 화면에 실시간 출력
→ 코드·DB 구현 완료. LiveKit Cloud 키 `.env` 등록 완료(`LIVEKIT_KEY`, `LIVEKIT_URL`). 실제 단말 영상 검증 필요.

---

## Stage 2 — Socket.io 경매 엔진 ✅ 완료 (경고 4건 존재)

> 목표: 입찰·채팅·30초 타이머·10초 연장·낙찰 처리·DB 저장

| # | 작업 | 파일 | 상태 |
|---|------|------|------|
| 2-1 | In-Memory 경매 상태 Map | `server/src/store/memory.ts` | ✅ |
| 2-2 | `createAuction()` — 초기 상태 생성 | `server/src/store/memory.ts:22` | ✅ |
| 2-3 | `startTimer()` — 1초 setInterval 루프 | `server/src/store/memory.ts:34` | ✅ |
| 2-4 | `stopTimer()` — clearInterval | `server/src/store/memory.ts:56` | ✅ |
| 2-5 | Socket `join` — 룸 입장 + 현재 상태 emit | `server/src/socket/auction.ts:6` | ✅ |
| 2-6 | Socket `bid` — 10초 자동 연장 포함 | `server/src/socket/auction.ts:12` | ✅ |
| 2-7 | Socket `chat` — 채팅 브로드캐스트 | `server/src/socket/auction.ts:26` | ✅ |
| 2-8 | `auction:update` 1초 tick emit | `server/src/store/memory.ts:46` | ✅ |
| 2-9 | `auction:ended` 타이머 0초 emit | `server/src/store/memory.ts:47` | ✅ |
| 2-10 | 경매 CRUD REST API | `server/src/routes/auctions.ts` | ✅ |
| 2-11 | `PATCH /:id/start` → 메모리 + 타이머 시작 | `server/src/routes/auctions.ts:46` | ✅ |
| 2-12 | `PATCH /:id/end` → DB 낙찰 저장 + 메모리 삭제 | `server/src/routes/auctions.ts:61` | ✅ |
| 2-13 | `POST /api/users` 사용자 생성/upsert | `server/src/routes/users.ts` | ✅ |
| 2-W1 | `PATCH /:id/start` 중복 호출 방어 | `routes/auctions.ts:58-61` | ✅ |
| 2-W3 | 셀러 본인 입찰 차단 | `socket/auction.ts:15` | ✅ |
| 2-W4 | `LIVEKIT_URL` 미설정 시 500 반환 | `routes/live.ts` | ✅ |
| 2-W5 | 서버 재시작 시 메모리 손실 | — | ⚠️ 알려진 한계 (Redis 2차) |
| 2-LK1 | RoomServiceClient + `deleteRoom()` | `services/livekit-service.ts` | ✅ |
| 2-LK2 | `endAuction()` 헬퍼 — DB 저장 + 룸 삭제 통합 | `services/livekit-service.ts` | ✅ |
| 2-LK3 | 타이머 자동 종료 → DB 낙찰 저장 (onEnd 콜백) | `store/memory.ts`, `routes/auctions.ts` | ✅ |
| 2-LK4 | `PATCH /:id/end` → LiveKit 룸 강제 삭제 | `routes/auctions.ts` | ✅ |
| 2-LK5 | 부트스트랩 복원 경매 onEnd 연동 | `src/index.ts` | ✅ |
| 2-LK6 | 타이머 종료 후 메모리 Map 정리 | `store/memory.ts` | ✅ |
| 2-LK7 | 서버 시작 시 LiveKit env 누락 경고 로그 | `src/index.ts` | ✅ |

**검증 포인트:** 두 브라우저에서 입찰가 동기화 + 10초 연장 동작
→ 코드 구현 완료. E2E 브라우저 테스트 미실행.

---

## Stage 3 — Flutter 앱 구현 🔧 진행 중

> 목표: Flutter 프로젝트 + webview_flutter + 경매 목록 + 라이브 화면

### 완료

| # | 작업 | 파일 | 상태 |
|---|------|------|------|
| 3-1 | Flutter 프로젝트 생성 | `app/` | ✅ |
| 3-2 | 패키지 설정 (webview_flutter, socket_io_client, dio, flutter_secure_storage, firebase_messaging) | `app/pubspec.yaml` | ✅ |
| 3-3 | 서버 URL 설정 | `app/lib/app_config.dart` | ✅ |
| 3-4 | Fresh Field 디자인 시스템 (라이트/다크 ThemeData) | `app/lib/app_theme.dart` | ✅ |
| 3-5 | Auction 모델 | `app/lib/models/auction.dart` | ✅ |
| 3-6 | User 모델 | `app/lib/models/user.dart` | ✅ |
| 3-7 | ChatMessage 모델 | `app/lib/models/message.dart` | ✅ |
| 3-8 | ApiService (Dio singleton) — createUser, getAuctions, getToken | `app/lib/services/api_service.dart` | ✅ |
| 3-9 | SocketService (socket_io_client singleton) — connect, join, bid, sendChat, Stream | `app/lib/services/socket_service.dart` | ✅ |
| 3-10 | 로그인 화면 (이름/전화번호/역할 선택) | `app/lib/features/auth/login_screen.dart` | ✅ |
| 3-11 | 홈 화면 (경매 목록 + 새로고침 + NavigationBar) | `app/lib/features/home/home_screen.dart` | ✅ |
| 3-12 | 경매 카드 위젯 | `app/lib/features/home/widgets/auction_card.dart` | ✅ |
| 3-13 | 라이브 화면 (WebView + Socket.io 오버레이 Stack) | `app/lib/features/live/live_screen.dart` | ✅ |
| 3-14 | LIVE 뱃지 위젯 | `app/lib/features/live/widgets/live_badge.dart` | ✅ |
| 3-15 | 타이머 표시 위젯 (색상 변화) | `app/lib/features/live/widgets/timer_display.dart` | ✅ |
| 3-16 | 채팅 오버레이 위젯 | `app/lib/features/live/widgets/chat_overlay.dart` | ✅ |
| 3-17 | 입찰 단위 칩 위젯 (+500/+1K/+2K/+5K) | `app/lib/features/live/widgets/bid_chips.dart` | ✅ |
| 3-18 | 슬라이드 입찰 확인 위젯 | `app/lib/features/live/widgets/slide_bid.dart` | ✅ |
| 3-19 | FlutterChannel JS 브릿지 수신 (onLiveStart/onLiveEnd/onLiveError) | `live_screen.dart:72` | ✅ |
| 3-20 | 경매 종료 오버레이 (낙찰자·낙찰가) | `live_screen.dart:248` | ✅ |

### 미완료

| # | 작업 | 파일 | 상태 |
|---|------|------|------|
| 3-M1 | **main.dart — LoginScreen 진입으로 교체** | `app/lib/main.dart` | ✅ |
| 3-M1a | iOS Podfile platform :ios 13.0 설정 | `app/ios/Podfile` | ✅ |
| 3-M1b | Android 에뮬레이터 빌드 + LoginScreen 렌더링 확인 | — | ✅ |
| 3-M2 | 실물 Android/iOS 기기 빌드 + 동작 확인 | — | ❌ |
| 3-M3 | timer_display.dart shake 애니메이션 (3초↓ 레드+shake) | `timer_display.dart` | ✅ |
| 3-M4 | 셀러 경매 생성 화면 (POST /api/auctions + start) | `features/seller/create_auction_screen.dart` | ✅ |
| 3-M5 | AppConfig baseUrl 환경 분리 (dev/prod) | `app_config.dart` | ❌ |
| 3-M6 | Pretendard 폰트 assets 등록 | `pubspec.yaml` | ❌ |

**검증 포인트:** 실물 기기 앱 실행 + 입찰 동작 확인
→ Android 에뮬레이터에서 LoginScreen 렌더링 확인 완료. 서버 `/api/users` 응답 정상 확인. iOS는 Xcode iOS 18.2 SDK 설치 후 가능.

---

## Stage 4 — UI 고도화 + 배포 ❌ 미착수

> 목표: UI 고도화·부하테스트·AWS EC2 Docker 배포·MVP 시연

| # | 작업 | 상태 |
|---|------|------|
| 4-1 | UI 고도화 (애니메이션, 전환 효과) | ❌ |
| 4-2 | 셀러 경매 관리 화면 | ❌ |
| 4-3 | 부하테스트 (10명 동시 접속) | ❌ |
| 4-4 | Dockerfile 작성 (server) | ❌ |
| 4-5 | AWS EC2 인스턴스 설정 | ❌ |
| 4-6 | Docker Compose (server + MySQL) | ❌ |
| 4-7 | 도메인 + SSL (nginx + Let's Encrypt) | ❌ |
| 4-8 | MVP 시연 | ❌ |

**검증 포인트:** 10명 동시 접속 지연 없음 + 외부 접속 확인

---

## 당장 해야 할 작업 (최우선)

```
1. 실물 기기(Android/iOS) 연결 테스트 [3-M2]
2. AppConfig baseUrl 환경 분리 (dev/prod) [3-M5]
3. Pretendard 폰트 assets 등록 [3-M6]
4. Stage 4 시작: Dockerfile + AWS 배포 준비 [4-1~]
```

---

## 진행률 요약

| 단계 | 완료 | 전체 | 진행률 |
|---|---|---|---|
| Stage 1 (서버 인프라) | 12 / 12 | 12 | **100%** |
| Stage 2 (경매 엔진 + LiveKit 통합) | 24 / 25 | 25 | **96%** (W5 Redis 알려진 한계) |
| Stage 3 (Flutter 앱) | 25 / 29 | 29 | **86%** |
| Stage 4 (배포) | 0 / 8 | 8 | **0%** |
| **전체** | **61 / 74** | **74** | **82%** |
