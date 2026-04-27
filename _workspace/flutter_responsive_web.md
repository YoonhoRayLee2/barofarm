# Flutter Responsive Web 작업 결과

날짜: 2026-04-27
담당: flutter-dev

## 빌드 가능 여부

- `flutter analyze`: lib/ 안 신규/수정 코드 0 error, 0 warning
  (잔존 issue 3건은 모두 본 작업 스코프 밖 — `socket_service.dart`의 IO prefix 스타일 info, web의 `dart:html` deprecation info, `test/widget_test.dart`의 기존 깨진 테스트)
- `flutter build web --no-tree-shake-icons`: SUCCESS (`build/web` 생성, 34.7초)

## 신규 파일

| 경로 | 역할 |
|---|---|
| `app/lib/utils/responsive.dart` | `ScreenSize` enum, `BreakpointX` extension, `ResponsiveLayout`, `MaxWidthBox` |
| `app/lib/features/live/widgets/live_view/live_view_widget.dart` | conditional export (mobile vs web) |
| `app/lib/features/live/widgets/live_view/_live_view_mobile.dart` | `WebViewWidget` 래퍼 + 에러 화면 + 재시도 버튼 |
| `app/lib/features/live/widgets/live_view/_live_view_web.dart` | `HtmlElementView` + `IFrameElement` + `window.onMessage` 브리지 |

## 수정 파일

| 경로 | 변경 요약 |
|---|---|
| `app/lib/main.dart` | `kIsWeb` 가드, `ThemeMode.dark` 강제 |
| `app/lib/features/auth/login_screen.dart` | 모바일 풀스크린 / 와이드 중앙 카드(420px) 반응형, `_buildForm()` 추출 |
| `app/lib/features/home/home_screen.dart` | 모바일은 `BottomNavigationBar` + `ListView` 유지, 와이드는 `NavigationRail` + `GridView`(태블릿 2열 / 데스크탑 3열) |
| `app/lib/features/seller/create_auction_screen.dart` | `MaxWidthBox(maxWidth: 520)`로 폼 래핑, `Spacer` 제거 |
| `app/lib/features/live/live_screen.dart` | `WebViewController` 제거 → `LiveViewWidget` 사용, 모바일 풀스크린 오버레이 / 와이드 split(좌측 영상 + 우측 360-380px 패널: 가격·채팅·입찰) |
| `app/lib/features/live/buyer_live_screen.dart` | `WebViewController` 제거 → `LiveViewWidget` 사용, 모바일 풀스크린 / 와이드 split(좌 영상 + 우 340-400px 패널: 채팅·상품·입찰버튼) |

## 핵심 패턴

### 1. WebView/iframe 조건부 처리
- `live_view_widget.dart`의 `export ... if (dart.library.html)`로 단일 import만으로 분기
- 모바일: `WebViewController` + `JavaScriptChannel('FlutterChannel', ...)` → `onMessage(String)` 통일
- 웹: `IFrameElement` + `window.onMessage` 리스너 → `event.data`(String 또는 `{type: ...}`)를 `onMessage`로 그대로 흘려보냄
- 양쪽 모두 에러 시 `_LiveErrorView`(아이콘 + 다시 시도 버튼) 노출

### 2. 반응형 브레이크포인트
- mobile: `< 600`
- tablet: `600 ~ 1023`
- desktop: `>= 1024`

### 3. 라이브 화면 와이드 레이아웃
- 좌측 `Expanded(flex: 3)`에 영상 + 상단 오버레이만 유지
- 우측 고정 폭 사이드 패널(`AppColors.surface` 배경)에 가격(어두운 그라디언트 그림자 제거 버전), 채팅, 입찰 UI 분리 배치
- 모바일은 기존 풀스크린 오버레이 100% 보존

### 4. 디자인 토큰
- `AppColors`만 사용, 하드코딩 헥스 없음
- `fontWeight: FontWeight.w900` (현재가) 유지
- 다크 강제 (`ThemeMode.dark` + `theme: buildDarkTheme()`)

## 주의사항 (다음 단계)

1. **Flutter Web에서 `flutter_secure_storage`**: 일부 브라우저 비호환 가능성. `_loadUser()`에서 try/catch로 보호되어 있어 실패 시 LoginScreen으로 정상 폴백.
2. **CORS / iframe sandboxing**: 라이브 HTML(`/live/live-buyer.html`, `/live/live-seller.html`)이 동일 origin이 아니거나 X-Frame-Options를 거부하면 iframe 로딩 실패. 서버에서 `Content-Security-Policy: frame-ancestors *` 또는 적절한 origin 화이트리스트 설정 필요.
3. **iframe 내부 → Flutter 메시지**: 현재 web 구현은 `window.onMessage`(즉 `window.parent.postMessage(...)`)를 받는다. 라이브 HTML이 모바일에선 `FlutterChannel.postMessage(msg)`를 호출하고 있으므로, 웹에서도 호환되도록 라이브 HTML에 `if (window.parent !== window) window.parent.postMessage(msg, '*')` 분기 추가가 필요 (livekit-specialist 작업).
4. **`dart:html` deprecation**: 장기적으로 `package:web` + `dart:js_interop` 마이그레이션 권장. 현재는 빌드/실행 모두 정상.
