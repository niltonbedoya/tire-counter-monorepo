import { ReceiptAckToken, PaqueteDespacho, ProyectoContenedor } from './types';
export declare class SecurityHashMismatchError extends Error {
    readonly expectedHash: string;
    readonly receivedHash: string;
    constructor(expectedHash: string, receivedHash: string, message?: string);
}
export interface DispatchAckResult {
    success: boolean;
    purged: boolean;
    contenedorActualizado: ProyectoContenedor;
    mensaje: string;
}
export declare function processReceiptAck(contenedor: ProyectoContenedor, paquete: PaqueteDespacho, ackToken: ReceiptAckToken, purgeCallback: () => Promise<void> | void): Promise<DispatchAckResult>;
