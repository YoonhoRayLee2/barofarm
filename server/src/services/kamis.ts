import pool from '../db/mysql';

const KAMIS_KEY = process.env.KAMIS_KEY ?? '';
const KAMIS_ID = process.env.KAMIS_ID ?? '5001';

// kamisItemName: KAMIS dailySalesList 응답의 item_name 필드 값 (정확히 일치해야 함)
// itemCode: DB 내부 식별자 (KAMIS의 productno와 무관)
const TRACKED_ITEMS = [
  // 과일 (계절 품목 — 없으면 skip)
  { kamisItemName: '배/신고',         itemCode: 'pear',        itemName: '배',     kindName: '신고',  category: '과일' },
  { kamisItemName: '사과/후지',       itemCode: 'apple',       itemName: '사과',   kindName: '후지',  category: '과일' },
  // 채소
  { kamisItemName: '배추/봄',         itemCode: 'cabbage',     itemName: '배추',   kindName: '봄',    category: '채소' },
  { kamisItemName: '배추/고랭지',     itemCode: 'cabbage',     itemName: '배추',   kindName: '고랭지',category: '채소' },
  { kamisItemName: '무/월동',         itemCode: 'radish',      itemName: '무',     kindName: '월동',  category: '채소' },
  { kamisItemName: '파/대파',         itemCode: 'greenonion',  itemName: '대파',   kindName: '일반',  category: '채소' },
  { kamisItemName: '피마늘/한지',     itemCode: 'garlic',      itemName: '마늘',   kindName: '한지',  category: '채소' },
  { kamisItemName: '양파/일반',       itemCode: 'onion',       itemName: '양파',   kindName: '일반',  category: '채소' },
  { kamisItemName: '상추/청',         itemCode: 'lettuce',     itemName: '상추',   kindName: '청',    category: '채소' },
  // 곡물
  { kamisItemName: '쌀/20kg',         itemCode: 'rice',        itemName: '쌀',     kindName: '일반',  category: '곡물' },
  { kamisItemName: '고구마/밤',       itemCode: 'sweetpotato', itemName: '고구마', kindName: '밤',    category: '곡물' },
  // 축산
  { kamisItemName: '닭/육계(kg)',     itemCode: 'chicken',     itemName: '닭',     kindName: '육계',  category: '축산' },
  // 수산
  { kamisItemName: '고등어/냉동',     itemCode: 'mackerel',    itemName: '고등어', kindName: '냉동',  category: '수산' },
  { kamisItemName: '갈치/생선',       itemCode: 'hairtail',    itemName: '갈치',   kindName: '생선',  category: '수산' },
];

export interface MarketPriceRow {
  itemCode: string;
  itemName: string;
  kindName: string;
  unit: string;
  price: number;
  priceDate: string; // 'YYYY-MM-DD'
  category: string;
  prevPrice: number | null;
  dayChange: number | null;
  dayDirection: 'up' | 'down' | 'flat' | null;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}


