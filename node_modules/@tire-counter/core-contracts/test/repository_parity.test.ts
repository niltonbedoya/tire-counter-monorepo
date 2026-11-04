import { describe, it, expect, beforeEach } from 'vitest';
import {
  IContenedorRepository,
  SQLiteLocalAdapter,
  HttpLanClientAdapter,
  ItemNeumatico,
  EvidenciaFoto,
} from '../src/index';

function runRepositoryTestSuite(adapterFactory: () => IContenedorRepository, suiteName: string) {
  describe(`Repository Parity Suite - ${suiteName}`, () => {
    let repo: IContenedorRepository;
    const cid = 'cnt-repo-test-01';

    beforeEach(async () => {
      repo = adapterFactory();
      await repo.crearContenedor({
        id: cid,
        codigoReferencia: 'Contenedor Parity Test',
        operarioId: 'op-01',
        nombreOperarioSnapshot: 'Test Operator',
        estado: 'ACTIVO',
        totalAcumulado: 0,
      });
    });

    it('should create and retrieve a container', async () => {
      const container = await repo.obtenerContenedor(cid);
      expect(container).not.toBeNull();
      expect(container?.codigoReferencia).toBe('Contenedor Parity Test');
      expect(container?.estado).toBe('ACTIVO');
    });

    it('should save items and automatically reflect consolidated total', async () => {
      const item1: ItemNeumatico = {
        id: 'i-1',
        contenedorId: cid,
        llanta: 16,
        ancho: 205,
        perfil: 55,
        marca: '',
        claveCompuesta: '205/55R16--GENERICA',
        cantidad: 4,
        updatedAt: new Date().toISOString(),
      };
      await repo.guardarItem(item1);

      const items = await repo.obtenerItems(cid);
      expect(items).toHaveLength(1);
      expect(items[0].cantidad).toBe(4);

      const container = await repo.obtenerContenedor(cid);
      expect(container?.totalAcumulado).toBe(4);
    });

    it('should save photos and purge them accurately', async () => {
      const foto: EvidenciaFoto = {
        id: 'f-1',
        contenedorId: cid,
        rutaLocal: 'vault/photo1.webp',
        formato: 'image/webp',
        dimensionMaxPx: 1280,
        pesoBytes: 120000,
        sha256Local: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        timestamp: new Date().toISOString(),
      };
      await repo.guardarFoto(foto);

      const fotos = await repo.obtenerFotos(cid);
      expect(fotos).toHaveLength(1);

      const purgedCount = await repo.eliminarFotos(cid);
      expect(purgedCount).toBe(1);

      const fotosAfter = await repo.obtenerFotos(cid);
      expect(fotosAfter).toHaveLength(0);
    });

    it('should ingest stock from reception lot and retrieve consolidated inventory', async () => {
      const itemRec: ItemNeumatico = {
        id: 'i-rec-1',
        contenedorId: cid,
        llanta: 17,
        ancho: 225,
        perfil: 45,
        marca: '',
        claveCompuesta: '225/45R17--GENERICA',
        cantidad: 10,
        updatedAt: new Date().toISOString(),
      };
      await repo.guardarItem(itemRec);

      const sumIngresado = await repo.ingresarStockDesdeLote(cid);
      expect(sumIngresado).toBe(10);

      const stock = await repo.obtenerStockTotal();
      expect(stock).toHaveLength(1);
      expect(stock[0].claveCompuesta).toBe('225/45R17--GENERICA');
      expect(stock[0].cantidadTotal).toBe(10);
    });
  });
}

describe('test_repository_adapter_parity: Exact behavioral parity between SQLiteLocalAdapter and HttpLanClientAdapter', () => {
  // Test 1: SQLiteLocalAdapter
  runRepositoryTestSuite(() => new SQLiteLocalAdapter(), 'SQLiteLocalAdapter');

  // Test 2: HttpLanClientAdapter (pointing to backend instance)
  runRepositoryTestSuite(() => {
    const backendSQLite = new SQLiteLocalAdapter();
    return new HttpLanClientAdapter(backendSQLite);
  }, 'HttpLanClientAdapter');
});
