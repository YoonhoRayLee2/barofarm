# Barofarm Security Measures

> 최종 갱신: 2026-05-16

---

## 적용된 보안 조치

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
| High | 팔로우/언팔로우 IDOR | `POST /api/users/:id/follow` — JWT userId 검증 없음 |
| High | 배송지 IDOR | `/api/users/:id/delivery-addresses` — 소유자 확인 없음 |
| High | group-deal 확정/취소/발송 권한 | sellerId를 body에서 받음, JWT 검증 없음 |
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
