import { UUID, EvidenciaFoto } from '../types';
export interface ProcessorInput {
    contenedorId: UUID;
    rawBuffer: Buffer | Uint8Array;
    originalWidth?: number;
    originalHeight?: number;
    fileName?: string;
}
export declare function processImageBuffer(input: ProcessorInput): {
    evidencia: EvidenciaFoto;
    webpBuffer: Buffer;
    simulado: true;
};
