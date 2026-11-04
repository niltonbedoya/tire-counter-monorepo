export declare const TYPES_VERSION = "1.0.0";
export type UUID = string;
export type ISOTimestamp = string;
export type IdiomaCodigo = 'es' | 'en' | 'ru' | 'ko' | 'zh';
export type RolUsuario = 'OPERARIO' | 'SUPERVISOR' | 'ADMINISTRADOR';
export type EstadoContenedor = 'ACTIVO' | 'BLOQUEADO_EN_BOVEDA' | 'DESPACHADO_PENDIENTE_ACK' | 'CONFIRMADO_EN_DESTINO' | 'PURGADO';
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
    pinHash: string;
    rol: RolUsuario;
    idiomaPreferido: IdiomaCodigo;
    activo: boolean;
    createdAt: ISOTimestamp;
}
export interface ItemNeumatico {
    id: UUID;
    contenedorId: UUID;
    llanta: number;
    ancho: number;
    perfil: number;
    marca: string;
    claveCompuesta: string;
    cantidad: number;
    updatedAt: ISOTimestamp;
}
export interface EvidenciaFoto {
    id: UUID;
    contenedorId: UUID;
    rutaLocal: string;
    formato: 'image/webp';
    dimensionMaxPx: number;
    pesoBytes: number;
    sha256Local: string;
    timestamp: ISOTimestamp;
}
export interface ProyectoContenedor {
    id: UUID;
    codigoReferencia: string;
    tipoOperacion?: TipoOperacionLote;
    operarioId: UUID;
    nombreOperarioSnapshot: string;
    estado: EstadoContenedor;
    capacidadObjetivo?: number | null;
    totalAcumulado: number;
    hashSha256Paquete?: string | null;
    reciboAckToken?: string | null;
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
