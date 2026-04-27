# Flutter Stage 3 — main.dart 진입점 교체

## 변경 파일 목록
- `app/lib/main.dart` — 카운터 템플릿 제거, 실제 앱 진입점으로 재작성

## 자동 로그인 흐름
1. 앱 시작 시 `_RootGate`가 `FlutterSecureStorage`에서 `current_user` 키를 읽고 `FutureBuilder`로 결과를 대기한다 (조회 중 스플래시: `CircularProgressIndicator`).
2. 값이 존재하고 `User.fromJsonString()` 파싱에 성공하면 `HomeScreen(user: user)`로 진입한다.
3. 값이 없거나 파싱 예외 발생 시 `LoginScreen()`으로 진입한다.

## MaterialApp 설정
- `title: '바로팜'`
- `theme: buildLightTheme()`
- `darkTheme: buildDarkTheme()`
- `themeMode: ThemeMode.system`
- `debugShowCheckedModeBanner: false`

## 실행 명령어
```
cd app && flutter run
```
