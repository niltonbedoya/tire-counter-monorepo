"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditVerdictSchema = exports.ReceiptAckTokenSchema = exports.ProyectoContenedorSchema = exports.EvidenciaFotoSchema = exports.ItemNeumaticoSchema = exports.OperarioSchema = exports.EstadoContenedorSchema = exports.RolUsuarioSchema = exports.IdiomaCodigoSchema = void 0;
const zod_1 = require("zod");
exports.IdiomaCodigoSchema = zod_1.z.enum(['es', 'en', 'ru', 'ko', 'zh']);
exports.RolUsuarioSchema = zod_1.z.enum(['OPERARIO', 'SUPERVISOR', 'ADMINISTRADOR']);
exports.EstadoContenedorSchema = zod_1.z.enum([
    'ACTIVO',
    'BLOQUEADO_EN_BOVEDA',
    'DESPACHADO_PENDIENTE_ACK',
    'CONFIRMADO_EN_DESTINO',
    'PURGADO',
]);
exports.OperarioSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    nombre: zod_1.z.string().min(1),
    pinHash: zod_1.z.string().min(32),
    rol: exports.RolUsuarioSchema,
    idiomaPreferido: exports.IdiomaCodigoSchema,
    activo: zod_1.z.boolean(),
    createdAt: zod_1.z.string().datetime(),
});
exports.ItemNeumaticoSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    contenedorId: zod_1.z.string().uuid(),
    llanta: zod_1.z.number().int().min(10).max(30),
    ancho: zod_1.z.number().int().min(100).max(400),
    perfil: zod_1.z.number().int().min(20).max(95),
    marca: zod_1.z.string().default(''),
    claveCompuesta: zod_1.z.string(),
    cantidad: zod_1.z.number().int().min(1),
    updatedAt: zod_1.z.string().datetime(),
}).refine((data) => {
    const brand = data.marca && data.marca.trim() !== '' ? data.marca.trim() : 'GENERICA';
    const expected = `${data.ancho}/${data.perfil}R${data.llanta}--${brand}`;
    return data.claveCompuesta === expected;
}, {
    message: 'claveCompuesta debe coincidir con ${ancho}/${perfil}R${llanta}--${marca || GENERICA}',
});
exports.EvidenciaFotoSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    contenedorId: zod_1.z.string().uuid(),
    rutaLocal: zod_1.z.string().min(1),
    formato: zod_1.z.literal('image/webp'),
    dimensionMaxPx: zod_1.z.number().int().max(1280),
    pesoBytes: zod_1.z.number().int().max(153600), // 150 KB = 153.600 bytes
    sha256Local: zod_1.z.string().length(64),
    timestamp: zod_1.z.string().datetime(),
});
exports.ProyectoContenedorSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    codigoReferencia: zod_1.z.string().min(1),
    tipoOperacion: zod_1.z.enum(['DESPACHO', 'RECEPCION']).default('DESPACHO').optional(),
    operarioId: zod_1.z.string().uuid(),
    nombreOperarioSnapshot: zod_1.z.string().min(1),
    estado: exports.EstadoContenedorSchema,
    capacidadObjetivo: zod_1.z.number().int().positive().nullable().optional(),
    totalAcumulado: zod_1.z.number().int().min(0),
    hashSha256Paquete: zod_1.z.string().length(64).nullable().optional(),
    reciboAckToken: zod_1.z.string().nullable().optional(),
    createdAt: zod_1.z.string().datetime(),
    updatedAt: zod_1.z.string().datetime(),
});
exports.ReceiptAckTokenSchema = zod_1.z.object({
    loteId: zod_1.z.string().uuid(),
    sha256Verificado: zod_1.z.string().length(64),
    status: zod_1.z.literal('VERIFIED'),
    timestamp: zod_1.z.string().datetime(),
    validadorId: zod_1.z.string().uuid(),
    signature: zod_1.z.string().min(16),
});
exports.AuditVerdictSchema = zod_1.z.object({
    approved: zod_1.z.boolean(),
    violations: zod_1.z.array(zod_1.z.string()),
});
