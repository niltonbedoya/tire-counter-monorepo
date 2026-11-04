import { EstadoContenedor, ProyectoContenedor } from './types';

export class FSMStateError extends Error {
  constructor(
    public readonly currentState: EstadoContenedor,
    public readonly requestedAction: string,
    message?: string
  ) {
    super(
      message ||
        `Operación '${requestedAction}' rechazada: el contenedor se encuentra en estado inmutable '${currentState}'`
    );
    this.name = 'FSMStateError';
  }
}

export const LEGAL_TRANSITIONS: Record<EstadoContenedor, EstadoContenedor[]> = {
  ACTIVO: ['BLOQUEADO_EN_BOVEDA'],
  BLOQUEADO_EN_BOVEDA: ['DESPACHADO_PENDIENTE_ACK'],
  DESPACHADO_PENDIENTE_ACK: ['CONFIRMADO_EN_DESTINO'],
  CONFIRMADO_EN_DESTINO: ['PURGADO'],
  PURGADO: [],
};

export function canTransition(from: EstadoContenedor, to: EstadoContenedor): boolean {
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

export function transitionState(
  contenedor: ProyectoContenedor,
  to: EstadoContenedor
): ProyectoContenedor {
  if (!canTransition(contenedor.estado, to)) {
    throw new FSMStateError(
      contenedor.estado,
      `transition_to_${to}`,
      `Transición ilegal de '${contenedor.estado}' a '${to}'`
    );
  }

  return {
    ...contenedor,
    estado: to,
    updatedAt: new Date().toISOString(),
  };
}

export function assertContainerMutable(contenedor: ProyectoContenedor, action: string = 'modificar_inventario'): void {
  if (contenedor.estado !== 'ACTIVO') {
    throw new FSMStateError(
      contenedor.estado,
      action,
      `No se permite la mutación '${action}': el contenedor está en estado '${contenedor.estado}' (Inmutabilidad de Bóveda activa)`
    );
  }
}
