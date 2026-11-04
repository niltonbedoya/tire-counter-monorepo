import { ProyectoContenedor, ItemNeumatico, EvidenciaFoto, ItemStock, UUID } from './types';
import { IContenedorRepository, SQLiteLocalAdapter } from './repository';
export interface SupabaseConfig {
    supabaseUrl: string;
    supabaseKey: string;
}
export interface UsuarioPerfil {
    id: string;
    email: string;
    nombre: string;
    rol: 'operario' | 'admin';
    codigo: string;
}
/**
 * SupabaseCloudAdapter: Cliente directo a la nube de Supabase en Seúl
 */
export declare class SupabaseCloudAdapter implements IContenedorRepository {
    private url;
    private key;
    constructor(config: SupabaseConfig);
    private fetchApi;
    buscarUsuarioPorCodigo(codigo: string): Promise<UsuarioPerfil | null>;
    validarCredenciales(codigo: string, password: string): Promise<{
        ok: boolean;
        user?: UsuarioPerfil;
        error?: string;
    }>;
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
 * OfflineFirstHybridRepository:
 * Opera en local (memoria/SQLite) para cero latencia y tolerancia offline,
 * y replica en segundo plano hacia Supabase si hay conectividad.
 */
export declare class OfflineFirstHybridRepository implements IContenedorRepository {
    private localRepo;
    private cloudRepo?;
    private isOnline;
    constructor(localRepo: SQLiteLocalAdapter, cloudRepo?: SupabaseCloudAdapter);
    setCloudAdapter(cloudRepo: SupabaseCloudAdapter): void;
    setOnlineStatus(online: boolean): void;
    getOnlineStatus(): boolean;
    buscarUsuarioPorCodigo(codigo: string): Promise<UsuarioPerfil | null>;
    validarCredenciales(codigo: string, password?: string): Promise<{
        ok: boolean;
        user?: UsuarioPerfil;
        error?: string;
    }>;
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
