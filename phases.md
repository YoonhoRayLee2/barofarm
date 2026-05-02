# 바로팜 개발 페이즈 — 진행 현황

> 최종 갱신: 2026-05-01 (17차) — wyyyes UI/UX 전면 적용: 홈 2컬럼 그리드·카드 3/4 비율·LIVE 펄스·뷰어수, 바이어 화면 상품패널·팔로우·코인칩·수직스와이프·종료 confetti, 채팅 입력창 상시 노출, 셀러 진행바 타이머·AI 버튼. lint-tokens PASS.

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

## Stage 3 — 앱 구현 🔧 진행 중 (WebView 셸 + SPA 웹앱으로 전환)

> 목표: Flutter는 얇은 WebView 셸로 축소, 모든 화면 UI는 `server/public/web/` SPA로 이전. Fresh Field 디자인 시스템은 `tokens.css` 단일 진실 공급원.
> 결정 일자: 2026-04-28 — Flutter 네이티브 위젯으로는 디자인 시스템 정합화가 어렵고, 라이브 화면은 이미 WebView이므로 일관성을 위해 전체 셸 전환.

### 완료 (Flutter 네이티브 단계)

> ⚠️ 아래 ⛔ 표기 항목은 **WebView 전환으로 대체** — `server/public/web/` SPA로 재구현될 예정. 코드 산출물은 디자인·로직 참고용으로만 유지.

| # | 작업 | 파일 | 상태 |
|---|------|------|------|
| 3-1 | Flutter 프로젝트 생성 | `app/` | ✅ (셸로 축소 예정) |
| 3-2 | 패키지 설정 (webview_flutter, socket_io_client, dio, flutter_secure_storage, firebase_messaging) | `app/pubspec.yaml` | ✅ → 의존성 정리 예정 (3-W10) |
| 3-3 | 서버 URL 설정 | `app/lib/app_config.dart` | ✅ (유지) |
| 3-4 | Fresh Field 디자인 시스템 (라이트/다크 ThemeData) | `app/lib/app_theme.dart` | ⛔ WebView 전환으로 대체 → `tokens.css` (3-W3) |
| 3-5 | Auction 모델 | `app/lib/models/auction.dart` | ⛔ WebView 전환으로 대체 → `scripts/models.js` |
| 3-6 | User 모델 | `app/lib/models/user.dart` | ⛔ WebView 전환으로 대체 |
| 3-7 | ChatMessage 모델 | `app/lib/models/message.dart` | ⛔ WebView 전환으로 대체 |
| 3-8 | ApiService (Dio singleton) — createUser, getAuctions, getToken | `app/lib/services/api_service.dart` | ⛔ WebView 전환으로 대체 → `scripts/api.js` (3-W5) |
| 3-9 | SocketService (socket_io_client singleton) — connect, join, bid, sendChat, Stream | `app/lib/services/socket_service.dart` | ⛔ WebView 전환으로 대체 → `scripts/socket.js` (3-W6) |
| 3-10 | 로그인 화면 (이름/전화번호/역할 선택) | `app/lib/features/auth/login_screen.dart` | ⛔ WebView 전환으로 대체 → `pages/login.html` (3-W13) |
| 3-11 | 홈 화면 (경매 목록 + 새로고침 + NavigationBar) | `app/lib/features/home/home_screen.dart` | ⛔ WebView 전환으로 대체 → `pages/home.html` (3-W14) |
| 3-12 | 경매 카드 위젯 | `app/lib/features/home/widgets/auction_card.dart` | ⛔ WebView 전환으로 대체 → `components/live-card.js` |
| 3-13 | 라이브 화면 (WebView + Socket.io 오버레이 Stack) | `app/lib/features/live/live_screen.dart` | ⛔ WebView 전환으로 대체 → `pages/live-seller.html` (3-W19) |
| 3-14 | LIVE 뱃지 위젯 | `app/lib/features/live/widgets/live_badge.dart` | ⛔ WebView 전환으로 대체 → `components/live-badge.css` |
| 3-15 | 타이머 표시 위젯 (색상 변화) | `app/lib/features/live/widgets/timer_display.dart` | ⛔ WebView 전환으로 대체 → `components/timer.js` |
| 3-16 | 채팅 오버레이 위젯 | `app/lib/features/live/widgets/chat_overlay.dart` | ⛔ WebView 전환으로 대체 → `components/chat-overlay.js` |
| 3-17 | 입찰 단위 칩 위젯 (+500/+1K/+2K/+5K) | `app/lib/features/live/widgets/bid_chips.dart` | ⛔ WebView 전환으로 대체 → `components/bid-chips.js` |
| 3-18 | 슬라이드 입찰 확인 위젯 | `app/lib/features/live/widgets/slide_bid.dart` | ⛔ WebView 전환으로 대체 → `components/slide-bid.js` |
| 3-19 | FlutterChannel JS 브릿지 수신 (onLiveStart/onLiveEnd/onLiveError) | `live_screen.dart:72` | ⛔ WebView 전환으로 대체 → `native_bridge.dart` 통합 (3-W9) |
| 3-20 | 경매 종료 오버레이 (낙찰자·낙찰가) | `live_screen.dart:248` | ⛔ WebView 전환으로 대체 → `pages/live-buyer.html` |

