import { z } from 'zod';

export const IdiomaCodigoSchema = z.enum(['es', 'en', 'ru', 'ko', 'zh']);
export const RolUsuarioSchema = z.enum(['OPERARIO', 'SUPERVISOR', 'ADMINISTRADOR']);

export const EstadoContenedorSchema = z.enum([
  'ACTIVO',
  'BLOQUEADO_EN_BOVEDA',
  'DESPACHADO_PENDIENTE_ACK',
  'CONFIRMADO_EN_DESTINO',
  'PURGADO',
]);

export const OperarioSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().min(1),
  pinHash: z.string().min(32),
  rol: RolUsuarioSchema,
  idiomaPreferido: IdiomaCodigoSchema,
  activo: z.boolean(),
  createdAt: z.string().datetime(),
});

export const ItemNeumaticoSchema = z.object({
  id: z.string().uuid(),
  contenedorId: z.string().uuid(),
  llanta: z.number().int().min(10).max(30),
  ancho: z.number().int().min(100).max(400),
  perfil: z.number().int().min(20).max(95),
  marca: z.string().default(''),
  claveCompuesta: z.string(),
  cantidad: z.number().int().min(1),
  updatedAt: z.string().datetime(),
}).refine(
  (data) => {
    const brand = data.marca && data.marca.trim() !== '' ? data.marca.trim() : 'GENERICA';
    const expected = `${data.ancho}/${data.perfil}R${data.llanta}--${brand}`;
    return data.claveCompuesta === expected;
  },
  {
    message: 'claveCompuesta debe coincidir con ${ancho}/${perfil}R${llanta}--${marca || GENERICA}',
  }
);

export const EvidenciaFotoSchema = z.object({
  id: z.string().uuid(),
  contenedorId: z.string().uuid(),
  rutaLocal: z.string().min(1),
  formato: z.literal('image/webp'),
  dimensionMaxPx: z.number().int().max(1280),
  pesoBytes: z.number().int().max(153600), // 150 KB = 153.600 bytes
  sha256Local: z.string().length(64),
  timestamp: z.string().datetime(),
});

export const ProyectoContenedorSchema = z.object({
  id: z.string().uuid(),
  codigoReferencia: z.string().min(1),
  tipoOperacion: z.enum(['DESPACHO', 'RECEPCION']).default('DESPACHO').optional(),
  operarioId: z.string().uuid(),
  nombreOperarioSnapshot: z.string().min(1),
  estado: EstadoContenedorSchema,
  capacidadObjetivo: z.number().int().positive().nullable().optional(),
  totalAcumulado: z.number().int().min(0),
  hashSha256Paquete: z.string().length(64).nullable().optional(),
  reciboAckToken: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ReceiptAckTokenSchema = z.object({
  loteId: z.string().uuid(),
  sha256Verificado: z.string().length(64),
  status: z.literal('VERIFIED'),
  timestamp: z.string().datetime(),
  validadorId: z.string().uuid(),
  signature: z.string().min(16),
});

export const AuditVerdictSchema = z.object({
  approved: z.boolean(),
  violations: z.array(z.string()),
});
