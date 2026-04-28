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
4. 모듈 완성 직후 qa 즉시 투입 — 전체 완성 후 1회 검증 금지

---

## 에이전트 하네스 강제 규칙 (필수 준수)

### 위임 원칙

**Claude 본체는 직접 구현하지 않는다.** 스코프가 명확한 모든 작업은 반드시 해당 에이전트에게 위임한다.

| 작업 유형 | 직접 수행 허용? | 위임 대상 |
|---------|-------------|---------|
| 서버 코드 작성/수정 | ❌ | `backend-dev` |
| Flutter 코드 작성/수정 | ❌ | `flutter-dev` |
| LiveKit 연동 | ❌ | `livekit-specialist` |
| 레이어 간 정합성 검증 | ❌ | `qa` |
| phases.md 갱신 | ✅ 직접 | — |
| 단순 파일 편집(1~3줄) | ✅ 직접 | — |
| 코드 설명·질문 응답 | ✅ 직접 | — |

### 모델 선택 기준 (토큰 최적화)

| 에이전트 | 모델 | 이유 |
|---------|------|------|
| orchestrator | `sonnet` | 조율·판단 |
| backend-dev | `sonnet` | 일반 구현 |
| flutter-dev | `sonnet` | 일반 구현 |
| livekit-specialist | `sonnet` | 일반 구현 |
| qa | `haiku` | 읽기·비교 전용 |
| planner | `haiku` | phases.md 읽기·쓰기 전용 |

> **`opus`는 사용 금지** — 비용 대비 효과가 없는 단순 구현 작업에 낭비되지 않도록 한다.

### 병렬 실행 규칙

- 독립적인 작업(서버 + Flutter 동시 수정 등)은 **단일 메시지에 복수 Agent 호출**로 병렬 실행
- 선행 결과가 필요한 경우에만 순차 실행

### 토큰 절약 패턴

1. **에이전트 프롬프트**: 목표·파일 경로·제약만 포함, 배경 설명 최소화
2. **파일 읽기**: 필요한 줄 범위만 (`offset` + `limit` 사용)
3. **장시간 프로세스** (`flutter run`, 빌드 등): 반드시 `run_in_background: true`, 완료 알림 대기 — `sleep` 루프 금지
4. **모니터링**: `until <check>; do sleep N; done` 패턴으로 1회 확인, 반복 폴링 금지
5. **결과 보고**: 에이전트 완료 후 핵심 변경사항만 1~2줄 요약