### 미완료

| # | 작업 | 파일 | 상태 |
|---|------|------|------|
| 3-M1 | **main.dart — LoginScreen 진입으로 교체** | `app/lib/main.dart` | ✅ |
| 3-M1a | iOS Podfile platform :ios 13.0 설정 | `app/ios/Podfile` | ✅ |
| 3-M1b | Android 에뮬레이터 빌드 + LoginScreen 렌더링 확인 | — | ✅ |
| 3-M2 | 실물 Android/iOS 기기 빌드 + 동작 확인 | — | ❌ |
| 3-M3 | timer_display.dart shake 애니메이션 (3초↓ 레드+shake) | `timer_display.dart` | ✅ |
| 3-M4 | 셀러 경매 생성 화면 (POST /api/auctions + start) | `features/seller/create_auction_screen.dart` | ✅ |
| 3-M5 | AppConfig baseUrl 환경 분리 (Android 에뮬/iOS 시뮬/dart-define 분기) | `app_config.dart` | ✅ |
| 3-M6 | Pretendard 폰트 assets 등록 | `pubspec.yaml` | ❌ |
| 3-M7 | 경매 화면 레퍼런스(wyyyes) 기반 UI 전면 재설계 — 판매자 프로필 상단바, 소리끄기/팔로우/코인 칩, 하단 상품패널, 빨간 참여버튼, 메시지 입력바 | `buyer_live_screen.dart`, `live_screen.dart` | ✅ |
| 3-M8 | ResponsiveLayout + LiveViewWidget 리팩토링 (태블릿/데스크톱 사이드패널 레이아웃) | `live_screen.dart`, `buyer_live_screen.dart` | ✅ |
| 3-M9 | 데모 경매창 `SampleAuctionScreen` — 서버 없이 동작, 타이머·자동채팅·자동입찰 시뮬레이션 | `features/live/sample_auction_screen.dart` | ✅ |
| 3-M10 | 홈 AppBar에 데모 버튼(▶) 추가 | `features/home/home_screen.dart` | ✅ |
| 3-M11 | Direction B (Fresh Field) 디자인 시스템 전면 적용 — bg #0E1A12, accent #7AA53F, cta #D6473A, 타이포 스케일, ThemeData 통합 | `app_theme.dart`, 전 Flutter 파일 | ✅ → tokens.css 이식 예정 (3-W3) |
| 3-M12 | google_fonts 패키지 추가 | `pubspec.yaml` | ✅ → Google Fonts CDN으로 전환 예정 |
| 3-M13 | 역할 통합 — 로그인 시 역할 선택 제거, 경매 개설자 여부로 seller/buyer 결정 | `user.dart`, `login_screen.dart`, `api_service.dart`, `home_screen.dart`, `server/routes/` | ✅ (서버 측 유지, 클라이언트는 SPA로 이전) |
| 3-M14 | 하단 탭 전체 화면 구현 — 관심/내정보/FAB 바텀시트/설정 | `favorites_screen.dart`, `profile_screen.dart`, `settings_screen.dart`, `fab_bottom_sheet.dart`, `group_card.dart` | ⛔ WebView 전환으로 대체 (3-W15~17) |
| 3-M15 | 홈 화면 디자인 업데이트 — pill 카테고리 탭, 서브탭(지금경매/예고/곧마감), 수산 카테고리 추가 | `home_screen.dart` | ⛔ WebView 전환으로 대체 → `pages/home.html` (3-W14) |
| 3-M16 | Live 모델 도입 (Live↔Auction 분리) — POST/GET/PATCH `/api/lives`, sockets `liveId` 룸, viewer:count, 홈 ↔ 라이브 화면 라우팅 | `routes/live.ts`, `store/memory.ts`, `socket/auction.ts`, `models/live.dart`, `home_screen.dart` | ✅ (서버 유지, 클라이언트는 SPA) |
| 3-M17 | 소켓/스트리밍 버그 수정 — buyer 채팅바 누락(_BottomPanel auction nullable), `_auction==null`일 때 첫 `auction:update`로 Auction.fromJson 초기화, `lobby:live:new`/`lobby:live:ended` emit 정합화, chat에 userName 전파 | `buyer_live_screen.dart`, `live_screen.dart`, `routes/live.ts`, `store/memory.ts`, `socket/auction.ts`, `socket_service.dart` | ✅ (서버 측 정합화 유지, Flutter 측은 SPA로 이전 시 폐기) |

---

### W시리즈 — WebView 셸 전환 + Fresh Field SPA 정합화 (3-W1 ~ 3-W30)

> 결정 일자: 2026-04-28. Plan 파일: `~/.claude/plans/enumerated-juggling-wilkinson.md`
> 5단계 마이그레이션 (5-A 기반 → 5-B 셸 → 5-C 인증/홈 → 5-D 라이브 → 5-E 정리)

#### 5-A. 기반 (3~4일) — backend-dev + web-ui-dev

