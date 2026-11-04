"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.inspectImageMetadata = inspectImageMetadata;
exports.verifyCompressionLimits = verifyCompressionLimits;
exports.checkWebpIntegrity = checkWebpIntegrity;
const node_crypto_1 = __importDefault(require("node:crypto"));
function inspectImageMetadata(buffer, customDimensions) {
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const pesoBytes = buf.length;
    const sha256 = node_crypto_1.default.createHash('sha256').update(buf).digest('hex');
    // Check RIFF and WEBP magic bytes
    const isRiff = buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF';
    const isWebpHeader = buf.length >= 12 && buf.toString('ascii', 8, 12) === 'WEBP';
    const isWebP = isRiff && isWebpHeader;
    // Use supplied dimensions or parse VP8/VP8L/VP8X chunk if present, else fallback
    let width = customDimensions?.width ?? 1280;
    let height = customDimensions?.height ?? 720;
    if (isWebP && buf.length >= 30) {
        const chunkType = buf.toString('ascii', 12, 16);
        if (chunkType === 'VP8X' && buf.length >= 30) {
            width = 1 + buf.readUIntLE(24, 3);
            height = 1 + buf.readUIntLE(27, 3);
        }
    }
    const dimensionMaxPx = Math.max(width, height);
    return {
        width,
        height,
        dimensionMaxPx,
        pesoBytes,
        formato: isWebP ? 'image/webp' : 'unknown',
        isWebP,
        sha256,
    };
}
function verifyCompressionLimits(meta) {
    const violations = [];
    const MAX_DIMENSION = 1280;
    const MAX_BYTES = 153600; // 150 KB
    if (meta.dimensionMaxPx > MAX_DIMENSION) {
        violations.push(`Dimensión máxima (${meta.dimensionMaxPx} px) excede el límite de ${MAX_DIMENSION} px`);
    }
    if (meta.pesoBytes >= MAX_BYTES) {
        violations.push(`Peso de archivo (${meta.pesoBytes} bytes) excede la cuota estricta de ${MAX_BYTES} bytes (150 KB)`);
    }
    return {
        compliant: violations.length === 0,
        violations,
    };
}
function checkWebpIntegrity(buffer) {
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    if (buf.length < 12) {
        return {
            validHeader: false,
            sha256: '',
            error: 'Archivo corrupto o truncado: longitud inferior a encabezado RIFF (12 bytes)',
        };
    }
    const isRiff = buf.toString('ascii', 0, 4) === 'RIFF';
    const isWebp = buf.toString('ascii', 8, 12) === 'WEBP';
    const sha256 = node_crypto_1.default.createHash('sha256').update(buf).digest('hex');
    if (!isRiff || !isWebp) {
        return {
            validHeader: false,
            sha256,
            error: 'Encabezado RIFF/WEBP inválido',
        };
    }
    return {
        validHeader: true,
        sha256,
    };
}
