import { EstadoContenedor, ProyectoContenedor } from './types';
export declare class FSMStateError extends Error {
    readonly currentState: EstadoContenedor;
    readonly requestedAction: string;
    constructor(currentState: EstadoContenedor, requestedAction: string, message?: string);
}
export declare const LEGAL_TRANSITIONS: Record<EstadoContenedor, EstadoContenedor[]>;
export declare function canTransition(from: EstadoContenedor, to: EstadoContenedor): boolean;
export declare function transitionState(contenedor: ProyectoContenedor, to: EstadoContenedor): ProyectoContenedor;
export declare function assertContainerMutable(contenedor: ProyectoContenedor, action?: string): void;
