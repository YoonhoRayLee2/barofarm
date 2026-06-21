// /api/mall/* fetch wrapper
const BASE = '/api/mall';

async function jsonFetch(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const err = new Error(`Mall API ${res.status}: ${url}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function listProducts({ category, q, limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (q) params.set('q', q);
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  return jsonFetch(`${BASE}/products?${params.toString()}`);
}

export async function getProduct(id) {
  return jsonFetch(`${BASE}/products/${encodeURIComponent(id)}`);
}

export async function listCategories() {
  return jsonFetch(`${BASE}/categories`);
}
