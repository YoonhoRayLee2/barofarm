"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
const bcrypt_1 = __importDefault(require("bcrypt"));
const SALT_ROUNDS = 12;
/**
 * 평문 비밀번호를 bcrypt 해시로 변환한다.
 */
async function hashPassword(plain) {
    return bcrypt_1.default.hash(plain, SALT_ROUNDS);
}
/**
 * 평문 비밀번호와 저장된 해시를 비교한다.
 */
async function verifyPassword(plain, hash) {
    return bcrypt_1.default.compare(plain, hash);
}
