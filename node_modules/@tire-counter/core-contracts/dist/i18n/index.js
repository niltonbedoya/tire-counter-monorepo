"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.zh = exports.ko = exports.ru = exports.en = exports.es = exports.DICTIONARIES = void 0;
exports.getDictionary = getDictionary;
const es_json_1 = __importDefault(require("./es.json"));
exports.es = es_json_1.default;
const en_json_1 = __importDefault(require("./en.json"));
exports.en = en_json_1.default;
const ru_json_1 = __importDefault(require("./ru.json"));
exports.ru = ru_json_1.default;
const ko_json_1 = __importDefault(require("./ko.json"));
exports.ko = ko_json_1.default;
const zh_json_1 = __importDefault(require("./zh.json"));
exports.zh = zh_json_1.default;
exports.DICTIONARIES = {
    es: es_json_1.default,
    en: en_json_1.default,
    ru: ru_json_1.default,
    ko: ko_json_1.default,
    zh: zh_json_1.default,
};
function getDictionary(lang) {
    return exports.DICTIONARIES[lang] || exports.DICTIONARIES.es;
}
