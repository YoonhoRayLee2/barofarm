# Backend Stage 3 — Seed & Bootstrap

날짜: 2026-04-27
대상: server/db/seed.sql, server/src/index.ts

## 1. seed.sql 내용 요약

파일: `/Users/uknow/Desktop/barofarm/server/db/seed.sql`

멱등성을 보장하는 두 개의 INSERT 문으로 구성. `INSERT INTO ... SELECT ... WHERE NOT EXISTS` 패턴 사용.

### (1) seller 유저
- `name='바로팜농장'`, `phone='01000000000'`, `role='seller'`
- `phone='01000000000'`인 유저가 이미 존재하면 삽입 스킵

### (2) 샘플 경매
- `product_name='제주 감귤 10kg'`, `start_price=15000`, `current_price=15000`, `status='live'`
- `seller_id`는 `phone='01000000000'`인 유저의 id를 SELECT로 참조 (하드코딩 없음)
- 이미 `status='live'`인 경매가 1건이라도 있으면 삽입 스킵

## 2. bootstrapLiveAuctions 로직

파일: `/Users/uknow/Desktop/barofarm/server/src/index.ts`

### 동작 흐름
1. `server.listen()` 콜백 안에서 비동기 호출
2. `SELECT ... FROM auctions WHERE status = 'live'` 쿼리로 라이브 경매 전체 조회
3. 각 row에 대해:
   - `auctions.has(String(row.id))` 체크 → 메모리에 이미 있으면 스킵
   - 없으면 `createAuction(id, { productName, startPrice, sellerId })` 호출
   - `startTimer(id, io)` 로 30초 카운트다운 타이머 시작
4. 로딩된 경매 수를 `[bootstrap] Loaded N live auction(s) into memory` 로그로 출력
5. DB 조회 실패 시 서버는 계속 실행, `console.error`로 메시지만 출력 (개발 환경 에러 핸들링 원칙 준수)

### 임포트 추가
- `db from './db/mysql'`
- `auctions, createAuction, startTimer from './store/memory'`
- `RowDataPacket from 'mysql2'`
- `LiveAuctionRow` 인터페이스 (id, seller_id, product_name, start_price, current_price, status)

## 3. MySQL seed 실행 결과

명령어:
```
mysql -u root -p'1234' barofarm < server/db/seed.sql
```

### 1차 실행 (빈 DB → 삽입)
- `users` 테이블: 바로팜농장 seller 1행 INSERT (id=3)
- `auctions` 테이블: 제주 감귤 10kg live 경매 1행 INSERT (id=1, seller_id=3)
- 총 2 rows affected

### 2차 실행 (멱등성 검증)
- `users` 테이블: phone='01000000000' WHERE NOT EXISTS 매치 → 0 rows affected
- `auctions` 테이블: status='live' WHERE NOT EXISTS 매치 → 0 rows affected
- 총 0 rows affected (중복 삽입 방지 정상 동작)

### 검증 쿼리 결과
```
SELECT COUNT(*) FROM users WHERE phone='01000000000';   -- 1
SELECT COUNT(*) FROM auctions WHERE status='live';      -- 1
```

```
id  name      phone         role
3   바로팜농장  01000000000   seller

id  seller_id  product_name   start_price  current_price  status
1   3          제주 감귤 10kg   15000        15000          live
```

## 4. TypeScript 컴파일 검증

`npx tsc --noEmit` → 에러 없음.

## 5. 후속 통신 필요 사항

- qa 에이전트: REST 스펙 변경 없음 (라우트는 그대로). 단, 서버 부팅 시 메모리 자동 복원되는 동작이 추가됨 → 통합 테스트에서 서버 재시작 후 GET /api/auctions/:id 응답에 메모리 상태(timeLeft 등) 병합되는지 확인 필요.
- flutter-dev: 엔드포인트 변경 없음. 알림 불요.
