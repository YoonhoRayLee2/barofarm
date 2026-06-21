# Barofarm Code Conventions

> 이 문서는 단일 진실 공급원(SSOT)이다. 코드 리뷰·AI 에이전트 모두 이 기준을 따른다.

---

## 1. 프로젝트 구조 원칙

```
server/
  src/routes/          # Express 라우터 (도메인별 1파일)
  db/migrations/       # 순번 + 설명 (NNN_snake_case.sql)
public/web/
  pages/               # SPA 페이지 (파일명 = 라우트 슬러그)
  components/          # 재사용 UI 컴포넌트
  scripts/             # 유틸·API·브릿지 (순수 함수 우선)
  styles/              # tokens.css가 단일 디자인 토큰 소스
```

**규칙:**
- 라우터 1파일 = 도메인 1개. 크로스 도메인 로직은 공유 헬퍼로 분리.
- 페이지 JS + CSS는 같은 이름으로 쌍을 이룬다 (`order-detail.js` ↔ `order-detail.css`).
- 공유 유틸은 `scripts/` 에만. 페이지/컴포넌트에서 직접 정의 금지.

---

## 2. TypeScript (백엔드 `server/src/`)

### 타입 선언

```typescript
// ✅ 명시적 interface — 재사용 가능, DB row 타입은 반드시 정의
interface AuctionRow {
  id: string;
  seller_id: number;
  delivery_status: DeliveryStatus;
  shipping_fee_status: ShippingFeeStatus;
}

// ✅ union type — 상태값 열거
type DeliveryStatus = 'payment_complete' | 'shipped' | 'purchase_confirmed' | 'settlement_complete';

// ❌ any — 사용 금지. unknown + 타입가드로 대체
const [rows]: any = ...  // 금지
const [rows] = await pool.execute(...) as [RowType[], unknown];  // 올바름
```

### DB 쿼리

```typescript
// ✅ execute — 파라미터가 있는 모든 쿼리 (prepared statement, SQL injection 방어)
const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [id]) as [UserRow[], unknown];

// ✅ query — LIMIT/OFFSET을 동적으로 인라인해야 하는 경우만 허용
const [rows] = await pool.query(
  `SELECT * FROM auctions LIMIT ${lim} OFFSET ${off}`,
  params,
);

// ❌ query에 사용자 입력값을 직접 보간 — SQL injection 위험
await pool.query(`SELECT * FROM users WHERE id = ${userId}`);  // 절대 금지
```

### 에러 핸들링

```typescript
// ✅ 패턴: try/catch + 구체적 HTTP 상태
router.get('/:id', async (req, res) => {
  try {
    const [[row]] = await pool.execute(QUERY, [req.params.id]) as [Row[], unknown];
    if (!row) { res.status(404).json({ error: 'not found' }); return; }
    res.json(format(row));
  } catch (err) {
    console.error('[module] GET /:id error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

// ✅ early return — 중첩 else 금지
if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
```

### 네이밍

| 대상 | 규칙 | 예시 |
|------|------|------|
| 변수·함수 | camelCase | `topBidderId`, `formatAuction` |
| 타입·인터페이스 | PascalCase | `AuctionRow`, `DeliveryStatus` |
| 상수 | SCREAMING_SNAKE | `AUCTION_QUERY`, `MAX_FILE_SIZE` |
| 라우터 변수 | `router` (파일당 고정) | `const router = Router()` |
| DB 쿼리 상수 | `{ENTITY}_QUERY` | `const AUCTION_QUERY = \`SELECT ...\`` |

---

## 3. JavaScript (프론트엔드 `public/web/`)

### 모듈 구조

```js
// ✅ 페이지 파일 구조 (필수 순서)
// 1. CSS 인젝션 (한 번만)
// 2. import
// 3. export default async function load(params) { ... }
// 4. 순수 헬퍼 함수 (파일 하단)

// ✅ 공유 유틸 import — 로컬 재정의 금지
import { escapeHtml, escapeAttr } from '/app/scripts/dom.js';
import { formatPrice, formatDate } from '/app/scripts/format.js';
```

### DOM 조작

```js
// ✅ 정적 구조는 innerHTML, 동적 리스트는 createElement + appendChild
// 이유: innerHTML은 파싱 비용이 있지만 가독성이 높음.
//       반복 DOM은 Fragment를 쓰면 리플로우 최소화.

// ✅ 정적 구조
page.innerHTML = `<header class="...">...</header>`;

// ✅ 동적 리스트
const frag = document.createDocumentFragment();
items.forEach(item => frag.appendChild(buildCard(item)));
container.appendChild(frag);

// ❌ 루프 안에서 innerHTML 재할당 — 성능 저하
items.forEach(item => { container.innerHTML += buildCard(item); });
```

