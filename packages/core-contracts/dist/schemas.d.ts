import { z } from 'zod';
export declare const IdiomaCodigoSchema: z.ZodEnum<["es", "en", "ru", "ko", "zh"]>;
export declare const RolUsuarioSchema: z.ZodEnum<["OPERARIO", "SUPERVISOR", "ADMINISTRADOR"]>;
export declare const EstadoContenedorSchema: z.ZodEnum<["ACTIVO", "BLOQUEADO_EN_BOVEDA", "DESPACHADO_PENDIENTE_ACK", "CONFIRMADO_EN_DESTINO", "PURGADO"]>;
export declare const OperarioSchema: z.ZodObject<{
    id: z.ZodString;
    nombre: z.ZodString;
    pinHash: z.ZodString;
    rol: z.ZodEnum<["OPERARIO", "SUPERVISOR", "ADMINISTRADOR"]>;
    idiomaPreferido: z.ZodEnum<["es", "en", "ru", "ko", "zh"]>;
    activo: z.ZodBoolean;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    nombre: string;
    pinHash: string;
    rol: "OPERARIO" | "SUPERVISOR" | "ADMINISTRADOR";
    idiomaPreferido: "es" | "en" | "ru" | "ko" | "zh";
    activo: boolean;
    createdAt: string;
}, {
    id: string;
    nombre: string;
    pinHash: string;
    rol: "OPERARIO" | "SUPERVISOR" | "ADMINISTRADOR";
    idiomaPreferido: "es" | "en" | "ru" | "ko" | "zh";
    activo: boolean;
    createdAt: string;
}>;
export declare const ItemNeumaticoBaseSchema: z.ZodObject<{
    id: z.ZodString;
    contenedorId: z.ZodString;
    llanta: z.ZodNumber;
    ancho: z.ZodNumber;
    perfil: z.ZodNumber;
    marca: z.ZodDefault<z.ZodString>;
    claveCompuesta: z.ZodString;
    cantidad: z.ZodNumber;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    contenedorId: string;
    llanta: number;
    ancho: number;
    perfil: number;
    marca: string;
    id: string;
    claveCompuesta: string;
    cantidad: number;
    updatedAt: string;
}, {
    contenedorId: string;
    llanta: number;
    ancho: number;
    perfil: number;
    id: string;
    claveCompuesta: string;
    cantidad: number;
    updatedAt: string;
    marca?: string | undefined;
}>;
export declare const ItemNeumaticoSchema: z.ZodEffects<z.ZodObject<{
    id: z.ZodString;
    contenedorId: z.ZodString;
    llanta: z.ZodNumber;
    ancho: z.ZodNumber;
    perfil: z.ZodNumber;
    marca: z.ZodDefault<z.ZodString>;
    claveCompuesta: z.ZodString;
    cantidad: z.ZodNumber;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    contenedorId: string;
    llanta: number;
    ancho: number;
    perfil: number;
    marca: string;
    id: string;
    claveCompuesta: string;
    cantidad: number;
    updatedAt: string;
}, {
    contenedorId: string;
    llanta: number;
    ancho: number;
    perfil: number;
    id: string;
    claveCompuesta: string;
    cantidad: number;
    updatedAt: string;
    marca?: string | undefined;
}>, {
    contenedorId: string;
    llanta: number;
    ancho: number;
    perfil: number;
    marca: string;
    id: string;
    claveCompuesta: string;
    cantidad: number;
    updatedAt: string;
}, {
    contenedorId: string;
    llanta: number;
    ancho: number;
    perfil: number;
    id: string;
    claveCompuesta: string;
    cantidad: number;
    updatedAt: string;
    marca?: string | undefined;
}>;
export declare const ItemInputSchema: z.ZodObject<{
    llanta: z.ZodNumber;
    ancho: z.ZodNumber;
    perfil: z.ZodNumber;
    marca: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    deltaCantidad: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    llanta: number;
    ancho: number;
    perfil: number;
    marca: string;
    deltaCantidad: number;
}, {
    llanta: number;
    ancho: number;
    perfil: number;
    deltaCantidad: number;
    marca?: string | undefined;
}>;
export declare const EvidenciaFotoSchema: z.ZodObject<{
    id: z.ZodString;
    contenedorId: z.ZodString;
    rutaLocal: z.ZodString;
    formato: z.ZodLiteral<"image/webp">;
    dimensionMaxPx: z.ZodNumber;
    pesoBytes: z.ZodNumber;
    sha256Local: z.ZodString;
    timestamp: z.ZodString;
}, "strip", z.ZodTypeAny, {
    contenedorId: string;
    id: string;
    rutaLocal: string;
    formato: "image/webp";
    dimensionMaxPx: number;
    pesoBytes: number;
    sha256Local: string;
    timestamp: string;
}, {
    contenedorId: string;
    id: string;
    rutaLocal: string;
    formato: "image/webp";
    dimensionMaxPx: number;
    pesoBytes: number;
    sha256Local: string;
    timestamp: string;
}>;
export declare const ProyectoContenedorSchema: z.ZodObject<{
    id: z.ZodString;
    codigoReferencia: z.ZodString;
    tipoOperacion: z.ZodOptional<z.ZodDefault<z.ZodEnum<["DESPACHO", "RECEPCION"]>>>;
    operarioId: z.ZodString;
    nombreOperarioSnapshot: z.ZodString;
    estado: z.ZodEnum<["ACTIVO", "BLOQUEADO_EN_BOVEDA", "DESPACHADO_PENDIENTE_ACK", "CONFIRMADO_EN_DESTINO", "PURGADO"]>;
    capacidadObjetivo: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    totalAcumulado: z.ZodNumber;
    hashSha256Paquete: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    reciboAckToken: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    updatedAt: string;
    codigoReferencia: string;
    operarioId: string;
    nombreOperarioSnapshot: string;
    estado: "ACTIVO" | "BLOQUEADO_EN_BOVEDA" | "DESPACHADO_PENDIENTE_ACK" | "CONFIRMADO_EN_DESTINO" | "PURGADO";
    totalAcumulado: number;
    tipoOperacion?: "DESPACHO" | "RECEPCION" | undefined;
    capacidadObjetivo?: number | null | undefined;
    hashSha256Paquete?: string | null | undefined;
    reciboAckToken?: string | null | undefined;
}, {
    id: string;
    createdAt: string;
    updatedAt: string;
    codigoReferencia: string;
    operarioId: string;
    nombreOperarioSnapshot: string;
    estado: "ACTIVO" | "BLOQUEADO_EN_BOVEDA" | "DESPACHADO_PENDIENTE_ACK" | "CONFIRMADO_EN_DESTINO" | "PURGADO";
    totalAcumulado: number;
    tipoOperacion?: "DESPACHO" | "RECEPCION" | undefined;
    capacidadObjetivo?: number | null | undefined;
    hashSha256Paquete?: string | null | undefined;
    reciboAckToken?: string | null | undefined;
}>;
export declare const ReceiptAckTokenSchema: z.ZodObject<{
    loteId: z.ZodString;
    sha256Verificado: z.ZodString;
    status: z.ZodLiteral<"VERIFIED">;
    timestamp: z.ZodString;
    validadorId: z.ZodString;
    signature: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "VERIFIED";
    timestamp: string;
    loteId: string;
    sha256Verificado: string;
    validadorId: string;
    signature: string;
}, {
    status: "VERIFIED";
    timestamp: string;
    loteId: string;
    sha256Verificado: string;
    validadorId: string;
    signature: string;
}>;
export declare const AuditVerdictSchema: z.ZodObject<{
    approved: z.ZodBoolean;
    violations: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    approved: boolean;
    violations: string[];
}, {
    approved: boolean;
    violations: string[];
}>;
