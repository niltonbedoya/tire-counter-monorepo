import { describe, it, expect, vi } from 'vitest';
import { SQLiteLocalAdapter } from '../src/repository';
import { SupabaseCloudAdapter, OfflineFirstHybridRepository } from '../src/supabase';

describe('Supabase & Offline-First Repository Suite', () => {
  it('OfflineFirstHybridRepository opera en local sin cloud configurado', async () => {
    const local = new SQLiteLocalAdapter();
    const hybrid = new OfflineFirstHybridRepository(local);

    const c = await hybrid.crearContenedor({
      id: 'cnt-test-01',
      codigoReferencia: 'Contenedor Test 01',
      tipoOperacion: 'DESPACHO',
      operarioId: 'op-001',
      nombreOperarioSnapshot: 'Carlos Sanchez (4120)',
      estado: 'ACTIVO',
      capacidadObjetivo: 100,
      totalAcumulado: 0,
    });

    expect(c.id).toBe('cnt-test-01');
    expect(c.estado).toBe('ACTIVO');

    // Autenticación fallback local por código
    const user4120 = await hybrid.buscarUsuarioPorCodigo('4120');
    expect(user4120).not.toBeNull();
    expect(user4120?.rol).toBe('operario');

    const userAdmin = await hybrid.buscarUsuarioPorCodigo('ADMIN');
    expect(userAdmin).not.toBeNull();
    expect(userAdmin?.rol).toBe('admin');
  });

  it('SupabaseCloudAdapter consulta y mapea perfiles correctamente con fetch mockeado', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: 'mock-uuid-4120',
          email: '4120@counter.local',
          nombre: 'Operario 4120',
          rol: 'operario',
          codigo: '4120',
        },
      ],
    });
    vi.stubGlobal('fetch', mockFetch);

    const cloud = new SupabaseCloudAdapter({
      supabaseUrl: 'https://mock.supabase.co',
      supabaseKey: 'mock-key',
    });

    const user = await cloud.buscarUsuarioPorCodigo('4120');
    expect(user).not.toBeNull();
    expect(user?.codigo).toBe('4120');
    expect(user?.rol).toBe('operario');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('perfiles_usuarios?codigo=eq.4120'),
      expect.objectContaining({
        headers: expect.objectContaining({
          apikey: 'mock-key',
        }),
      })
    );

    vi.unstubAllGlobals();
  });
});