| # | 작업 | 파일 | 상태 |
|---|------|------|------|
| 3-W1 | `server/public/web/` 디렉토리 구조 생성 (pages/components/scripts/styles) | `server/public/web/` | ✅ |
| 3-W2 | Express에 `/app` 정적 서빙 + history fallback 추가 | `server/src/index.ts` | ✅ |
| 3-W3 | `tokens.css` 작성 — Fresh Field 컬러·폰트·radius 토큰 (단일 진실 공급원) | `server/public/web/styles/tokens.css` | ✅ |
| 3-W4 | `base.css` / `type.css` / `layout.css` 작성 — 리셋·텍스트 클래스·그리드 | `server/public/web/styles/` | ✅ |
| 3-W5 | `scripts/api.js` — fetch wrapper (createUser, getAuctions, getToken, createLive 등) | `server/public/web/scripts/api.js` | ✅ |
| 3-W6 | `scripts/socket.js` — socket.io-client CDN 래퍼 (join/bid/chat/auction:update 이벤트) | `server/public/web/scripts/socket.js` | ✅ |
| 3-W7 | `scripts/router.js` + `native-bridge.js` — History API SPA 라우터 + 브릿지 폴백 | `server/public/web/scripts/` | ✅ |

#### 5-B. Flutter 셸 전환 (2~3일) — shell-dev

| # | 작업 | 파일 | 상태 |
|---|------|------|------|
| 3-W8 | `webview_shell.dart` 작성 — fullscreen WebView, 시작 URL `${baseUrl}/app`, `onWebResourceError` | `app/lib/webview_shell.dart` | ✅ |
| 3-W9 | `native_bridge.dart` — JS 채널 + native→web 콜백 (`onPush`, `onAppResume`) | `app/lib/native_bridge.dart` | ✅ |
| 3-W10 | `main.dart` 재작성 — MaterialApp 1개 화면(WebViewShell)으로 축소, 의존성 정리 | `app/lib/main.dart`, `app/pubspec.yaml` | ✅ |
| 3-W11 | `app/lib/features/`, `models/`, `services/`, `widgets/`, `app_theme.dart` 삭제 | `app/lib/` | ✅ |
| 3-W12 | Android 에뮬에서 셸 부팅 → `${baseUrl}/app` 로딩 확인 | — | ⚠️ flutter analyze 0 issues, 실기기 실행은 사용자 |

#### 5-C. 인증·홈 (4~5일) — web-ui-dev

| # | 작업 | 파일 | 상태 |
|---|------|------|------|
| 3-W13 | `pages/login.js` — 이름/전화 입력, `POST /api/users`, secure storage 저장 | `server/public/web/pages/login.js` | ✅ |
| 3-W14 | `pages/home.js` + `components/live-card.js` + `bottom-tab-bar.js` — 카테고리 pill, 서브탭, LiveCard, lobby 소켓 구독 | `server/public/web/pages/home.js`, `components/` | ✅ |
| 3-W15 | `components/fab-modal.js` — 라이브 시작 진입 바텀시트 | `server/public/web/components/fab-modal.js` | ✅ |
| 3-W16 | `pages/profile.js` / `favorites.js` 스켈레톤 + 로그아웃 | `server/public/web/pages/` | ✅ |
| 3-W17 | `pages/chat.js` / `settings.js` 스켈레톤 (FCM 토큰 표시) | `server/public/web/pages/` | ✅ |
| 3-W18 | `pages/auction-detail.js` / `create-auction.js` / `live-create.js` / `sample.js` 스켈레톤 | `server/public/web/pages/` | ✅ |

#### 5-D. 라이브 화면 (4~5일) — livekit-specialist + web-ui-dev

| # | 작업 | 파일 | 상태 |
|---|------|------|------|
| 3-W19 | `pages/live-seller.js` + `live-seller.css` — LIVE 배지·시청자수·종료·경매 등록 모달·채팅·타이머·낙찰 오버레이 | `server/public/web/pages/live-seller.js` | ✅ |
| 3-W20 | `pages/live-buyer.js` + `live-buyer.css` — 원격 비디오·입찰 슬라이더·bid chips·낙찰 오버레이 | `server/public/web/pages/live-buyer.js` | ✅ |
| 3-W21 | `pages/live-create.js` — 2단계 마법사 (타이틀 입력 → 권한 안내 → createLive → live-seller redirect) | `server/public/web/pages/live-create.js` | ✅ |
| 3-W22 | `components/timer.js` (색상 변화 + shake) / `slide-bid.js` (드래그 70% confirm) / `chat-overlay.js` (30개 stack + 5초 fade) / `bid-chips.js` (+500/+1K/+2K/+5K) | `server/public/web/components/` | ✅ |
| 3-W23 | LK-1: 토큰 응답 로깅 (`POST /api/live/token`, `POST /api/lives` 양쪽) — tokenPrefix·serverUrl·role·room | `server/src/routes/live.ts` | ✅ |
| 3-W24 | LK-2: `classifyConnectError` 헬퍼 (`scripts/livekit.js`) — connection·permission·media·other 분기 | `server/public/web/scripts/livekit.js` | ✅ |
| 3-W25 | LK-4: `GET /api/live/health` — RoomServiceClient.listRooms() 도달성 검증 | `server/src/routes/live.ts` | ✅ |
| 3-W26 | LK-3·LK-5: 셸 헬스체크 URL을 `/api/live/health` 로 정렬 (LiveKit 도달성 동시 확인) | `app/lib/webview_shell.dart:104` | ✅ |
| 3-W22+ | `scripts/livekit.js` 신규 — connectRoom/publishCamera/attachLocalVideo/attachRemoteTracks/disconnect 헬퍼 + LiveKit SDK CDN | `server/public/web/scripts/livekit.js`, `index.html` | ✅ |

