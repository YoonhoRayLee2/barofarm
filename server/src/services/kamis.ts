import pool from '../db/mysql';

const KAMIS_KEY = process.env.KAMIS_KEY ?? '';
const KAMIS_ID = process.env.KAMIS_ID ?? '5001';

const TRACKED_ITEMS = [
  // 과일
  { categoryCode: '400', itemCode: '111', kindCode: '03', itemName: '사과',     kindName: '후지',    unit: '10개',   category: '과일' },
  { categoryCode: '400', itemCode: '112', kindCode: '01', itemName: '배',       kindName: '신고',    unit: '10개',   category: '과일' },
  { categoryCode: '400', itemCode: '123', kindCode: '01', itemName: '감귤',     kindName: '온주',    unit: '10개',   category: '과일' },
  { categoryCode: '400', itemCode: '128', kindCode: '00', itemName: '딸기',     kindName: '설향',    unit: '100g',   category: '과일' },
  // 채소
  { categoryCode: '200', itemCode: '211', kindCode: '00', itemName: '배추',     kindName: '고랭지',  unit: '1포기',  category: '채소' },
  { categoryCode: '200', itemCode: '212', kindCode: '00', itemName: '무',       kindName: '일반',    unit: '1개',    category: '채소' },
  { categoryCode: '200', itemCode: '226', kindCode: '00', itemName: '양파',     kindName: '일반',    unit: '1kg',    category: '채소' },
  { categoryCode: '200', itemCode: '227', kindCode: '00', itemName: '대파',     kindName: '일반',    unit: '1kg',    category: '채소' },
  { categoryCode: '200', itemCode: '215', kindCode: '01', itemName: '마늘',     kindName: '한지',    unit: '1kg',    category: '채소' },
  // 곡물
  { categoryCode: '100', itemCode: '111', kindCode: '01', itemName: '쌀',       kindName: '일반',    unit: '20kg',   category: '곡물' },
  { categoryCode: '100', itemCode: '152', kindCode: '00', itemName: '감자',     kindName: '수미',    unit: '100g',   category: '곡물' },
  // 축산
  { categoryCode: '500', itemCode: '531', kindCode: '00', itemName: '돼지고기', kindName: '삼겹살',  unit: '100g',   category: '축산' },
  { categoryCode: '500', itemCode: '560', kindCode: '00', itemName: '계란',     kindName: '특란',    unit: '10개',   category: '축산' },
  // 수산
  { categoryCode: '600', itemCode: '811', kindCode: '00', itemName: '고등어',   kindName: '일반',    unit: '1마리',  category: '수산' },
  { categoryCode: '600', itemCode: '813', kindCode: '00', itemName: '갈치',     kindName: '일반',    unit: '1마리',  category: '수산' },
];

