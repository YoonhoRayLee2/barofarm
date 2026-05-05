# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

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
        ┌──────────┬───────┼───────────┬──────────────────┐
        ▼          ▼       ▼           ▼                  ▼
   backend-dev  web-ui-dev  shell-dev  livekit-specialist
        │          │       │           │
        └──────────┴───────┴───────────┘
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
| **backend-dev** | Express REST API, Socket.io, MySQL, 메모리 경매 상태, `/app` 정적 서빙 | `server/src/` |
| **web-ui-dev** | SPA 웹앱(페이지·컴포넌트·디자인 토큰·라우터) | `server/public/web/` |
| **shell-dev** | Flutter WebView 셸 + JS 브릿지(권한·푸시·시큐어 스토리지) | `app/lib/` |
| **livekit-specialist** | LiveKit 토큰 발급, 라이브 페이지 LiveKit 연동·진단 | `server/src/routes/live.ts`, `server/public/web/pages/live-*` LiveKit 블록 |
| **qa** | REST API ↔ Socket.io ↔ 웹앱 ↔ 셸 경계면 교차 검증 | 읽기 전용, 전 레이어 |

## 핵심 원칙 (변경 금지)

1. WebRTC 직접 구현 금지 — LiveKit에 위임
2. **앱 전체가 WebView 기반 — Flutter는 WebView 셸 + 네이티브 권한·푸시 브릿지로 한정**한다. 모든 화면 UI는 `server/public/web/` SPA에 작성하고, Flutter에 Material 위젯·커스텀 화면을 추가하지 않는다.
3. 경매 상태는 메모리(Map), 낙찰만 MySQL 저장
4. 모듈 완성 직후 qa 즉시 투입 — 전체 완성 후 1회 검증 금지
5. **디자인 시스템(Fresh Field)은 `server/public/web/styles/tokens.css` CSS 변수가 단일 진실 공급원이다.** 페이지·컴포넌트는 토큰만 참조하고 색상/폰트 리터럴을 직접 사용하지 않는다.
6. **각 에이전트는 자신의 스코프 파일만 수정한다** — 스코프 밖 코드·포맷·주석은 건드리지 않는다. 자신이 만든 orphan(미사용 import·변수)만 정리한다.
7. **요구사항이 불명확하면 구현 전에 확인한다** — 불확실한 가정은 명시하고, 여러 해석이 가능하면 orchestrator에 선택 요청 후 착수한다.

---

## 에이전트 하네스 강제 규칙 (필수 준수)

### 위임 원칙

**Claude 본체는 직접 구현하지 않는다.** 스코프가 명확한 모든 작업은 반드시 해당 에이전트에게 위임한다.

| 작업 유형 | 직접 수행 허용? | 위임 대상 |
|---------|-------------|---------|
| 서버 코드 작성/수정 | ❌ | `backend-dev` |
| 웹앱(SPA) 페이지·컴포넌트·디자인 토큰 | ❌ | `web-ui-dev` |
| Flutter 셸·JS 브릿지·푸시·권한 | ❌ | `shell-dev` |
| LiveKit 토큰·연결·진단 | ❌ | `livekit-specialist` |
| 레이어 간 정합성 검증 | ❌ | `qa` |
| phases.md 갱신 | ✅ 직접 | — |
| 단순 파일 편집(1~3줄) | ✅ 직접 | — |
| 코드 설명·질문 응답 | ✅ 직접 | — |

### 모델 선택 기준 (토큰 최적화)

| 에이전트 | 모델 | 이유 |
|---------|------|------|
| orchestrator | `sonnet` | 조율·판단 |
| backend-dev | `sonnet` | 일반 구현 |
| web-ui-dev | `sonnet` | 일반 구현 |
| shell-dev | `sonnet` | 일반 구현 |
| livekit-specialist | `sonnet` | 일반 구현 |
| qa | `haiku` | 읽기·비교 전용 |
| planner | `haiku` | phases.md 읽기·쓰기 전용 |

> **`opus`는 사용 금지** — 비용 대비 효과가 없는 단순 구현 작업에 낭비되지 않도록 한다.

### 병렬 실행 규칙

- 독립적인 작업(서버 + Flutter 동시 수정 등)은 **단일 메시지에 복수 Agent 호출**로 병렬 실행
- 선행 결과가 필요한 경우에만 순차 실행

### 토큰 절약 패턴

1. **에이전트 프롬프트**: 목표·파일 경로·제약·**완료 기준(검증 방법)** 포함, 배경 설명 최소화 — "동작한다"가 아닌 측정 가능한 기준으로 명시
2. **파일 읽기**: 필요한 줄 범위만 (`offset` + `limit` 사용)
3. **장시간 프로세스** (`flutter run`, 빌드 등): 반드시 `run_in_background: true`, 완료 알림 대기 — `sleep` 루프 금지
4. **모니터링**: `until <check>; do sleep N; done` 패턴으로 1회 확인, 반복 폴링 금지
5. **결과 보고**: 에이전트 완료 후 핵심 변경사항만 1~2줄 요약

---

## Barofarm 개발 패턴 & 함정

### SPA 페이지 스크롤 패턴 (필수)
`#app-root { height:100dvh; overflow:hidden }` — 모든 하위 페이지는 이 제약을 받는다.
올바른 패턴: 페이지 루트 `height:100dvh; display:flex; flex-direction:column; overflow:hidden` + 스크롤 영역 `flex:1; overflow-y:auto`
참고 구현: `profile-orders.css`

### fixed overlay 포인터 이벤트 함정
`position:fixed; opacity:0` overlay는 반드시 초기값 `pointer-events:none` 필요.
없으면 보이지 않아도 전체 화면 클릭을 가로챔 — chat-room.js `initMenuPanel()` 참고.

### 상품 카테고리
barofarm 카테고리: `['과일', '채소', '수산', '축산', '곡물', '기타']`
카드게임 카테고리(포켓몬 등) 사용 금지.

### DB 마이그레이션
`server/db/migrations/*.sql` 파일은 서버 시작 시 자동 적용되지 않는다.
신규 마이그레이션 작성 후 반드시 사용자에게 수동 실행 안내: `SOURCE server/db/migrations/NNN_xxx.sql;`

