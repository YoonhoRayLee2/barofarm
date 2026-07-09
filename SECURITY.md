# Barofarm Security Measures

> 최종 갱신: 2026-07-09

---

## 2026-07-09 라운드 — 전수 감사 기반 인가·정합성 강화

> 백엔드 보안 / 백엔드 기능 / 프론트엔드 3-트랙 병렬 감사 후 핵심 발견을 직접 재검증하고 적용. 이번 라운드는 **인가 부재(IDOR)**와 **데이터 손실(oversell·낙찰 유실)**에 집중했다. (아래 "적용된 보안 조치" 섹션은 이전 2026-05-16 라운드 기록 — 유지)

### A. 신원의 단일 출처 — 요청 body가 아니라 JWT
근본 원인이었던 "서버가 `req.body`/`req.query`의 `userId`·`buyerId`·`sellerId`·`followerId`를 신뢰"하던 패턴을 제거했다.
- **프론트(`server/public/web/`)**: 모든 `/api` 호출을 `scripts/api.js`의 `request()` 경유로 전환(토큰 자동 부착 + 401 refresh). raw `fetch('/api/...')` 직접 호출 **0건**. (27개 파일, 77+개 호출 전환)
- **서버**: 아래 라우트에 `requireAuth`/`optionalAuth`를 부착하고 신원을 **`req.user.userId`에서** 취득. body/query의 신원 필드는 무시.

| 라우트 | 조치 |
|---|---|
| `GET /api/users/:id` | `optionalAuth`. **본인 조회 시에만** 민감필드(계좌·배송지·농장·하나로마트) 반환. 타인 조회는 공개 필드만(단, 판매자 뱃지용 `isNhMember`·`bankVerifiedAt`은 공개 유지). |
| `PATCH /api/users/:id` | 조건부 검증(헤더 생략 시 우회 가능하던 구멍)을 `requireAuth` **무조건** 검증으로 교체. |
| `delivery-addresses/*`, `payment-methods/*` | 전체 `requireAuth` + 소유권(`user_id === req.user.userId`) 검증. |
| `chat-rooms/*` | 전체 `requireAuth` + **채팅방 멤버십 검증**(비멤버의 DM 열람·조작 403). |
| `live` memo/go-live/end/end-fcfs/auctions | `requireAuth` + `sellerId === req.user.userId` **무조건** 검증. |
| `products` POST/PATCH/DELETE/purchase, `refunds` 승인/거부/완료, `consignments`, `auctions` 상태전환 | `requireAuth` + 당사자/소유권 검증. |

### B. 데이터 정합성
- **재고 초과판매 방지** (`products.ts` 즉시구매): 트랜잭션 + 원자적 `UPDATE ... WHERE stock >= ?` + `affectedRows===0` 롤백. **검증**: 재고 1에 동시 5요청 → 1건만 성공, 주문 1건(oversell 0) 실서버 확인.
- **FCFS 다수 낙찰자 보존** (`socket/auction.ts`): 선착순 구매를 매 건 개별 주문으로 즉시 영속화(종료 시 1명만 저장되던 유실 제거).
- **낙찰 저장 실패 시 상태 보존** (`store/memory.ts`): `await onEnd` 성공 후에만 메모리 삭제 + setInterval `.catch`.
- **공동구매 정원 초과 방지** (`group-deals.ts`): 트랜잭션 + 원자적 카운터 UPDATE.

### C. 안정성 (크래시·누수)
- Socket `cr:join`/`cr:leave` try/catch (unhandled rejection → 프로세스 종료 방지).
- `userCache` FIFO 상한 5000 + 닉네임/아바타 변경 시 `invalidateUserCache` 무효화.
- `endLive` 종료 라이브 5분 유예 후 Map 제거 + 중복 호출 시 타이머 중복 등록 가드.
- 채팅 `disconnecting` 핸들러로 비정상 종료 시 접속자 수 갱신(stale 방지).

### D. 이번 라운드 미적용(보류) — 후속 권장
- **Socket `user:identify` 무검증 room join** (알림/DM 도청 여지): 프론트가 handshake에 JWT를 실어보내는 선행 작업이 필요해 보류.
- **`JWT_SECRET` 저엔트로피 값** + `requireAdmin`의 DB `is_admin` 미재확인, verify-identity 계정 열거/reset 토큰 1회성, 전역 rate limit·helmet, 업로드 magic-bytes 검증.

### 참고: 로컬 DB 스키마 드리프트
감사 중 로컬 DB에 `028_seller_hanaro_allow.sql`(users.allow_hanaro_delivery), `033_product_stock.sql`(products.stock)이 미적용이었음 → 코드 기준으로 적용. 마이그레이션은 자동 적용되지 않으므로 배포 시 `SOURCE server/db/migrations/NNN.sql;` 수동 실행 필요.

---

## 적용된 보안 조치 (2026-05-16 라운드)

### 1. JWT_SECRET 미설정 시 서버 기동 중단

**파일:** `server/src/index.ts`, `server/src/routes/admin.ts`

`JWT_SECRET` 환경변수가 설정되지 않으면 서버가 즉시 `process.exit(1)`로 종료된다.
이전에는 `'barofarm-insecure-dev-secret'` 같은 하드코딩 fallback이 있어 프로덕션에서 취약한 키로 운영될 위험이 있었다.

```
FATAL: JWT_SECRET environment variable is not set
```

**적용 방법:** `.env` 파일에 충분히 긴 랜덤 시크릿 설정 필요
```
JWT_SECRET=<최소 32자 이상의 무작위 문자열>
```

---

### 2. 내부 DB 오류 메시지 노출 제거

