import { describe, it, expect } from 'vitest';
import { aggregateItem } from '../src/aggregator';
import { ItemNeumatico } from '../src/types';

describe('Aggregator Subagent - TDD Unit Tests', () => {
  it('test_aggregator_consolidation_single_line: should consolidate multiple deltas (+2, +5, -1) for 205/55R16 into a single item with quantity 6', () => {
    let items: ItemNeumatico[] = [];
    const contenedorId = 'cnt-uuid-001';

    // Delta 1: +2
    const res1 = aggregateItem(items, {
      contenedorId,
      llanta: 16,
      ancho: 205,
      perfil: 55,
      marca: '',
      deltaCantidad: 2,
    });
    items = res1.items;

    // Delta 2: +5
    const res2 = aggregateItem(items, {
      contenedorId,
      llanta: 16,
      ancho: 205,
      perfil: 55,
      marca: '',
      deltaCantidad: 5,
    });
    items = res2.items;

    // Delta 3: -1
    const res3 = aggregateItem(items, {
      contenedorId,
      llanta: 16,
      ancho: 205,
      perfil: 55,
      marca: '',
      deltaCantidad: -1,
    });
    items = res3.items;

    expect(items).toHaveLength(1);
    expect(items[0].claveCompuesta).toBe('205/55R16--GENERICA');
    expect(items[0].cantidad).toBe(6);
    expect(res3.totalAcumulado).toBe(6);
  });

  it('test_aggregator_mark_module_toggle: when moduloMarcaActivo is false, marca should default to GENERICA and aggregate together', () => {
    let items: ItemNeumatico[] = [];
    const contenedorId = 'cnt-uuid-002';

    // Add with brand Michelin, but module is inactive
    const res1 = aggregateItem(items, {
      contenedorId,
      llanta: 15,
      ancho: 195,
      perfil: 65,
      marca: 'Michelin',
      deltaCantidad: 4,
      moduloMarcaActivo: false,
    });
    items = res1.items;

    // Add with brand Pirelli, module is inactive
    const res2 = aggregateItem(items, {
      contenedorId,
      llanta: 15,
      ancho: 195,
      perfil: 65,
      marca: 'Pirelli',
      deltaCantidad: 2,
      moduloMarcaActivo: false,
    });
    items = res2.items;

    expect(items).toHaveLength(1);
    expect(items[0].claveCompuesta).toBe('195/65R15--GENERICA');
    expect(items[0].cantidad).toBe(6);
    expect(res2.totalAcumulado).toBe(6);
  });
});
