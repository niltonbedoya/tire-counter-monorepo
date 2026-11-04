"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGAL_TRANSITIONS = exports.FSMStateError = void 0;
exports.canTransition = canTransition;
exports.transitionState = transitionState;
exports.assertContainerMutable = assertContainerMutable;
class FSMStateError extends Error {
    currentState;
    requestedAction;
    constructor(currentState, requestedAction, message) {
        super(message ||
            `Operación '${requestedAction}' rechazada: el contenedor se encuentra en estado inmutable '${currentState}'`);
        this.currentState = currentState;
        this.requestedAction = requestedAction;
        this.name = 'FSMStateError';
    }
}
exports.FSMStateError = FSMStateError;
exports.LEGAL_TRANSITIONS = {
    ACTIVO: ['BLOQUEADO_EN_BOVEDA'],
    BLOQUEADO_EN_BOVEDA: ['DESPACHADO_PENDIENTE_ACK'],
    DESPACHADO_PENDIENTE_ACK: ['CONFIRMADO_EN_DESTINO'],
    CONFIRMADO_EN_DESTINO: ['PURGADO'],
    PURGADO: [],
};
function canTransition(from, to) {
    return exports.LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}
function transitionState(contenedor, to) {
    if (!canTransition(contenedor.estado, to)) {
        throw new FSMStateError(contenedor.estado, `transition_to_${to}`, `Transición ilegal de '${contenedor.estado}' a '${to}'`);
    }
    return {
        ...contenedor,
        estado: to,
        updatedAt: new Date().toISOString(),
    };
}
function assertContainerMutable(contenedor, action = 'modificar_inventario') {
    if (contenedor.estado !== 'ACTIVO') {
        throw new FSMStateError(contenedor.estado, action, `No se permite la mutación '${action}': el contenedor está en estado '${contenedor.estado}' (Inmutabilidad de Bóveda activa)`);
    }
}
