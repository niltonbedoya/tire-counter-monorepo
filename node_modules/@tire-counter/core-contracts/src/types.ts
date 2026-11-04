export const TYPES_VERSION = '1.0.0';

export type UUID = string;
export type ISOTimestamp = string;

export type IdiomaCodigo = 'es' | 'en' | 'ru' | 'ko' | 'zh';
export type RolUsuario = 'OPERARIO' | 'SUPERVISOR' | 'ADMINISTRADOR';

export type EstadoContenedor = 
  | 'ACTIVO'
  | 'BLOQUEADO_EN_BOVEDA'
  | 'DESPACHADO_PENDIENTE_ACK'
  | 'CONFIRMADO_EN_DESTINO'
  | 'PURGADO';

export type TipoOperacionLote = 'DESPACHO' | 'RECEPCION';

export interface ItemStock {
  claveCompuesta: string;
  ancho: number;
  perfil: number;
  llanta: number;
  marca: string;
  cantidadTotal: number;
  updatedAt: ISOTimestamp;
}

export interface Operario {
  id: UUID;
  nombre: string;
  pinHash: string; // PBKDF2-HMAC-SHA256 con salt local
  rol: RolUsuario;
  idiomaPreferido: IdiomaCodigo;
  activo: boolean;
  createdAt: ISOTimestamp;
}

export interface ItemNeumatico {
  id: UUID;
  contenedorId: UUID;
  llanta: number;   // 13, 14, 15, 16, 17, 18, 19, 20...
  ancho: number;    // 155, 165, 175, 185, 195, 205, 215, 225...
  perfil: number;   // 40, 45, 50, 55, 60, 65, 70, 75...
  marca: string;    // Opcional; default: "" (o "GENERICA" en clave)
  claveCompuesta: string; // Invariante: `${ancho}/${perfil}R${llanta}--${marca || 'GENERICA'}`
  cantidad: number; // Invariante: >= 1
  updatedAt: ISOTimestamp;
}

export interface EvidenciaFoto {
  id: UUID;
  contenedorId: UUID;
  rutaLocal: string;
  formato: 'image/webp';
  dimensionMaxPx: number; // Invariante: <= 1280
  pesoBytes: number;      // Invariante: < 153600 (150 KB)
  sha256Local: string;
  timestamp: ISOTimestamp;
}

export interface ProyectoContenedor {
  id: UUID;
  codigoReferencia: string; // ej. "Contenedor 203248" o "Albarán Prov-4029"
  tipoOperacion?: TipoOperacionLote; // 'DESPACHO' | 'RECEPCION' (default: 'DESPACHO')
  operarioId: UUID;
  nombreOperarioSnapshot: string;
  estado: EstadoContenedor;
  capacidadObjetivo?: number | null;
  totalAcumulado: number;            // Derivado atómico: sum(ItemNeumatico.cantidad)
  hashSha256Paquete?: string | null; // Calculado sobre el paquete .zip de despacho
  reciboAckToken?: string | null;    // Token criptográfico emitido por receptor
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

export interface ReceiptAckToken {
  loteId: UUID;
  sha256Verificado: string;
  status: 'VERIFIED';
  timestamp: ISOTimestamp;
  validadorId: UUID;
  signature: string;
}

export interface AuditVerdict {
  approved: boolean;
  violations: string[];
}

export interface PaqueteDespacho {
  loteId: UUID;
  archivoNombre: string;
  bufferZip: Uint8Array | Buffer;
  sha256: string;
  fotosCount: number;
  totalNeumaticos: number;
  timestamp: ISOTimestamp;
}

export interface AggregatorInput {
  contenedorId: UUID;
  llanta: number;
  ancho: number;
  perfil: number;
  marca?: string;
  deltaCantidad: number;
  moduloMarcaActivo?: boolean;
}

export interface AggregatorOutput {
  item: ItemNeumatico;
  items: ItemNeumatico[];
  totalAcumulado: number;
}