export async function fetchAndCacheTodayPrices(): Promise<void> {
  try {
    const today = todayStr();
    // HTTPS 필수 — HTTP는 응답 없음
    const url = new URL('https://www.kamis.or.kr/service/price/xml.do');
    url.searchParams.set('action', 'dailySalesList');
    url.searchParams.set('p_cert_key', KAMIS_KEY);
    url.searchParams.set('p_cert_id', KAMIS_ID);
    url.searchParams.set('p_returntype', 'json');
    url.searchParams.set('p_convert_kg_yn', 'N');
    // p_regday 생략 → KAMIS가 당일 자동 적용 (UTC 이슈 방지)

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error(`[kamis] dailySalesList HTTP ${res.status}`);
      return;
    }

    const json: any = await res.json();
    // 응답 구조: json.price (json.data.item 아님)
    const items: any[] = json?.price ?? [];

    if (!items.length) {
      console.warn('[kamis] dailySalesList returned empty price list, error_code:', json?.error_code);
      return;
    }

    const conn = await pool.getConnection();
    try {
      const inserted = new Set<string>(); // itemCode 중복 방지 (배추 봄/고랭지 등)
      for (const tracked of TRACKED_ITEMS) {
        // kamisItemName으로 정확히 매칭, 소매가(product_cls_code='01')만 사용
        const match = items.find(
          (i: any) =>
            i.product_cls_code === '01' &&
            String(i.item_name ?? '').trim() === tracked.kamisItemName,
        );
        if (!match) continue;

        // 같은 itemCode가 이미 오늘 처리됐으면 skip (계절 변종 중복 방지)
        if (inserted.has(tracked.itemCode)) continue;

        const rawPrice = match.dpr1;
        if (!rawPrice || rawPrice === '-') continue;

        const price = parseInt(String(rawPrice).replace(/,/g, ''), 10);
        if (isNaN(price) || price <= 0) continue;

        const unit = String(match.unit ?? '').trim() || '';

        await conn.execute(
          `INSERT INTO market_prices (item_code, item_name, kind_name, unit, price, price_date, category)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE price = VALUES(price), unit = VALUES(unit), kind_name = VALUES(kind_name)`,
          [tracked.itemCode, tracked.itemName, tracked.kindName, unit, price, today, tracked.category],
        );
        inserted.add(tracked.itemCode);
      }
      console.log(`[kamis] cached ${inserted.size}/${TRACKED_ITEMS.length} items for ${today}`);
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('[kamis] fetchAndCacheTodayPrices error:', err);
  }
}

const TODAY_SELECT = `
  SELECT item_code, item_name, kind_name, unit, price, DATE_FORMAT(price_date, '%Y-%m-%d') AS price_date, category
  FROM market_prices
  WHERE price_date = DATE(NOW())
  ORDER BY category, item_name`;

/** 오늘 시세 행 목록에 직전 시세일 가격을 한 번의 쿼리로 병합한다. */
async function attachPrevPrices(
  conn: any,
  todayRows: any[],
): Promise<MarketPriceRow[]> {
  if (todayRows.length === 0) return [];

  // 오늘 품목 목록 수집
  const pairs = todayRows.map((r) => [r.item_code, r.kind_name]);

  // 각 (item_code, kind_name)의 오늘 이전 최신 price_date와 가격을 한 번에 조회
  // GROUP BY + MAX → 서브쿼리 조인으로 해당 날짜의 가격을 가져옴
  const placeholders = pairs.map(() => '(item_code = ? AND kind_name = ?)').join(' OR ');
  const params: string[] = pairs.flat();

  const [prevRows]: any = await conn.execute(
    `SELECT mp.item_code, mp.kind_name, mp.price AS prev_price
     FROM market_prices mp
     INNER JOIN (
       SELECT item_code, kind_name, MAX(price_date) AS max_date
       FROM market_prices
       WHERE price_date < DATE(NOW())
         AND (${placeholders})
       GROUP BY item_code, kind_name
     ) latest ON mp.item_code = latest.item_code
              AND mp.kind_name = latest.kind_name
              AND mp.price_date = latest.max_date`,
    params,
  );

  // 메모리 맵 구성: "itemCode:kindName" → prevPrice
  const prevMap = new Map<string, number>();
  for (const r of prevRows as any[]) {
    prevMap.set(`${r.item_code}:${r.kind_name}`, r.prev_price);
  }

  return todayRows.map((r) => {
    const base = toRow(r);
    const prevPrice = prevMap.get(`${r.item_code}:${r.kind_name}`) ?? null;
    const dayChange = prevPrice !== null ? base.price - prevPrice : null;
    const dayDirection: MarketPriceRow['dayDirection'] =
      prevPrice === null
        ? null
        : base.price === prevPrice
        ? 'flat'
        : base.price > prevPrice
        ? 'up'
        : 'down';
    return { ...base, prevPrice, dayChange, dayDirection };
  });
}