#### 5-E. 정리·검증 (2일) — qa + planner

| # | 작업 | 파일 | 상태 |
|---|------|------|------|
| 3-W27 | Flutter 잔재 제거 확인 — `app/lib/`에 main/app_config/webview_shell/native_bridge 4개만 존재 | `app/lib/` | ✅ |
| 3-W28 | CLAUDE.md 핵심 원칙 갱신 확인 (#2′ + #5) | `CLAUDE.md` | ✅ (2026-04-28) |
| 3-W29 | 하네스 갱신 확인 — shell-dev/web-ui-dev/livekit-specialist/backend-dev | `.claude/agents/` | ✅ (2026-04-28) |
| 3-W30 | qa 전체 검증 — 경계면 정합성·디자인 토큰·헬스 URL 정렬 통과 | — | ✅ |

**검증 포인트:** 실물 기기 앱 실행 + 입찰 동작 확인
→ Android 에뮬레이터에서 LoginScreen 렌더링 확인 완료. 서버 `/api/users` 응답 정상 확인. 경매 UI wyyyes 레퍼런스 반영 완료. Fresh Field 다크 디자인 시스템 전면 적용 완료. iOS는 Xcode iOS 18.2 SDK 설치 후 가능.

---

## Stage 5 — 경매 방식 3종 확장 (bidding.md PRD rev 0) 🔧 진행 중

> 목표: bidding.md PRD에 정의된 3가지 경매 방식(일반경매/선착순구매/블라인드 경매)을 서버·SPA에 모두 반영.
> 결정 일자: 2026-04-28 — 기존 코드는 일반경매만(고정 30s) 지원하므로, `mode` 식별자와 모드별 파라미터를 신설.

### 5-1. 데이터 모델·서버 (backend-dev)

| # | 작업 | 파일 | 상태 |
|---|------|------|------|
| 5-1 | `AuctionState`에 `mode`, `durationSec`, `stockTotal`, `stockSold`, `blindBids`, `revealAt` 필드 추가 | `server/src/store/memory.ts` | ✅ |
| 5-2 | 일반경매 30/60s 옵션화 — `createAuction({ durationSec })` 반영 | `store/memory.ts`, `routes/live.ts` | ✅ |
| 5-3 | 선착순구매(`mode='fcfs'`) — `purchase` 이벤트, 매진 자동 종료, `PATCH /end-fcfs` 중도 종료 | `socket/auction.ts`, `routes/live.ts`, `store/memory.ts` | ✅ |
| 5-4 | 블라인드 경매(`mode='blind'`) — `bid:blind` 비공개 수집, 종료 시 price DESC/ts ASC 정렬 낙찰 | `socket/auction.ts`, `store/memory.ts` | ✅ |
| 5-5 | 블라인드 종료 후 입찰 내역 공개 — `GET /:auctionId/bids` (endedBlindBids 30분 TTL) | `routes/live.ts` | ✅ |
| 5-6 | 모드별 입력 검증 — POST `/auctions` body 확장 + 400 반환 | `routes/live.ts` | ✅ |

### 5-2. SPA 구현 (web-ui-dev)

| # | 작업 | 파일 | 상태 |
|---|------|------|------|
| 5-7 | 셀러 경매 등록 모달 — 모드 라디오 3종 + 모드별 옵션 폼 + FCFS 조기종료 버튼 | `pages/live-seller.js/css` | ✅ |
| 5-8 | 바이어 일반경매 — durationSec 기반 표시, switchBidMode 분기 | `pages/live-buyer.js`, `components/timer.js` | ✅ |
| 5-9 | 바이어 선착순구매 — `buy-button.js` 신규, 잔여 수량 표시, 매진 disable | `pages/live-buyer.js`, `components/buy-button.js/css` | ✅ |
| 5-10 | 바이어 블라인드 — `blind-bid.js` 신규, ack 잠금, 결과 모달 내역 토글 | `pages/live-buyer.js`, `components/blind-bid.js/css` | ✅ |
| 5-11 | `scripts/socket.js` — `purchase`, `bidBlind`, `onPurchaseMade`, `onBidBlindAck` 추가 | `scripts/socket.js` | ✅ |
| 5-12 | `scripts/api.js` — `createAuction`/`endFcfsAuction`/`getBlindBids` 추가 | `scripts/api.js` | ✅ |

### 5-3. 검증 (qa)

| # | 작업 | 파일 | 상태 |
|---|------|------|------|
| 5-13 | 3종 모드 E2E 검증 — REST↔Socket↔SPA 페이로드/이벤트/검증값 일치, 블라인드 공개·선착순 종료 흐름, 토큰 준수 | — | ✅ |

**검증 포인트:** 일반(60s 연장), 선착순(매진/중도종료), 블라인드(동가 선응찰 우선·종료 후 내역 공개) 각각 정상 동작.

---

## Stage 4 — UI 고도화 + 배포 ❌ 미착수

> 목표: UI 고도화·부하테스트·AWS EC2 Docker 배포·MVP 시연

| # | 작업 | 상태 |
|---|------|------|
| 4-1 | UI 고도화 (라우트 전환·LiveCard 스켈레톤·전역 토스트·버튼 인터랙션) | ✅ |
| 4-1b | 미구현 화면 6종 실구현 + favorites/history API + GET /api/lives/:id | ✅ |
| 4-2 | 셀러 경매 관리 화면 (요약 4지표·진행/예고/종료 탭·종료 confirm·dashboard-summary API) | ✅ |
| 4-3 | 부하테스트 (10명 동시 접속) | ❌ |
| 4-4 | Dockerfile 작성 (server) — multi-stage + non-root + EXPOSE 3000 | ✅ |
| 4-5 | AWS EC2 인스턴스 설정 | ❌ |
| 4-6 | Docker Compose (server + MySQL 8 + healthcheck + named volume) | ✅ |
| 4-7 | 도메인 + SSL (nginx + Let's Encrypt) | ⛔ 스킵 (MVP 범위 외, 2026-04-29) |
| 4-8 | MVP 시연 | ❌ |

**검증 포인트:** 10명 동시 접속 지연 없음 + 외부 접속 확인

---

## Stage 6 — 고도화 W+0 ✅ T6-AUTH·T6-DS 완료 (2026-04-30)

> 플랜: `~/.claude/plans/eager-brewing-badger.md`. Critical Path: T6-AUTH → T6-DS → T6-CAT → T6-ORD.

### T6-AUTH — 회원가입·로그인·JWT·랜덤 닉네임 ✅

| # | 작업 | 파일 | 상태 |
|---|------|------|------|
| AUTH-1 | DB users 컬럼 추가 (username/password_hash/phone NOT NULL/nickname) | `db/migrations/002_users_auth.sql`, `003_users_auth_notnull.sql`, `db/schema.sql` | ✅ |
| AUTH-2 | bcrypt 해싱 모듈 | `services/auth.ts` | ✅ |
| AUTH-3 | 랜덤 닉네임 생성기 (형용사50×동물30×000~999) | `services/nickname.ts` | ✅ |
| AUTH-4 | `POST /api/auth/signup` | `routes/auth.ts` | ✅ |
| AUTH-5 | `POST /api/auth/login` | `routes/auth.ts` | ✅ |
| AUTH-6 | JWT (HS256, access 14d / refresh 30d) | `services/jwt.ts` | ✅ |
| AUTH-7 | `requireAuth` / `optionalAuth` 미들웨어 | `middleware/auth.ts` | ✅ |
| AUTH-8 | `pages/login.js` 개편 (username/password) | `web/pages/login.{js,css}` | ✅ |
| AUTH-9 | `pages/signup.js` 신규 + 환영 모달 | `web/pages/signup.{js,css}`, `components/welcome-nickname-modal.{js,css}` | ✅ |
| AUTH-10 | secure storage 토큰 + Authorization 자동 첨부 + 401 refresh-or-logout | `web/scripts/api.js`, `router.js` | ✅ |
| AUTH-11 | 휴대폰 형식 검증 + 자동 포맷팅 | `utils/phone.ts`, `web/pages/signup.js` | ✅ |
| AUTH-12 | 기존 사용자 마이그레이션 스크립트 | `scripts/migrate-users-auth.ts` | ✅ |
| AUTH-13 | qa: API shape↔클라 처리, 검증 규칙 일치, 마이그레이션 안전성 | — | ✅ (13/13 통과) |

### T6-DS — 디자인 시스템 v2 ✅

| # | 작업 | 파일 | 상태 |
|---|------|------|------|
| DS-1 | spacing 스케일 `--space-0..7` | `styles/tokens.css` | ✅ |
| DS-2 | type 스케일 `--fs-xs..3xl`, `--lh-tight/normal/relaxed` | `styles/tokens.css` | ✅ |
| DS-3 | motion 토큰 `--dur-fast/base/slow`, `--ease-out/in-out` | `styles/tokens.css` | ✅ |
| DS-4 | elevation 토큰 `--elev-1..3` | `styles/tokens.css` | ✅ |
| DS-5 | z-index 스케일 토큰 (base/sticky/overlay/modal/toast) | `styles/tokens.css` | ✅ |
| DS-6 | `/app/_storybook` 컴포넌트 카탈로그 + 토큰 팔레트 | `pages/_storybook.js`, `scripts/router.js` | ✅ |
| DS-7 | 11개 컴포넌트 + 페이지 4종 토큰 일괄 치환 | `components/*.css`, `pages/live-*.css`, `profile.css` | ✅ |
| DS-8 | base.css / transitions.css 토큰화 | `styles/base.css`, `transitions.css` | ✅ |
| DS-9 | 다크 토큰 분리 (`:root[data-theme="dark"]` default + light placeholder) | `styles/tokens.css`, `index.html` | ✅ |
| DS-10 | 토큰 lint 스크립트 (hex/rgb 리터럴 검출) | `server/scripts/lint-tokens.js`, `package.json` | ✅ |
| DS-11 | qa: 토큰 준수율 100% 검증 | — | ✅ (12/12 통과, login.css 36px→`--fs-3xl` 후속 수정) |

**검증 포인트:** `cd server && node scripts/lint-tokens.js` exit 0. `/app/signup` → 가입 → 환영 모달 닉네임 → 자동 로그인 흐름. `Authorization: Bearer` 자동 첨부. 401 시 refresh 시도 후 로그아웃.

---

## 당장 해야 할 작업 (최우선) — Stage 6+ 고도화 W+1

플랜: `~/.claude/plans/eager-brewing-badger.md`

```
1. T6-INFRA INFRA-1~3 (backend-dev): Redis 도입 + 라이브/경매 영속화
   - W5 한계 해소 (서버 재시작 시 진행 중 상태 복원)
   - Socket.io Redis adapter (멀티 인스턴스 대비)
   - docker-compose에 redis 서비스 추가

2. T6-PROF (web-ui-dev + backend-dev): 프로필 v2 (PNG 레퍼런스)
   - 프로필 헤더(아바타·닉네임·통계 3칸), 컬렉터/딜러 탭, 배지 6종
   - users 컬럼 추가 (avatar_url, bio, interests, delivery_avg_days)
   - GET/PATCH /api/users/:id/profile + 아바타 업로드 (multer)
   - 셀러 공개 프로필 /app/u/:id (T6-SOC 진입점)

3. Stage 4 잔여 (사용자 환경): 4-3 부하테스트, 4-5 EC2 배포, 4-8 시연
   - INFRA-4~7과 통합 진행
```

> 완료된 작업 (2026-05-01, 17차 — wyyyes UI/UX 전면 적용):
> - 홈: `home.css` 2컬럼 그리드(3/4 카드), `live-card.js/css` 셀러 아바타·뷰어수 우하단 chip·LIVE 뱃지 펄스 dot 애니메이션, 빈 상태 SVG 일러스트, `tokens.css` --color-live-bg/--fs-price/--fw-price/--fs-timer 신규
> - 라이브 바이어: 하단 상품 패널(lb-product-panel) 재설계 — 섬네일+상품명+가격(28px/900)+타이머슬롯, 팔로우 버튼·코인 칩 상단바 추가, 수직 스와이프 라이브 전환(touchstart/end), 낙찰 confetti 오버레이(backdrop blur 20px + 10개 파티클), 입찰 없을 때 CTA 버튼, bid-chips 44px 터치영역
> - 라이브 셀러: 진행바 타이머(ls-timer-bar-wrap — 비율 fill + 10초 cta 전환), 뷰어 chip 글래스 스타일, ✨ AI 등록 버튼(준비 중 toast)
> - 채팅: chat-overlay onSend 콜백·입력창 항상 노출(chat-input-row), live-buyer onSend 연결
> - lint-tokens PASS (0 violations)

> 완료된 작업 (2026-04-30, 16차 — Stage 6 W+0):
> - T6-AUTH 13개 항목 일괄 완료: bcrypt+JWT(HS256, access 14d/refresh 30d) 인증 체계, 형용사50×동물30×000-999 랜덤 닉네임 생성기(150만 조합), `POST /api/auth/signup|login|refresh` + `GET /api/auth/me` + `requireAuth`/`optionalAuth` 미들웨어, 마이그레이션 002(NULL 허용 컬럼 추가) → migrate-users-auth.ts(backfill, 임시 비밀번호 'changeme') → 003(NOT NULL 적용) 3단계, `pages/signup.js` 신규 + 환영 모달, login.js username/password 개편, api.js 토큰 보관(localStorage + native_bridge.setSecureItem fallback) + `Authorization: Bearer` 자동 첨부 + 401 refresh-or-logout, router.js authGuard `getMe()` 검증, AUTH_EXEMPT(login/signup/_storybook/terms/privacy)
> - T6-DS 11개 항목 일괄 완료: tokens.css에 spacing/type/motion/elevation/z-index 5개 토큰 그룹 추가, 11개 컴포넌트(live-card/timer/slide-bid/bid-chips/blind-bid/buy-button/chat-overlay/confirm-dialog/fab-modal/toast/bottom-tab-bar) + 페이지 4종(live-buyer/seller/create/profile) 토큰 일괄 치환(rgba/hex/px 리터럴 모두 var() 참조), base.css/transitions.css 토큰화, `:root[data-theme="dark"]` default + `light` placeholder, `/app/_storybook` 컴포넌트 카탈로그 + 토큰 팔레트(21색·spacing 8단계·type 7단계 시각화), `server/scripts/lint-tokens.js` 신규(hex/rgb 검출 → exit 1), `npm run lint:tokens` 추가
> - qa 25/25 통과(Critical 0, 경고 1: login.css 36px → `var(--fs-3xl)` 즉시 후속 수정)
> - 신규 패키지: bcrypt@6, jsonwebtoken@9, @types/bcrypt, @types/jsonwebtoken
> - 마이그레이션 적용 안내: 기존 DB는 002 SQL → `npm run migrate:auth` → 003 SQL 순서, 신규 설치는 schema.sql 단독으로 처음부터 NOT NULL 구조

> 완료된 작업 (2026-04-29, 14차 — 4-2 셀러 경매 관리):
> - 신규 페이지: `pages/seller-dashboard.{js,css}` — 누적 매출/라이브수/진행중/경매건수 요약 4지표, 진행중·예고·종료 탭, "새 라이브"·"샘플 체험" 빠른 액션, 라이브 항목 행에 시청자수·관리·종료 버튼
> - profile.js 메뉴 최상단에 "📊 셀러 대시보드" 추가, 라우터에 `/app/seller/dashboard` 등록
> - api.js: `getDashboardSummary`, `getUserLives`, `endLive(liveId, sellerId)` (body에 sellerId Number JSON 송신, falsy 가드)
> - 서버: `users.ts` `GET /:id/lives` 응답에 `currentViewers`/`productCount` 추가 + status='live' 우선·startedAt DESC 정렬, `GET /:id/dashboard-summary` 신규(메모리+DB join), `live.ts` `PATCH /:id/end`에 sellerId 검증(403 차단)
> - confirm-dialog로 종료 동작 가드, live.sellerId !== user.id 항목엔 관리/종료 버튼 미렌더(이중 방어)
> - live-seller.js의 endLive 호출도 sellerId 인자 추가(전수 확인 2곳)
> - tokens.css 변수 추가 없음 — 기존 토큰만으로 처리
> - qa Critical 1건 해결: endLive에 sellerId 미전송 → 권한 우회 가능 취약점 패치

> 완료된 작업 (2026-04-29, 13차 — 4-1b 미구현 화면 일괄 정비):
> - 신규 페이지 6종: `auction-detail.js`(GET /api/lives/:id 호출 후 sellerId 비교 → live-seller/buyer 분기, 종료 시 summary), `sample.js`(서버 없는 데모 — fakeSocket 봇 자동 입찰·타이머 시뮬, 기존 timer/bid-chips/slide-bid/chat-overlay 재사용), `profile-history.js`(라이브/입찰 탭 토글), `favorites.js`(♥ 토글+그리드), `terms.js`(약관 9조항), `privacy.js`(개인정보 6섹션, LiveKit Cloud 제3자 제공 명시)
> - `create-auction.js` → `replace('/app/live-create')` 즉시 redirect로 단순화
> - `live-card.js` ♥ 버튼 추가(우상단, accent 컬러), `card.setFavorited()` 메서드, `scripts/api.js` `getFavorites`/`toggleFavorite` 래퍼
> - 신규 라우트 3개: `/app/profile/history?tab=lives|bids`, `/app/terms`, `/app/privacy`. settings.js 약관/개인정보 버튼 핸들러 연결
> - 서버 추가: `routes/favorites.ts`(POST 토글 + GET 목록), `users.ts`에 `GET /:id/lives`, `GET /:id/bids`, `live.ts`에 `GET /api/lives/:id`(메모리 기반, 미존재 시 404), schema.sql `favorites` 테이블(user_id INT + FK + UNIQUE(user_id,live_id))
> - tokens.css 신규 변수 5개: `--color-overlay-dim`, `--color-accent-tint`, `--color-warn-tint`, `--color-bg-overlay`, `--color-surface-tint` (rgba 리터럴 6곳 토큰화)
> - qa Critical 2건 해결: GET /api/lives/:id 추가, favorites.user_id VARCHAR→INT 통일(클라는 Number 송신, 서버 Number() 파싱+NaN 400)

> 완료된 작업 (2026-04-29, 11~12차 — Stage 4 착수):
> - 4-4 server Dockerfile: multi-stage(builder→runtime), node:20-alpine, npm ci --omit=dev, USER node, EXPOSE 3000
> - 4-6 docker-compose.yml: mysql 8.0(healthcheck mysqladmin ping)+server, depends_on service_healthy, schema.sql `/docker-entrypoint-initdb.d/` 마운트, DB_HOST=mysql 오버라이드, named volume mysql-data
> - server/.dockerignore 신규: node_modules/dist/.env/.git/*.log 제외
> - 4-1 SPA UI 고도화: `styles/transitions.css` 신규(route-enter 180ms, prefers-reduced-motion 처리), router.js 마운트 시 클래스 토글, live-card.css 스켈레톤 shimmer + home.js 6장 렌더, `components/toast.{js,css}` 신규(전역 stack 최대 3, slide-up+fade), socket.js `onBidRejected` 추가, live-buyer/seller 로컬 토스트 → 전역 통합, base.css 버튼/입력 트랜지션 + :active scale(0.97) + focus-visible 링 통일
> - tokens.css 신규 변수 3개: --color-shadow, --color-skeleton-base, --color-skeleton-shine (기존 변수 변경 없음)
> - 4-7 SSL 스킵 결정 — MVP 범위 외

> 완료된 최근 작업 (2026-04-28, Stage 5 + 5-E 정리):
> - 5-1~5-6 서버: AuctionState 모드 필드 확장(mode/durationSec/stockTotal/stockSold/blindBids/revealAt), 일반경매 30/60s 옵션화, FCFS `purchase` + 매진 자동종료 + `PATCH /end-fcfs` 중도종료, 블라인드 `bid:blind`(본인만 ack) + 종료시 price DESC/ts ASC 정렬 낙찰, `GET /:auctionId/bids` 종료 후 내역 공개(endedBlindBids 30분 TTL), POST 입력 검증
> - 5-7~5-12 SPA: 셀러 등록 모달 모드 라디오 3종 + FCFS 조기종료 버튼, 바이어 `switchBidMode` 단일 분기, `components/buy-button.js`·`blind-bid.js` 신규, `scripts/socket.js` `purchase`/`bidBlind` 래퍼, `scripts/api.js` `createAuction`/`endFcfsAuction`/`getBlindBids` (전부 tokens.css 변수만 사용)
> - 5-13 qa 통과: REST↔Socket↔SPA 페이로드/이벤트/검증값/블라인드 공개/선착순 종료 모두 정합성 확인, Critical 이슈 0
> - 3-W27, 3-W30 통과: Flutter 잔재 4개 파일만(main/app_config/webview_shell/native_bridge), 디자인 토큰 준수, `/api/live/health` URL 정렬

> 완료된 최근 작업 (2026-04-28):
> - 5-D 라이브 + LiveKit 진단 완료 [3-W19~W26]: live-seller/buyer/create 페이지, timer/slide-bid/chat-overlay/bid-chips 컴포넌트 4종, scripts/livekit.js (connect/publish/attach/disconnect/classifyConnectError), `GET /api/live/health` 엔드포인트(LK-4), 토큰 발급 로깅(LK-1), 셸 헬스 URL을 `/api/live/health` 로 정렬(LK-5). 헬스체크 ok:true roomCount:0 확인, 토큰 발급 + 로그 라인 출력 확인
> - 5-C 인증·홈 완료 [3-W13~W18]: login/home/profile/favorites/chat/settings + LiveCard/BottomTabBar/FabModal + 6개 placeholder. router auth 가드 추가
> - 5-B Flutter 셸 전환 완료 [3-W8~W11]: webview_shell.dart, native_bridge.dart, main.dart 1개 화면 축소, features/models/services/widgets/utils/app_theme.dart 전체 삭제, pubspec dio·socket_io_client·google_fonts 제거. flutter analyze 0 issues
> - 5-A 기반 구축 완료 [3-W1~W7]: `/app` 정적 서빙 + history fallback, tokens.css(Fresh Field), base/type/layout.css, api.js·socket.js·router.js·native-bridge.js·models.js, index.html SPA 셸. 스모크 테스트 200 OK
> - 하네스 재편성: web-ui-dev 신규, flutter-dev → shell-dev 개명, livekit-specialist/backend-dev 스코프 갱신 (3-W29)
> - CLAUDE.md 핵심 원칙 #2′ (앱 전체 WebView 기반) + #5 (tokens.css 단일 진실 공급원) 추가 (3-W28)
> - phases.md Stage 3 W시리즈(3-W1~30) 추가, Flutter UI 항목에 "WebView 전환으로 대체" 마킹

> 완료된 작업 (2026-04-27):
> - 3-M7~3-M10: 경매 화면 wyyyes 레퍼런스 재설계, ResponsiveLayout 리팩, SampleAuctionScreen, 데모 버튼
> - 3-M11~3-M12: Fresh Field 다크 디자인 시스템 전면 적용 + google_fonts 추가
> - 3-M5, 3-M16, 3-M17: AppConfig 환경 분리, Live 모델 도입, 소켓/스트리밍 버그 5건 수정

---

## 진행률 요약

> Stage 3 분모는 W시리즈(30개) 도입으로 70개로 확장. Flutter UI 대체 항목은 "완료"로 카운트하지 않고 신규 SPA 항목 진척으로만 측정.

| 단계 | 완료 | 전체 | 진행률 |
|---|---|---|---|
| Stage 1 (서버 인프라) | 12 / 12 | 12 | **100%** |
| Stage 2 (경매 엔진 + LiveKit 통합) | 24 / 25 | 25 | **96%** (W5 Redis 알려진 한계) |
| Stage 3-Legacy (Flutter — 대체 진행 중) | 37 / 40 | 40 | **93%** (대체 항목 코드 산출물 잔존) |
| Stage 3-W (WebView 셸 + SPA) | 28 / 30 | 30 | **93%** (3-W12 실기기만 남음) |
| Stage 5 (경매 방식 3종) | 13 / 13 | 13 | **100%** ✅ |
| Stage 4 (배포, 4-7 SSL 제외) | 5 / 8 | 8 | **63%** (4-1b 포함) |
| Stage 6 — T6-AUTH | 13 / 13 | 13 | **100%** ✅ |
| Stage 6 — T6-DS | 11 / 11 | 11 | **100%** ✅ |
| **전체** | **143 / 152** | **152** | **94%** |
