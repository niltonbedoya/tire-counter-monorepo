import { ProyectoContenedor, ItemNeumatico, EvidenciaFoto, UUID, ItemStock } from './types';
export interface IContenedorRepository {
    crearContenedor(datos: Omit<ProyectoContenedor, 'createdAt' | 'updatedAt'>): Promise<ProyectoContenedor>;
    obtenerContenedor(id: UUID): Promise<ProyectoContenedor | null>;
    listarContenedores(): Promise<ProyectoContenedor[]>;
    actualizarContenedor(id: UUID, patch: Partial<ProyectoContenedor>): Promise<ProyectoContenedor>;
    guardarItem(item: ItemNeumatico): Promise<ItemNeumatico>;
    obtenerItems(contenedorId: UUID): Promise<ItemNeumatico[]>;
    guardarFoto(foto: EvidenciaFoto): Promise<EvidenciaFoto>;
    obtenerFotos(contenedorId: UUID): Promise<EvidenciaFoto[]>;
    eliminarFotos(contenedorId: UUID): Promise<number>;
    obtenerStockTotal(): Promise<ItemStock[]>;
    ingresarStockDesdeLote(loteId: UUID): Promise<number>;
}
/**
 * SQLite Local Adapter: Simula la persistencia local transaccional SQLite
 */
export declare class SQLiteLocalAdapter implements IContenedorRepository {
    private contenedores;
    private items;
    private fotos;
    private stock;
    crearContenedor(datos: Omit<ProyectoContenedor, 'createdAt' | 'updatedAt'>): Promise<ProyectoContenedor>;
    obtenerContenedor(id: UUID): Promise<ProyectoContenedor | null>;
    listarContenedores(): Promise<ProyectoContenedor[]>;
    actualizarContenedor(id: UUID, patch: Partial<ProyectoContenedor>): Promise<ProyectoContenedor>;
    guardarItem(item: ItemNeumatico): Promise<ItemNeumatico>;
    obtenerItems(contenedorId: UUID): Promise<ItemNeumatico[]>;
    guardarFoto(foto: EvidenciaFoto): Promise<EvidenciaFoto>;
    obtenerFotos(contenedorId: UUID): Promise<EvidenciaFoto[]>;
    eliminarFotos(contenedorId: UUID): Promise<number>;
    obtenerStockTotal(): Promise<ItemStock[]>;
    ingresarStockDesdeLote(loteId: UUID): Promise<number>;
}
/**
 * HTTP LAN Client Adapter: Enruta las llamadas a un backend servidor LAN
 */
export declare class HttpLanClientAdapter implements IContenedorRepository {
    private readonly remoteEndpointMock;
    constructor(remoteEndpointMock: IContenedorRepository);
    crearContenedor(datos: Omit<ProyectoContenedor, 'createdAt' | 'updatedAt'>): Promise<ProyectoContenedor>;
    obtenerContenedor(id: UUID): Promise<ProyectoContenedor | null>;
    listarContenedores(): Promise<ProyectoContenedor[]>;
    actualizarContenedor(id: UUID, patch: Partial<ProyectoContenedor>): Promise<ProyectoContenedor>;
    guardarItem(item: ItemNeumatico): Promise<ItemNeumatico>;
    obtenerItems(contenedorId: UUID): Promise<ItemNeumatico[]>;
    guardarFoto(foto: EvidenciaFoto): Promise<EvidenciaFoto>;
    obtenerFotos(contenedorId: UUID): Promise<EvidenciaFoto[]>;
    eliminarFotos(contenedorId: UUID): Promise<number>;
    obtenerStockTotal(): Promise<ItemStock[]>;
    ingresarStockDesdeLote(loteId: UUID): Promise<number>;
}
