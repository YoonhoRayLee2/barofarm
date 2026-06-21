"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
const CARRIER_CODES = {
    'CJ대한통운': '04',
    '우체국택배': '01',
    '한진택배': '05',
    '롯데택배': '06',
    '로젠택배': '08',
    '경동택배': '23',
};
const CARRIER_LINKS = {
    'CJ대한통운': (n) => `https://trace.cjlogistics.com/next/tracking.html?wblNo=${n}`,
    '우체국택배': (n) => `https://service.epost.go.kr/trace.RetrieveDomRipTraceList.comm?sid1=${n}`,
    '한진택배': (n) => `https://www.hanjin.co.kr/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2=${n}`,
    '롯데택배': (n) => `https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=${n}`,
    '로젠택배': (n) => `https://www.ilogen.com/iLogenHub/tracking/${n}`,
    '경동택배': (n) => `https://kdexp.com/newDeliverySearch.ekd?barcode=${n}`,
};
// GET /api/tracking/:company/:number
router.get('/:company/:number', async (req, res) => {
    const company = decodeURIComponent(String(req.params.company));
    const number = decodeURIComponent(String(req.params.number));
    const directLink = CARRIER_LINKS[company]?.(encodeURIComponent(number)) ?? null;
    const carrierCode = CARRIER_CODES[company];
    const apiKey = process.env.SWEETTRACKER_API_KEY;
    // API 키 없거나 지원하지 않는 택배사 → 직접 링크만 반환
    if (!apiKey || !carrierCode) {
        res.json({ ok: false, directLink, events: [], msg: apiKey ? '지원하지 않는 택배사입니다' : 'API 키 미설정' });
        return;
    }
    try {
        const url = `https://info.sweettracker.co.kr/api/v1/trackingInfo` +
            `?t_key=${encodeURIComponent(apiKey)}` +
            `&t_code=${encodeURIComponent(carrierCode)}` +
            `&t_invoice=${encodeURIComponent(number)}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const data = await resp.json();
        if (!data.status) {
            res.json({ ok: false, directLink, events: [], msg: data.msg ?? '조회 결과가 없습니다' });
            return;
        }
        const events = (data.trackingDetails ?? []).map((e) => ({
            time: e.timeString,
            where: e.where,
            status: e.kind,
            level: e.level,
        }));
        res.json({ ok: true, directLink, complete: !!data.complete, events });
    }
    catch (err) {
        console.error('[tracking] fetch error:', err);
        res.json({ ok: false, directLink, events: [], msg: '배송 조회에 실패했습니다' });
    }
});
exports.default = router;
