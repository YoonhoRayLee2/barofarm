---
name: barofarm-dev
description: barofarm P2C 라이브 커머스 개발 오케스트레이터. 서버 API, Socket.io 경매, LiveKit 영상, Flutter 앱, WebView 연동 등 barofarm 개발 작업을 요청할 때 반드시 이 스킬을 사용. "서버", "API", "소켓", "경매", "LiveKit", "Flutter", "앱", "화면", "기능 추가", "구현", "버그 수정", "1단계", "2단계", "3단계", "4단계", "다시 만들어", "수정해줘" 등 개발 관련 요청이면 트리거. 단순 코드 설명 질문은 직접 응답 가능.
---

# Barofarm 개발 오케스트레이터

P2C 산지직송 라이브 커머스 barofarm의 개발 작업을 4명의 전문 에이전트 팀이 조율하여 수행한다.

## 팀 구성

| 에이전트 | 담당 |
|---------|------|
| backend-dev | Node.js/Express/Socket.io + `/app` 정적 서빙 — `server/src/` |
| web-ui-dev | SPA 웹앱(페이지·컴포넌트·디자인 토큰·라우터) — `server/public/web/` |
| shell-dev | Flutter WebView 셸 + JS 브릿지(권한·푸시·시큐어) — `app/lib/` |
| livekit-specialist | LiveKit 토큰 발급 + 라이브 페이지 LiveKit 연동·진단 |
| qa | 레이어 간 경계면 교차 검증 |

## Phase 1: 작업 분석

1. 요청 기능의 개발 단계 파악:
   - **1단계** (1~2주): LiveKit 토큰 API + 셀러→바이어 영상 데모
   - **2단계** (3~4주): Socket.io 입찰·채팅·타이머·낙찰 처리
   - **3단계** (5~6주): Flutter webview_flutter + 경매 목록 UI
   - **4단계** (7주): UI 고도화·부하테스트·AWS 배포
2. 아래 배치 매트릭스로 담당 에이전트 결정
3. 병렬 처리 가능한 작업 분리

### 에이전트 배치 매트릭스

| 작업 유형 | 주 에이전트 | 협력 |
|----------|-----------|------|
| 서버 REST API / DB 쿼리 | backend-dev | qa |
| Socket.io 경매 이벤트 / 타이머 | backend-dev | qa |
| `/app` 정적 서빙·SPA 라우팅 | backend-dev | web-ui-dev |
| 웹앱 페이지·컴포넌트·디자인 토큰 | web-ui-dev | qa |
| 라이브 페이지 레이아웃·UI | web-ui-dev | livekit-specialist |
| LiveKit 토큰 API / 진단 | livekit-specialist | backend-dev, qa |
| 라이브 페이지 LiveKit `room.connect()` | livekit-specialist | web-ui-dev |
| Flutter WebView 셸 / JS 브릿지 / 푸시·권한 | shell-dev | qa |
| 웹앱 ↔ 셸 브릿지 / 웹앱 ↔ 서버 연동 | web-ui-dev + (shell-dev / backend-dev) | qa |
| 전체 기능 통합 검증 | qa | 모든 에이전트 |

## Phase 2: 팀 구성 및 작업 할당

**실행 모드: 에이전트 팀** (TeamCreate + SendMessage + TaskCreate)

```
TeamCreate → TaskCreate(의존성 포함) → 팀원 자체 조율 → qa 점진적 투입
```

**파일 컨벤션:** `_workspace/{단계}_{에이전트}_{산출물}.md`
예: `_workspace/01_livekit_token-api.md`, `_workspace/02_backend_auction-socket.md`

작업 완료 시 각 에이전트는 SendMessage로 qa에게 완성 알림 전송.

## Phase 3: 실행 및 모니터링

1. 모듈 완성 직후 qa 즉시 투입 — 전체 완성 후 1회 검증 금지
2. qa가 Critical 이슈 보고 시 → 해당 에이전트 수정 요청 → qa 재검증

## Phase 4: 결과 통합 및 보고

1. 각 에이전트 산출물 수집
2. qa 최종 보고서 확인
3. 사용자에게 보고:
   - 구현된 파일 목록
   - 로컬 실행 명령어 (`cd server && npm run dev`)
   - 다음 단계 제안

## 에러 핸들링

| 상황 | 대응 |
|------|------|
| 에이전트 작업 실패 | 1회 재시도, 재실패 시 누락 명시 후 진행 |
| Critical QA 이슈 | 해당 에이전트 수정 → qa 재검증 |
| 환경변수 미설정 (LIVEKIT_KEY 등) | 사용자에게 설정 요청 후 중단 |
| DB 미연결 상태 | 메모리 전용 모드로 계속 진행, 사용자에게 안내 |

## 핵심 원칙 (변경 금지)

1. WebRTC 직접 구현 금지 — LiveKit에 위임
2. Flutter는 WebView로 단순하게 — 라이브 화면은 HTML/JS
3. 경매 상태는 메모리(Map), 낙찰만 MySQL 저장
4. 에이전트 모델: sonnet (구현) / haiku (검증·계획) — opus 사용 금지
