import { ProyectoContenedor, ItemNeumatico, EstadoContenedor } from '@tire-counter/core-contracts';
export interface SQLiteMockState {
    tables: Record<string, string[]>;
    containers: Map<string, ProyectoContenedor>;
    items: Map<string, ItemNeumatico[]>;
    history: Array<{
        timestamp: string;
        action: string;
        details: any;
    }>;
}
export declare function createMockSQLiteState(): SQLiteMockState;
export declare function inspectSchema(state: SQLiteMockState): {
    tables: string[];
    schema: Record<string, string[]>;
    constraints: string[];
};
export declare function queryContainerState(state: SQLiteMockState, containerId: string): {
    found: boolean;
    error: string;
    container?: undefined;
    itemsCount?: undefined;
    totalCalculado?: undefined;
    totalPersistido?: undefined;
    isConsistent?: undefined;
    items?: undefined;
} | {
    found: boolean;
    container: ProyectoContenedor;
    itemsCount: number;
    totalCalculado: number;
    totalPersistido: number;
    isConsistent: boolean;
    items: ItemNeumatico[];
    error?: undefined;
};
export declare function verifyVaultIsolation(container: ProyectoContenedor): {
    isIsolated: boolean;
    canMutate: boolean;
    status: EstadoContenedor;
    reason: string;
};
