# Backend Stage 1 — TypeScript 서버 구조 구축 완료

## 생성/구성된 파일

| # | 경로 | 설명 |
|---|------|------|
| 1 | `server/tsconfig.json` | TypeScript 컴파일러 설정 (ES2022 / CommonJS / strict) |
| 2 | `server/src/index.ts` | Express + Socket.io 진입점 (`routes/auctions`, `routes/live` 마운트, `express.static('../public')` 정적 서빙) |
| 3 | `server/src/store/memory.ts` | `AuctionState` 인터페이스 + In-Memory `Map<string, AuctionState>` |
| 4 | `server/src/db/mysql.ts` | `mysql2/promise` 풀 (환경변수 기반) |
| 5 | `server/src/routes/auctions.ts` | 경매 CRUD + `PATCH /:id/start` + `PATCH /:id/end` (`routes/live` import 없음) |
| 6 | `server/src/socket/auction.ts` | `join` / `bid` (10초 자동 연장) / `chat` 이벤트 핸들러 |

> `server/src/routes/live.ts`는 다른 에이전트가 작성하는 영역이라 backend-dev 에이전트가 직접 만들지 않았습니다. (현재 stub 파일은 LiveKit 토큰 발급 라우터로 존재)

## 핵심 비즈니스 로직 검증

- 경매 상태는 `Map`으로 메모리 보관 → 낙찰(`PATCH /:id/end`) 시점에만 MySQL `auctions` 테이블에 영구 저장
- `bid` 이벤트에서 `auction.timeLeft <= 10` 이면 `+10`초 자동 연장 (와이스 방식) 적용
- Socket.io 이벤트명: `auction:update`, `chat:message`, `bid`, `join` (사양과 일치)

## 환경 변수 (.env.example 기준)

```env
PORT=3000
LIVEKIT_KEY=your_livekit_api_key
LIVEKIT_SECRET=your_livekit_secret
LIVEKIT_URL=wss://your-project.livekit.cloud
DB_HOST=localhost
DB_USER=root
DB_PASS=
DB_NAME=barofarm
```

## 실행 명령어

```bash
cd server && npm run dev
```

(빌드/프로덕션: `npm run build && npm start`)

## 타입체크 결과

`npx tsc --noEmit` 통과 (오류 0건).
