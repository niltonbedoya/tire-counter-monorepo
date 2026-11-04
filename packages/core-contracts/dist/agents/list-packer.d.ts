import { ProyectoContenedor, ItemNeumatico, EvidenciaFoto, PaqueteDespacho } from '../types';
export interface ListPackerInput {
    contenedor: ProyectoContenedor;
    items: ItemNeumatico[];
    fotos?: Array<{
        evidencia: EvidenciaFoto;
        buffer: Buffer | Uint8Array;
    }>;
}
export declare function compileOpenXmlManifest(contenedor: ProyectoContenedor, items: ItemNeumatico[]): Promise<Buffer>;
export declare function generateDispatchZip(input: ListPackerInput): Promise<PaqueteDespacho>;
