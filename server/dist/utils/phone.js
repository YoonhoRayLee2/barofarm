"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePhone = normalizePhone;
/**
 * 휴대폰번호를 `010-XXXX-XXXX` 형태로 정규화한다.
 * 010XXXXXXXX, 010-XXXX-XXXX 모두 허용.
 * 잘못된 형식이면 null 반환.
 */
function normalizePhone(input) {
    if (!input)
        return null;
    const digits = input.replace(/-/g, '');
    if (!/^010\d{8}$/.test(digits))
        return null;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}