export async function getTodayPrices(): Promise<MarketPriceRow[]> {
  const conn = await pool.getConnection();
  try {
    const [rows]: any = await conn.execute(TODAY_SELECT);

    if ((rows as any[]).length === 0) {
      conn.release();
      await fetchAndCacheTodayPrices();
      const conn2 = await pool.getConnection();
      try {
        const [rows2]: any = await conn2.execute(TODAY_SELECT);
        return attachPrevPrices(conn2, rows2 as any[]);
      } finally {
        conn2.release();
      }
    }

    return attachPrevPrices(conn, rows as any[]);
  } finally {
    try { conn.release(); } catch {}
  }
}

export async function getPriceHistory(
  itemCode: string,
  kindName: string,
  days = 30,
): Promise<{ priceDate: string; price: number }[]> {
  const conn = await pool.getConnection();
  try {
    const [rows]: any = await conn.execute(
      `SELECT DATE_FORMAT(price_date, '%Y-%m-%d') AS price_date, price
       FROM market_prices
       WHERE item_code = ? AND kind_name = ?
         AND price_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       ORDER BY price_date ASC`,
      [itemCode, kindName, days],
    );

    return (rows as any[]).map((r: any) => ({ priceDate: r.price_date, price: r.price }));
  } finally {
    conn.release();
  }
}


// '무'처럼 1글자 품목은 단어 경계(공백 or 문자열 끝/시작)만 허용
function itemMatches(productName: string, itemName: string): boolean {
  if (itemName.length === 1) {
    return new RegExp(`(^|\\s)${itemName}(\\s|$)`).test(productName);
  }
  return productName.includes(itemName);
}

export async function matchMarketPrice(
  productName: string,
  category?: string,
): Promise<MarketPriceRow | null> {
  const prices = await getTodayPrices();

  // 매칭 후보: productName에 itemName이 포함되는 TRACKED_ITEMS 항목
  const candidates = TRACKED_ITEMS.filter((t) => itemMatches(productName, t.itemName));
  if (candidates.length === 0) return null;

  // category 우선, 그 다음 itemName 길이 내림차순
  candidates.sort((a, b) => {
    const aCat = category && a.category === category ? 1 : 0;
    const bCat = category && b.category === category ? 1 : 0;
    if (bCat !== aCat) return bCat - aCat;
    return b.itemName.length - a.itemName.length;
  });

  const best = candidates[0];
  return prices.find((p) => p.itemCode === best.itemCode) ?? null;
}

export interface PriceTrend {
  direction: 'up' | 'down' | 'flat';
  changePct: number;
  recentHigh: number;
  recentLow: number;
  current: number;
  sampleDays: number;
}

export async function getPriceTrend(
  itemCode: string,
  kindName: string,
): Promise<PriceTrend | null> {
  const history = await getPriceHistory(itemCode, kindName, 90);
  if (history.length < 2) return null;

  const current = history[history.length - 1].price;
  // 30일 전 기준점: 30일 이상 데이터가 있으면 30일 전 값, 없으면 가장 오래된 값
  const pastIdx = history.length >= 30 ? history.length - 30 : 0;
  const past = history[pastIdx].price;

  const changePct = Math.round(((current - past) / past) * 100);
  const direction = Math.abs(changePct) < 3 ? 'flat' : changePct > 0 ? 'up' : 'down';

  const prices = history.map((h) => h.price);
  const recentHigh = Math.max(...prices);
  const recentLow = Math.min(...prices);

  return { direction, changePct, recentHigh, recentLow, current, sampleDays: history.length };
}

function toRow(r: any): MarketPriceRow {
  return {
    itemCode: r.item_code,
    itemName: r.item_name,
    kindName: r.kind_name,
    unit: r.unit,
    price: r.price,
    priceDate: r.price_date,
    category: r.category,
    prevPrice: null,
    dayChange: null,
    dayDirection: null,
  };
}
