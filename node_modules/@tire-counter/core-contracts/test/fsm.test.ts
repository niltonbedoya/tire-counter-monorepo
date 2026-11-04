import { describe, it, expect } from 'vitest';
import { transitionState, assertContainerMutable, FSMStateError } from '../src/fsm';
import { ProyectoContenedor } from '../src/types';

describe('FSM and Inmutability Post-Dispatch Tests', () => {
  const baseContenedor: ProyectoContenedor = {
    id: 'cnt-100',
    codigoReferencia: 'Contenedor 203248',
    operarioId: 'op-001',
    nombreOperarioSnapshot: 'Carlos Sanchez',
    estado: 'ACTIVO',
    capacidadObjetivo: 2000,
    totalAcumulado: 450,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('test_fsm_immutability_post_dispatch: should reject inventory modification once in BLOQUEADO_EN_BOVEDA', () => {
    const locked = transitionState(baseContenedor, 'BLOQUEADO_EN_BOVEDA');
    expect(locked.estado).toBe('BLOQUEADO_EN_BOVEDA');

    expect(() => {
      assertContainerMutable(locked, 'agregar_neumaticos');
    }).toThrow(FSMStateError);
  });

  it('should reject inventory modification in DESPACHADO_PENDIENTE_ACK, CONFIRMADO_EN_DESTINO, and PURGADO', () => {
    const s1 = transitionState(baseContenedor, 'BLOQUEADO_EN_BOVEDA');
    const s2 = transitionState(s1, 'DESPACHADO_PENDIENTE_ACK');
    expect(() => assertContainerMutable(s2, 'agregar_neumaticos')).toThrow(FSMStateError);

    const s3 = transitionState(s2, 'CONFIRMADO_EN_DESTINO');
    expect(() => assertContainerMutable(s3, 'agregar_neumaticos')).toThrow(FSMStateError);

    const s4 = transitionState(s3, 'PURGADO');
    expect(() => assertContainerMutable(s4, 'agregar_neumaticos')).toThrow(FSMStateError);
  });

  it('should reject illegal FSM transitions (e.g., ACTIVO directly to PURGADO)', () => {
    expect(() => {
      transitionState(baseContenedor, 'PURGADO');
    }).toThrow(FSMStateError);
  });
});
