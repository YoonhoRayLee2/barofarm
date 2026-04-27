---
name: barofarm-planner
description: barofarm 개발 진행률 파악 및 다음 작업 명령 스킬. phases.md를 읽어 Stage별·에이전트별 완료율을 계산하고, 우선순위에 따라 다음 작업을 결정하여 담당 에이전트에게 명령한다. "진행률", "현황", "다음 작업", "다음 단계", "뭐 해야 해", "어디까지 됐어", "기획", "계획 확인", "어떤 작업 남았어", "이번 주 뭐 해야 해" 요청 시 반드시 이 스킬을 사용할 것. 단순 코드 설명·구현 요청은 barofarm-dev 스킬이 처리한다.
---

# Barofarm 진행률 추적 & 작업 명령

`phases.md`를 단일 진실 공급원(SSOT)으로 삼아 전체 개발 현황을 파악하고, 다음 작업을 결정하여 담당 에이전트에게 명령한다.

## Phase 0: 컨텍스트 확인

1. `/Users/uknow/Desktop/barofarm/phases.md` 존재 여부 확인
2. 사용자 요청 유형 분류:
   - **현황 조회**: "진행률", "현황", "어디까지" → Phase 1~2 실행 후 보고만
   - **다음 작업 확인**: "다음 작업 뭐야" → Phase 1~3 실행, 명령은 미발행
   - **다음 작업 실행**: "다음 작업 시작해", "다음 단계 해줘" → Phase 1~4 전체 실행

## Phase 1: 진행률 파악

1. `phases.md` 읽기
2. 각 Stage의 ✅/⚠️/🔧/❌ 항목 집계
3. 에이전트별 담당 작업을 아래 매핑 테이블 기준으로 분류

### 에이전트-작업 매핑 (현재 기준)

| 에이전트 | 담당 미완료 작업 |
|---------|--------------|
| backend-dev | Stage 2의 ⚠️ 항목 (2-W1, 2-W3, 2-W4) |
| flutter-dev | Stage 3의 ❌ 항목 (3-M2, 3-M3, 3-M4, 3-M5, 3-M6) |
| livekit-specialist | Stage 4의 관련 배포 작업 |
| qa | 모듈 완성 직후 투입 (상시) |

### 보고 형식

```
## Barofarm 개발 현황 — {날짜}

| Stage | 완료 | 전체 | 진행률 | 상태 |
|-------|------|------|--------|------|
| Stage 1 (인프라) | 12 | 12 | 100% | ✅ |
| Stage 2 (경매) | 13 | 17 | 76% | ⚠️ |
| Stage 3 (Flutter) | 23 | 29 | 79% | 🔧 |
| Stage 4 (배포) | 0 | 8 | 0% | ❌ |
| **전체** | **48** | **66** | **73%** | |

## 에이전트별 잔여 작업
### backend-dev ({N}건)
- {작업ID}: {작업명}

### flutter-dev ({N}건)
- {작업ID}: ⭐ {작업명} (최우선)

### livekit-specialist / qa
- {상태}
```

## Phase 2: 우선순위 결정

다음 순서로 다음 작업을 선정한다:

1. `phases.md`의 "당장 해야 할 작업" 섹션 최상위 항목
2. ❌ 미착수 항목 중 선행 의존성이 없는 것
3. ⚠️ 경고 항목 중 런타임 블로커가 될 수 있는 것

**의존성 규칙:**
- 3-M4(셀러 화면)는 독립 실행 가능
- 3-M2(실물 기기 테스트)는 3-M4 완료 권장 후 실행
- Stage 4는 Stage 3 핵심 완료 후 착수

## Phase 3: 다음 작업 목록 출력

```
## 다음 최우선 작업

[1] {작업ID} — {에이전트} → {작업 한 줄 요약}
[2] {작업ID} — {에이전트} → {작업 한 줄 요약}
[3] {작업ID} — {에이전트} → {작업 한 줄 요약}

실행하려면 "다음 작업 시작해" 또는 특정 작업 ID를 말해주세요.
```