export interface MarketPriceRow {
  itemCode: string;
  itemName: string;
  kindName: string;
  unit: string;
  price: number;
  priceDate: string; // 'YYYY-MM-DD'
  category: string;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function fetchAndCacheTodayPrices(): Promise<void> {
  try {
    const today = todayStr();
    const url = new URL('http://www.kamis.or.kr/service/price/xml.do');
    url.searchParams.set('action', 'dailySalesList');
    url.searchParams.set('p_cert_key', KAMIS_KEY);
    url.searchParams.set('p_cert_id', KAMIS_ID);
    url.searchParams.set('p_returntype', 'json');
    url.searchParams.set('p_regday', today);
    url.searchParams.set('p_convert_kg_yn', 'N');

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error(`[kamis] dailySalesList HTTP ${res.status}`);
      return;
    }

    const json: any = await res.json();
    const items: any[] = json?.data?.item ?? [];

    const conn = await pool.getConnection();
    try {
      for (const tracked of TRACKED_ITEMS) {
        const match = items.find(
          (i: any) =>
            String(i.item_code) === tracked.itemCode &&
            String(i.kind_code) === tracked.kindCode,
        );
        if (!match) continue;

        const rawPrice = match.dpr1;
        if (!rawPrice || rawPrice === '-') continue;

        const price = parseInt(String(rawPrice).replace(/,/g, ''), 10);
        if (isNaN(price)) continue;

        const unit = match.unit || tracked.unit;

        await conn.execute(
          `INSERT INTO market_prices (item_code, item_name, kind_name, unit, price, price_date, category)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE price = VALUES(price), unit = VALUES(unit)`,
          [tracked.itemCode, tracked.itemName, tracked.kindName, unit, price, today, tracked.category],
        );
      }
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('[kamis] fetchAndCacheTodayPrices error:', err);
  }
}

export async function getTodayPrices(): Promise<MarketPriceRow[]> {
  const conn = await pool.getConnection();
  try {
    const [rows]: any = await conn.execute(
      `SELECT item_code, item_name, kind_name, unit, price, DATE_FORMAT(price_date, '%Y-%m-%d') AS price_date, category
       FROM market_prices
       WHERE price_date = DATE(NOW())
       ORDER BY category, item_name`,
    );

    if ((rows as any[]).length === 0) {
      conn.release();
      await fetchAndCacheTodayPrices();
      const conn2 = await pool.getConnection();
      try {
        const [rows2]: any = await conn2.execute(
          `SELECT item_code, item_name, kind_name, unit, price, DATE_FORMAT(price_date, '%Y-%m-%d') AS price_date, category
           FROM market_prices
           WHERE price_date = DATE(NOW())
           ORDER BY category, item_name`,
        );
        return (rows2 as any[]).map(toRow);
      } finally {
        conn2.release();
      }
    }

    return (rows as any[]).map(toRow);
  } finally {
    // conn may already be released above; guard with a try
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

    if ((rows as any[]).length < 7) {
      const tracked = TRACKED_ITEMS.find(
        (t) => t.itemCode === itemCode && t.kindName === kindName,
      );
      if (tracked) {
        await fetchPeriodAndCache(tracked, daysAgoStr(days), todayStr(), conn);
        const [rows2]: any = await conn.execute(
          `SELECT DATE_FORMAT(price_date, '%Y-%m-%d') AS price_date, price
           FROM market_prices
           WHERE item_code = ? AND kind_name = ?
             AND price_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
           ORDER BY price_date ASC`,
          [itemCode, kindName, days],
        );
        return (rows2 as any[]).map((r: any) => ({ priceDate: r.price_date, price: r.price }));
      }
    }

    return (rows as any[]).map((r: any) => ({ priceDate: r.price_date, price: r.price }));
  } finally {
    conn.release();
  }
}

async function fetchPeriodAndCache(
  tracked: (typeof TRACKED_ITEMS)[number],
  startDay: string,
  endDay: string,
  conn: any,
): Promise<void> {
  try {
    const url = new URL('http://www.kamis.or.kr/service/price/xml.do');
    url.searchParams.set('action', 'periodProductList');
    url.searchParams.set('p_cert_key', KAMIS_KEY);
    url.searchParams.set('p_cert_id', KAMIS_ID);
    url.searchParams.set('p_returntype', 'json');
    url.searchParams.set('p_startday', startDay);
    url.searchParams.set('p_endday', endDay);
    url.searchParams.set('p_itemcategorycode', tracked.categoryCode);
    url.searchParams.set('p_itemcode', tracked.itemCode);
    url.searchParams.set('p_kindcode', tracked.kindCode);
    url.searchParams.set('p_graderank', '상');
    url.searchParams.set('p_convert_kg_yn', 'N');

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error(`[kamis] periodProductList HTTP ${res.status}`);
      return;
    }

    const json: any = await res.json();
    const items: any[] = json?.data?.item ?? [];

    for (const item of items) {
      const regday: string = item.regday;
      const rawPrice = item.price;
      if (!regday || !rawPrice || rawPrice === '-') continue;

      const price = parseInt(String(rawPrice).replace(/,/g, ''), 10);
      if (isNaN(price)) continue;

      // regday may be 'YYYY/MM/DD' or 'YYYY-MM-DD'
      const priceDate = regday.replace(/\//g, '-');

      await conn.execute(
        `INSERT INTO market_prices (item_code, item_name, kind_name, unit, price, price_date, category)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE price = VALUES(price), unit = VALUES(unit)`,
        [tracked.itemCode, tracked.itemName, tracked.kindName, tracked.unit, price, priceDate, tracked.category],
      );
    }
  } catch (err) {
    console.error('[kamis] fetchPeriodAndCache error:', err);
  }
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
  };
}
