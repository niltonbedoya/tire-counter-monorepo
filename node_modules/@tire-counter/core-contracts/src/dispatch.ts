import { ReceiptAckToken, PaqueteDespacho, ProyectoContenedor } from './types';
import { transitionState } from './fsm';

export class SecurityHashMismatchError extends Error {
  constructor(
    public readonly expectedHash: string,
    public readonly receivedHash: string,
    message?: string
  ) {
    super(
      message ||
        `Violación de seguridad criptográfica: el hash verificado en ACK (${receivedHash}) no coincide con el hash local del paquete (${expectedHash}). Abortando purga.`
    );
    this.name = 'SecurityHashMismatchError';
  }
}

export interface DispatchAckResult {
  success: boolean;
  purged: boolean;
  contenedorActualizado: ProyectoContenedor;
  mensaje: string;
}

export async function processReceiptAck(
  contenedor: ProyectoContenedor,
  paquete: PaqueteDespacho,
  ackToken: ReceiptAckToken,
  purgeCallback: () => Promise<void> | void
): Promise<DispatchAckResult> {
  // Coincidencia criptográfica estricta
  if (ackToken.sha256Verificado !== paquete.sha256) {
    throw new SecurityHashMismatchError(
      paquete.sha256,
      ackToken.sha256Verificado
    );
  }

  // 1. Transición intermedia a CONFIRMADO_EN_DESTINO si viene de DESPACHADO_PENDIENTE_ACK
  let c = contenedor;
  if (c.estado === 'DESPACHADO_PENDIENTE_ACK') {
    c = transitionState(c, 'CONFIRMADO_EN_DESTINO');
  }

  // 2. Ejecutar purga física de fotos locales
  await purgeCallback();

  // 3. Transicionar a PURGADO
  const finalContenedor = transitionState(c, 'PURGADO');
  finalContenedor.reciboAckToken = JSON.stringify(ackToken);

  return {
    success: true,
    purged: true,
    contenedorActualizado: finalContenedor,
    mensaje: 'ACK verificado exitosamente y fotos locales purgadas.',
  };
}
