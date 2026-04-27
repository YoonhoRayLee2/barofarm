# Barofarm

## 하네스: Barofarm P2C 개발

**목표:** P2C 산지직송 라이브 커머스 플랫폼 7주 MVP 개발

**트리거:** 서버, API, Socket.io 경매, LiveKit, Flutter 앱, WebView 연동 등 barofarm 개발 작업 요청 시 `barofarm-dev` 스킬을 사용하라. 진행률·현황·다음 작업 요청 시 `barofarm-planner` 스킬을 사용하라. 단순 코드 설명 질문은 직접 응답 가능.

## 에이전트 팀 구성

```
사용자 요청
    │
    ├─ "진행률/다음 작업" ──▶ planner ──▶ 에이전트 명령 발행
    │                            │ phases.md 갱신
    │                            ▼
    └─ "구현/수정" ──▶ orchestrator
                           │ 위임
                  ┌────────┼──────────────────┐
                  ▼        ▼                  ▼
            backend-dev  flutter-dev  livekit-specialist
                  │        │                  │
                  └────────┴──────────────────┘
                           │ 완성 알림
                           ▼
                          qa  ← 레이어 간 경계면 교차 검증
                           │ Critical 이슈
                           ▼
                      orchestrator
```

### 역할 정의

| 에이전트 | 역할 | 스코프 |
|---------|------|--------|
| **planner** | phases.md 진행률 추적, 다음 작업 결정, 에이전트 명령 발행 | `phases.md` 읽기+쓰기 전담 |
| **orchestrator** | 요청 분석, 에이전트 배치, 결과 통합 보고 | 전체 조율 |
| **backend-dev** | Express REST API, Socket.io, MySQL, 메모리 경매 상태 | `server/` |
| **flutter-dev** | Flutter 네이티브 UI, WebView, socket_io_client | `app/` |
| **livekit-specialist** | LiveKit 토큰 발급, WebRTC, WebView HTML/JS | `server/routes/live.js`, `server/public/` |
| **qa** | REST API ↔ Socket.io ↔ Flutter 경계면 교차 검증 | 읽기 전용, 전 레이어 |

## 핵심 원칙 (변경 금지)

1. WebRTC 직접 구현 금지 — LiveKit에 위임
2. 라이브 화면은 WebView(HTML/JS) — Flutter WebRTC 플러그인 사용 금지
3. 경매 상태는 메모리(Map), 낙찰만 MySQL 저장
4. 모든 에이전트 호출 시 `model: "opus"` 명시
5. 모듈 완성 직후 qa 즉시 투입 — 전체 완성 후 1회 검증 금지

## 변경 이력

| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-04-27 | 초기 구성 | 전체 | - |
| 2026-04-27 | orchestrator 에이전트 추가, 역할 구조 정의 | CLAUDE.md, agents/ | 에이전트 역할 명확화 |
| 2026-04-27 | planner 에이전트 추가 + barofarm-planner 스킬 생성 | agents/planner.md, skills/barofarm-planner/ | 진행률 추적 및 다음 작업 명령 기능 요청 |
