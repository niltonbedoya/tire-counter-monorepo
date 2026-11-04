"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityHashMismatchError = void 0;
exports.processReceiptAck = processReceiptAck;
const fsm_1 = require("./fsm");
class SecurityHashMismatchError extends Error {
    expectedHash;
    receivedHash;
    constructor(expectedHash, receivedHash, message) {
        super(message ||
            `Violación de seguridad criptográfica: el hash verificado en ACK (${receivedHash}) no coincide con el hash local del paquete (${expectedHash}). Abortando purga.`);
        this.expectedHash = expectedHash;
        this.receivedHash = receivedHash;
        this.name = 'SecurityHashMismatchError';
    }
}
exports.SecurityHashMismatchError = SecurityHashMismatchError;
async function processReceiptAck(contenedor, paquete, ackToken, purgeCallback) {
    // Coincidencia criptográfica estricta
    if (ackToken.sha256Verificado !== paquete.sha256) {
        throw new SecurityHashMismatchError(paquete.sha256, ackToken.sha256Verificado);
    }
    // 1. Transición intermedia a CONFIRMADO_EN_DESTINO si viene de DESPACHADO_PENDIENTE_ACK
    let c = contenedor;
    if (c.estado === 'DESPACHADO_PENDIENTE_ACK') {
        c = (0, fsm_1.transitionState)(c, 'CONFIRMADO_EN_DESTINO');
    }
    // 2. Ejecutar purga física de fotos locales
    await purgeCallback();
    // 3. Transicionar a PURGADO
    const finalContenedor = (0, fsm_1.transitionState)(c, 'PURGADO');
    finalContenedor.reciboAckToken = JSON.stringify(ackToken);
    return {
        success: true,
        purged: true,
        contenedorActualizado: finalContenedor,
        mensaje: 'ACK verificado exitosamente y fotos locales purgadas.',
    };
}