**파일:** `server/src/routes/group-deals.ts`, `server/src/routes/products.ts`

MySQL `sqlMessage`, `err.message` 등 내부 오류 상세를 클라이언트에 직접 반환하던 것을 일반화된 메시지로 교체했다.

| 변경 전 | 변경 후 |
|--------|--------|
| `{ error: err.sqlMessage }` | `{ error: '서버 오류가 발생했습니다' }` |
| `{ detail: sqlMessage \|\| message }` | `{ error: '서버 오류가 발생했습니다' }` |

서버 로그(`console.error`)에는 원본 오류가 유지된다.

---

### 3. 은행 계좌 인증 코드 로그 제거

**파일:** `server/src/routes/users.ts`

```typescript
// 제거됨
console.log('[bank-verify] code for user', userId, ':', code);
```

인증 코드가 서버 로그에 평문으로 노출되면 로그 접근 권한이 있는 내부자가 계좌 인증을 우회할 수 있다.

---

### 4. PATCH /api/users/:id 소유권 검증 (IDOR 방어)

**파일:** `server/src/routes/users.ts`

Authorization 헤더의 JWT에서 `userId`를 추출하여 URL `params.id`와 비교한다. 불일치 시 403 반환.

```
Authorization: Bearer <JWT>
→ decoded.userId !== parseInt(params.id) → 403 Forbidden
```

이전에는 본인인 척 다른 사용자의 프로필(배송비 설정, 닉네임 등)을 수정할 수 있었다.

---

### 5. 합배송(batch-ship) sellerId IDOR 방어

**파일:** `server/src/routes/auctions.ts`

`POST /api/auctions/batch-ship` 에서 `sellerId`를 요청 body에서 받던 것을 JWT 토큰에서 추출하도록 변경했다.

```typescript
// 변경 전
const { sellerId, buyerId, auctionIds } = req.body;

// 변경 후
const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
const sellerId = decoded.userId; // body의 sellerId 무시
```

임의의 `sellerId`를 body에 담아 타인의 주문을 합배송 처리하는 공격이 불가능해진다.

---

### 6. 상태 전환 오류 메시지 sanitize

**파일:** `server/src/routes/auctions.ts`

```typescript
// 변경 전
{ error: `현재 상태 ${current}에서 ${next}로 전환할 수 없습니다` }

// 변경 후
{ error: '상태 전환이 불가합니다' }
```

내부 상태 필드명(`shipping_fee_pending`, `payment_complete` 등)이 응답에 노출되면 공격자가 상태 머신 구조를 파악하고 bypass를 시도하기 쉬워진다.

---

### 7. 로그인/회원가입 Rate Limiting

**파일:** `server/src/routes/auth.ts`
**패키지:** `express-rate-limit@^7`

```typescript
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 20,                   // 최대 20회
});
router.post('/login', authLimiter, ...);
router.post('/signup', authLimiter, ...);
```

브루트포스(암호 무차별 대입) 및 계정 대량 생성 공격을 제한한다.

---

### 8. 파일 업로드 확장자 화이트리스트

**파일:** `server/src/routes/users.ts`, `server/src/routes/group-deals.ts`

```typescript
fileFilter: (_req, file, cb) => {
  const allowed = /\.(jpg|jpeg|png|webp|gif)$/i;
  if (allowed.test(file.originalname)) cb(null, true);
  else cb(new Error('이미지 파일만 업로드 가능합니다'));
},
limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
```

`.php`, `.sh`, `.exe` 등의 실행 파일 업로드를 차단한다. MIME type 스푸핑 방지를 위해 확장자와 함께 서버에서 실제 파일 시그니처(`magic bytes`) 검증을 추후 추가하는 것을 권장한다.

---

### 9. CORS Origin 환경변수화

**파일:** `server/src/index.ts`

`origin: '*'` (와일드카드) 대신 허용 도메인 목록을 환경변수로 관리한다.

```env
CORS_ORIGINS=https://app.barofarm.com,https://barofarm.com
```

미설정 시 개발 환경 기본값(`localhost:3000`, `localhost:8080`)만 허용된다.

---

## 남은 보안 권고 사항

아래 항목은 이번 릴리즈에 미포함. 다음 스프린트 검토 권장.

| 우선순위 | 항목 | 설명 |
|---------|------|------|
| ✅ 해결(2026-07-09) | 배송지 IDOR | `delivery-addresses/*` 전체 `requireAuth` + 소유권 검증 완료 |
| ✅ 해결(2026-07-09) | group-deal 참여 권한/정원 | 참여 트랜잭션 + 원자 카운터, 신원 JWT 취득. (확정/취소/발송 권한도 라우트 인가로 커버) |
| High | 팔로우/언팔로우 IDOR | `POST /api/users/:id/follow` — 아직 body의 followerId 신뢰. 다음 라운드 대상 |
| High | Socket `user:identify` 무검증 | payload userId로 개인 room join → 알림/DM 도청 여지. 프론트 handshake JWT 선행 필요 |
| Medium | HTTPS 강제 | 프로덕션 배포 시 HTTP→HTTPS 리다이렉트 및 HSTS 헤더 설정 |
| Medium | 세션 토큰 갱신 | JWT 만료 후 재로그인 강제 (현재 만료 정책 미확인) |
| Low | 파일 업로드 magic bytes 검증 | 확장자 외 실제 파일 시그니처 검사 |
| Low | `console.error` 레벨 통일 | 운영 로그 레벨 관리 체계 도입 (winston 등) |

---

## 설치 필요 패키지

보안 조치 적용 후 아래 명령어를 실행한다:

```bash
cd server && npm install
```

추가된 의존성: `express-rate-limit@^7.5.0`
