"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const router = (0, express_1.Router)();
// ── Kakao Local API (키 있으면 우선 사용, 없으면 static JSON 폴백) ──────
const KAKAO_KEY = process.env.KAKAO_REST_API_KEY?.trim() || undefined;
let _static = null;
function loadStatic() {
    if (_static)
        return _static;
    const p = path_1.default.join(__dirname, '..', '..', 'public', 'data', 'hanaro-stores.json');
    _static = JSON.parse(fs_1.default.readFileSync(p, 'utf-8'));
    return _static;
}
function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
// ── Kakao Local keyword search ───────────────────────────────────────
async function searchKakao(query, lat, lng) {
    const params = new URLSearchParams({ query, size: '15' });
    if (lat != null && lng != null) {
        params.set('x', String(lng));
        params.set('y', String(lat));
        params.set('radius', '10000');
        params.set('sort', 'distance');
    }
    const res = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${params}`, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
    if (!res.ok)
        throw new Error(`Kakao API ${res.status}`);
    const data = await res.json();
    return data.documents
        .filter(d => d.place_name.startsWith('하나로마트') ||
        d.place_name.includes('농협하나로마트') ||
        d.place_name.includes('축협하나로마트'))
        .map(d => ({
        name: d.place_name,
        address: d.road_address_name || d.address_name,
        lat: parseFloat(d.y),
        lng: parseFloat(d.x),
        distance: d.distance ? parseFloat(d.distance) / 1000 : undefined,
    }));
}
// GET /api/hanaro-stores?lat=&lng=&radius=10&q=
router.get('/', async (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radius = parseFloat(req.query.radius || '10');
    const q = (req.query.q || '').trim();
    const hasCoords = !isNaN(lat) && !isNaN(lng);
    const hasQuery = q.length > 0;
    // ── Kakao path ──────────────────────────────────────────────────────
    if (KAKAO_KEY) {
        try {
            const keyword = hasQuery ? `하나로마트 ${q}` : '하나로마트';
            const results = await searchKakao(keyword, hasCoords ? lat : undefined, hasCoords ? lng : undefined);
            // 거리 기반일 때 radius 필터 추가 적용 (Kakao radius=10000이 이미 필터하지만 보정)
            const filtered = hasCoords
                ? results.filter(s => (s.distance ?? 0) <= radius)
                : results;
            res.json(filtered);
            return;
        }
        catch (err) {
            console.error('[hanaro-stores] Kakao API error, falling back to static:', err.message);
        }
    }
    // ── Static JSON fallback ────────────────────────────────────────────
    const stores = loadStatic();
    let results = stores;
    if (hasCoords) {
        results = stores
            .map(s => ({ ...s, distance: haversineKm(lat, lng, s.lat, s.lng) }))
            .filter(s => s.distance <= radius)
            .sort((a, b) => a.distance - b.distance);
    }
    else if (hasQuery) {
        const ql = q.toLowerCase();
        results = stores.filter(s => s.name.toLowerCase().includes(ql) || s.address.toLowerCase().includes(ql));
    }
    res.json(results.slice(0, 15));
});
exports.default = router;