### fetch 패턴

```js
// ✅ 공통 패턴: async/await + 구체적 에러 메시지
async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ✅ 페이지에서 사용
try {
  const data = await apiFetch(`/api/auctions/${id}`);
  renderDetail(data);
} catch (err) {
  showToast(err.message, { variant: 'error' });
}
```

### 네이밍

| 대상 | 규칙 | 예시 |
|------|------|------|
| 변수·함수 | camelCase | `currentUser`, `renderFeed` |
| 상수 (모듈 스코프) | SCREAMING_SNAKE | `STEPS`, `CAT_EMOJI` |
| DOM 빌더 함수 | `build{Component}` | `buildCard`, `buildGroupEl` |
| 렌더 함수 | `render{Section}` | `renderFeed`, `renderList` |
| 이벤트 핸들러 | `on{Event}` or `handle{Event}` | `onCardClick`, `handleSubmit` |
| boolean 변수 | `is/has/can` 접두사 | `isSeller`, `hasTracking` |

### XSS 방어

```js
// ✅ 사용자 데이터는 반드시 escape
import { escapeHtml, escapeAttr } from '/app/scripts/dom.js';

// innerHTML에 동적 데이터 삽입 시
el.innerHTML = `<span>${escapeHtml(user.name)}</span>`;
// 속성값
el.innerHTML = `<img src="${escapeAttr(url)}">`;

// ✅ textContent 사용 가능 (자동 escape)
span.textContent = user.name;
```

---

## 4. CSS

### 토큰 사용 (강제)

```css
/* ✅ tokens.css 변수만 사용 */
color: var(--color-accent);
font-size: var(--fs-base);
padding: var(--space-3);

/* ❌ 리터럴 금지 */
color: #7BC470;
font-size: 14px;
padding: 12px;
```

### 네이밍 — 수정 BEM

```
{page}-{block}                   .orders-group
{page}-{block}__{element}        .orders-group__summary
{page}-{block}--{modifier}       .orders-group--active
{standalone}-{block}__{element}  .gdl-card__title   (페이지 prefix = 약어)
```

**페이지 prefix 표**

| 페이지 | prefix |
|--------|--------|
| home | `home-` |
| order-detail | `od-` |
| profile-orders | `orders-` |
| group-deal-list | `gdl-` |
| group-deal-detail | `gdd-` |
| group-deal-create | `gdc-` |
| seller-unshipped | `unshipped-` |

### 스크롤 패턴 (SPA 필수)

```css
/* 페이지 루트 */
.page {
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 스크롤 영역 */
.page__content {
  flex: 1;
  overflow-y: auto;
}
```

---

## 5. 공유 유틸 (`scripts/`)

| 파일 | 역할 | 주요 export |
|------|------|------------|
| `dom.js` | XSS-safe DOM 헬퍼 | `escapeHtml`, `escapeAttr` |
| `format.js` | 포매팅 순수 함수 | `formatPrice`, `formatDate`, `formatYmd` |
| `api.js` | fetch 래퍼 | `getLives`, `getProducts`, `getUser` |
| `native-bridge.js` | Flutter JS 브릿지 | `getSecureItem`, `setSecureItem` |
| `router.js` | SPA 라우터 | `navigate`, `replace`, `setCleanup` |
| `socket.js` | Socket.io 클라이언트 | `connect`, `identifyUser` |

**규칙: 페이지·컴포넌트 파일에서 `escapeHtml`, `formatPrice`, `formatDate`를 직접 정의하지 않는다.**

---

## 6. 금지 패턴 요약

| 금지 | 대체 |
|------|------|
| `any` 타입 | `unknown` + 타입가드 or 명시적 interface |
| `pool.query`에 사용자 입력 보간 | `pool.execute` + `?` 플레이스홀더 |
| 페이지 파일에서 `escapeHtml` 직접 정의 | `import from '/app/scripts/dom.js'` |
| 색상·폰트 리터럴 CSS | `var(--token)` |
| `innerHTML +=` 루프 | `createDocumentFragment` |
| `console.log` 프로덕션 코드 | `console.error`만 에러 시 허용 |
| `// TODO:` 주석 커밋 | 이슈로 분리 후 삭제 |
