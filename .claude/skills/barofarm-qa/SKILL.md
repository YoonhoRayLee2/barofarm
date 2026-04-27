---
name: barofarm-qa
description: barofarm P2C 플랫폼 레이어 간 정합성 검증. REST API 응답 ↔ Socket.io 이벤트 ↔ Flutter 앱 처리 코드가 일치하는지 교차 비교. qa 에이전트가 검증 작업을 수행할 때 이 스킬을 사용. "검증", "QA", "테스트", "정합성", "shape 확인" 요청 시 트리거.
---

# Barofarm QA 검증

barofarm 레이어 경계면을 교차 검증한다. 단순 파일 존재 확인이 아니라 실제 shape/타입 비교에 집중한다.

## 검증 항목

### 1. REST API ↔ Flutter 모델

| 확인 항목 | 서버 위치 | Flutter 위치 |
|----------|----------|-------------|
| 경매 목록 응답 shape | `routes/auctions.js` SELECT 결과 | Flutter Auction 모델 필드 |
| 토큰 응답 `{token}` | `routes/live.js` res.json | WebView URL 파라미터 처리 |
| HTTP 에러 응답 | 각 route의 에러 반환 | Flutter HTTP 에러 분기 |

### 2. Socket.io 이벤트 ↔ Flutter 핸들러

| 이벤트 | 서버 emit shape | Flutter 수신 처리 |
|--------|---------------|-----------------|
| `auction:update` | `{id, currentPrice, topBidder, timeLeft, status}` | socket_io_client 핸들러 |
| `chat:message` | `{userId, message, ts}` | 채팅 UI 렌더링 |
| `bid` (클라이언트→서버) | `{roomId, price, userId}` | Flutter emit 코드 |
| `join` | `{roomId}` | Flutter WebView 진입 시 emit |

### 3. 경매 핵심 로직

- [ ] `socket/auction.js`: `auction.timeLeft <= 10` 조건에서 +10 연장
- [ ] `PATCH /:id/end`: 메모리 삭제(`auctions.delete`) + DB 업데이트 순서
- [ ] 토큰: 셀러 `canPublish: true`, 바이어 `canPublish: false`

### 4. DB 스키마 ↔ API 응답

- [ ] `auctions` 테이블 컬럼명 vs REST API JSON 키 일치 (snake_case vs camelCase 주의)
- [ ] status ENUM `pending|live|ended` vs Flutter 상태 처리 분기

## 검증 실행 순서

1. 백엔드 코드 읽기 (`server/routes/`, `server/socket/`, `server/store/`)
2. Flutter 코드 읽기 (`app/lib/` 관련 파일)
3. 경계면별 shape 비교 — 양쪽 코드를 동시에 읽고 비교
4. 이슈 분류 및 `_workspace/qa_report_{module}.md` 작성

## 이슈 기록 형식

```
## QA Report — {모듈명}
생성: {날짜}

### Critical (런타임 에러 가능)
- [ ] 이슈: {서버 위치} vs {Flutter 위치}

### Warning (엣지 케이스 위험)
- [ ] 이슈: 설명

### Info (개선 권고)
- [ ] 사항
```

Critical 이슈 발견 시 즉시 orchestrator에 SendMessage 후 계속 진행한다.
