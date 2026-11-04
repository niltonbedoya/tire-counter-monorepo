import { describe, it, expect, vi } from 'vitest';
import { processReceiptAck, SecurityHashMismatchError } from '../src/dispatch';
import { ProyectoContenedor, PaqueteDespacho, ReceiptAckToken } from '../src/types';

describe('Dispatch Coordinator Subagent - Handshake & Purge Tests', () => {
  const contenedorDespachado: ProyectoContenedor = {
    id: 'cnt-dispatch-01',
    codigoReferencia: 'Contenedor 998877',
    operarioId: 'op-001',
    nombreOperarioSnapshot: 'Elena Rostova',
    estado: 'DESPACHADO_PENDIENTE_ACK',
    totalAcumulado: 1200,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const paqueteLocal: PaqueteDespacho = {
    loteId: 'cnt-dispatch-01',
    archivoNombre: 'despacho-998877.zip',
    bufferZip: new Uint8Array([1, 2, 3, 4]),
    sha256: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
    fotosCount: 12,
    totalNeumaticos: 1200,
    timestamp: new Date().toISOString(),
  };

  it('test_dispatch_coordinator_ack_handshake_success: when ACK hash matches local hash H1, container transitions to PURGADO and purge callback is executed', async () => {
    const purgeCallback = vi.fn().mockResolvedValue(undefined);

    const validAck: ReceiptAckToken = {
      loteId: 'cnt-dispatch-01',
      sha256Verificado: paqueteLocal.sha256, // Same H1
      status: 'VERIFIED',
      timestamp: new Date().toISOString(),
      validadorId: 'supervisor-007',
      signature: 'valid-crypto-sig-abc-123456789',
    };

    const result = await processReceiptAck(
      contenedorDespachado,
      paqueteLocal,
      validAck,
      purgeCallback
    );

    expect(result.success).toBe(true);
    expect(result.purged).toBe(true);
    expect(purgeCallback).toHaveBeenCalledTimes(1);
    expect(result.contenedorActualizado.estado).toBe('PURGADO');
    expect(result.contenedorActualizado.reciboAckToken).toBeTruthy();
  });

  it('test_dispatch_coordinator_ack_rejection_on_mismatch: when ACK hash H2 does not match local hash H1, aborts purge and raises SecurityHashMismatchError', async () => {
    const purgeCallback = vi.fn().mockResolvedValue(undefined);

    const forgedAck: ReceiptAckToken = {
      loteId: 'cnt-dispatch-01',
      sha256Verificado: 'b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0a', // Mismatched H2
      status: 'VERIFIED',
      timestamp: new Date().toISOString(),
      validadorId: 'supervisor-007',
      signature: 'some-signature-987654321',
    };

    await expect(
      processReceiptAck(contenedorDespachado, paqueteLocal, forgedAck, purgeCallback)
    ).rejects.toThrow(SecurityHashMismatchError);

    // Physical purge callback must NEVER be called if hash does not match
    expect(purgeCallback).not.toHaveBeenCalled();
    expect(contenedorDespachado.estado).toBe('DESPACHADO_PENDIENTE_ACK');
  });
});
