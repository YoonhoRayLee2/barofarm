"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMallProducts = getMallProducts;
exports.getProductById = getProductById;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// mall-products.json 을 모듈 로드 시 1회만 읽어 캐시
const dataPath = path_1.default.join(__dirname, '..', '..', '..', 'public', 'data', 'mall-products.json');
const _cache = JSON.parse(fs_1.default.readFileSync(dataPath, 'utf-8'));
function getMallProducts() {
    return _cache;
}
function getProductById(id) {
    return _cache.find(p => p.id === id) ?? null;
}
