"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calcCarbon = calcCarbon;
// 우편번호 앞 2자리 → 지역 중심 좌표 (위도, 경도)
// 한국 5자리 우편번호 기준 (2015년 체계)
const ZIPCODE_COORDS = {
    '01': [37.60, 127.02], '02': [37.56, 126.97], '03': [37.57, 126.96],
    '04': [37.50, 127.03], '05': [37.50, 127.12], '06': [37.48, 127.03],
    '07': [37.52, 126.85], '08': [37.49, 126.86], '09': [37.64, 127.06],
    // 경기
    '10': [37.73, 127.05], '11': [37.66, 127.23], '12': [37.68, 127.45],
    '13': [37.44, 126.70], '14': [37.39, 126.64], '15': [37.35, 126.92],
    '16': [37.27, 127.00], '17': [37.28, 127.28], '18': [37.21, 127.09],
    // 인천
    '21': [37.48, 126.62], '22': [37.52, 126.52], '23': [37.55, 126.68],
    // 강원
    '24': [37.88, 127.73], '25': [37.34, 128.01], '26': [37.15, 128.48],
    // 충북
    '27': [36.99, 127.92], '28': [36.64, 127.49], '29': [36.36, 127.93],
    // 충남/대전/세종
    '30': [36.35, 127.38], '31': [36.81, 127.11], '32': [36.47, 126.64],
    '33': [36.79, 126.45], '34': [36.02, 127.14], '35': [36.34, 126.59],
    // 경북
    '36': [36.57, 128.73], '37': [36.11, 128.34], '38': [36.21, 129.27],
    '39': [37.11, 129.37],
    // 대구/경북
    '40': [35.87, 128.60], '41': [35.93, 128.79], '42': [36.11, 128.73],
    '43': [36.57, 128.21],
    // 경남/울산
    '44': [35.54, 129.31], '45': [35.18, 129.08],
    '47': [35.22, 128.68], '48': [35.13, 128.99], '49': [35.34, 128.70],
    // 부산
    '46': [35.15, 129.07],
    // 전북
    '54': [35.82, 127.15], '55': [35.57, 127.17], '56': [35.69, 126.85],
    // 전남/광주
    '57': [34.77, 126.46], '58': [34.81, 127.66], '59': [34.95, 127.49],
    '60': [35.16, 126.85], '61': [34.74, 126.71], '62': [35.02, 126.72],
    // 제주
    '63': [33.50, 126.53],
};
function getCoords(zipcode) {
    const prefix = zipcode.replace(/\D/g, '').slice(0, 2);
    return ZIPCODE_COORDS[prefix] ?? null;
}
// Haversine 공식 (km)
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const SUPERMARKET_KM = 800; // 마트 유통 평균 이동거리 (km)
const CO2_PER_KM_KG = 0.000166; // 도로 화물 1kg·km당 CO2 (kg)
const AVG_PURCHASE_KG = 3; // 농산물 평균 구매 무게 가정 (kg)
function calcCarbon(farmZipcode, buyerZipcode) {
    const farmCoords = getCoords(farmZipcode);
    const buyerCoords = getCoords(buyerZipcode);
    if (!farmCoords || !buyerCoords)
        return null;
    const distanceKm = Math.round(haversine(...farmCoords, ...buyerCoords));
    const savedKm = Math.max(0, SUPERMARKET_KM - distanceKm);
    const savedCo2g = Math.round(savedKm * CO2_PER_KM_KG * AVG_PURCHASE_KG * 1000);
    const savedPct = Math.round((savedKm / SUPERMARKET_KM) * 100);
    return { distanceKm, savedKm, savedCo2g, savedPct };
}