## Phase 4: 작업 명령 발행

"다음 작업 시작해" 또는 특정 작업 ID 지정 시, planner 에이전트가 담당 에이전트에게 SendMessage로 명령 발행.

### 명령 형식

```
대상: {에이전트명}
작업 ID: {예: 3-M4}
요청: {구체적 작업 내용}
  - {세부 항목 1}
  - {세부 항목 2}
관련 파일: {대상 파일 경로}
완료 기준: {기대 동작 / 확인 방법}
완료 후: planner에게 SendMessage로 완료 보고
```

### 작업별 사전 정의 명령 (자주 쓰이는 것)

**3-M4 — 셀러 경매 생성 화면:**
```
대상: flutter-dev
작업 ID: 3-M4
요청: 셀러 경매 생성 화면 구현
  - POST /api/auctions로 경매 생성 (품목명, 시작가)
  - 생성 성공 시 PATCH /api/auctions/:id/start 호출
  - 화면 위치: app/lib/features/seller/seller_screen.dart
관련 파일: app/lib/services/api_service.dart, app/lib/features/home/home_screen.dart
완료 기준: 셀러 로그인 후 경매 생성 → 라이브 화면 자동 이동
완료 후: planner에게 SendMessage로 완료 보고
```

**2-W1 — PATCH /:id/start 중복 방어:**
```
대상: backend-dev
작업 ID: 2-W1
요청: PATCH /:id/start 중복 호출 방어 추가
  - auctions Map에 이미 해당 id가 있으면 409 반환
  - 조건: status === 'live' 인 경우
관련 파일: server/src/routes/auctions.ts (line ~46)
완료 기준: 동일 경매 start를 2회 호출 시 두 번째 호출에서 409 응답
완료 후: planner에게 SendMessage로 완료 보고
```

**3-M3 — timer_display shake 애니메이션:**
```
대상: flutter-dev
작업 ID: 3-M3
요청: timer_display.dart에 3초 이하 shake + 레드 애니메이션 추가
  - timeLeft <= 3 시 빨간색으로 색상 전환
  - AnimationController로 shake 효과 (좌우 ±4px, 100ms 주기)
관련 파일: app/lib/features/live/widgets/timer_display.dart
완료 기준: 타이머 3초 이하에서 흔들림 + 빨간 텍스트 렌더링
완료 후: planner에게 SendMessage로 완료 보고
```

## Phase 5: phases.md 업데이트

에이전트 완료 보고 수신 후:

1. `phases.md` 읽기
2. 해당 작업 ID 행의 상태 칸: `❌` 또는 `⚠️` → `✅`
3. "미완료" 테이블에서 "완료" 테이블로 행 이동 (해당되는 경우)
4. "당장 해야 할 작업" 섹션에서 해당 항목 제거
5. 진행률 요약 테이블 수치 재계산 후 갱신
6. 파일 상단 "최종 갱신" 날짜를 오늘 날짜로 수정
7. `phases.md` 저장

## 에러 핸들링

| 상황 | 대응 |
|------|------|
| phases.md 없음 | 사용자에게 파일 경로 확인 요청 |
| 에이전트 완료 보고 없음 (5분 이상) | 해당 에이전트에 진행 상태 확인 SendMessage |
| 의존 작업 미완료 | 선행 작업 먼저 발행, 완료 후 후속 명령 |
| phases.md 상태와 코드 불일치 | qa 에이전트 투입하여 실제 구현 상태 재확인 |

## 테스트 시나리오

**정상 흐름:** "진행률 파악해줘"
→ phases.md 읽기 → 집계 → 보고 형식으로 출력 → "다음 작업 시작해?" 제안

**명령 흐름:** "다음 작업 시작해"
→ 최우선 작업 결정 → flutter-dev에 3-M4 명령 발행 → 완료 보고 대기 → phases.md 갱신

**특정 작업 흐름:** "2-W1 작업 해줘"
→ backend-dev에 2-W1 명령 발행 → qa 투입 → phases.md 갱신
