import { ProyectoContenedor, ItemNeumatico, EvidenciaFoto, EstadoContenedor, UUID, ItemStock } from './types';

export interface IContenedorRepository {
  crearContenedor(datos: Omit<ProyectoContenedor, 'createdAt' | 'updatedAt'>): Promise<ProyectoContenedor>;
  obtenerContenedor(id: UUID): Promise<ProyectoContenedor | null>;
  listarContenedores(): Promise<ProyectoContenedor[]>;
  actualizarContenedor(id: UUID, patch: Partial<ProyectoContenedor>): Promise<ProyectoContenedor>;
  guardarItem(item: ItemNeumatico): Promise<ItemNeumatico>;
  obtenerItems(contenedorId: UUID): Promise<ItemNeumatico[]>;
  guardarFoto(foto: EvidenciaFoto): Promise<EvidenciaFoto>;
  obtenerFotos(contenedorId: UUID): Promise<EvidenciaFoto[]>;
  eliminarFotos(contenedorId: UUID): Promise<number>;
  obtenerStockTotal(): Promise<ItemStock[]>;
  ingresarStockDesdeLote(loteId: UUID): Promise<number>;
}

/**
 * SQLite Local Adapter: Simula la persistencia local transaccional SQLite
 */
export class SQLiteLocalAdapter implements IContenedorRepository {
  private contenedores = new Map<UUID, ProyectoContenedor>();
  private items = new Map<UUID, ItemNeumatico[]>();
  private fotos = new Map<UUID, EvidenciaFoto[]>();
  private stock = new Map<string, ItemStock>();

  async crearContenedor(datos: Omit<ProyectoContenedor, 'createdAt' | 'updatedAt'>): Promise<ProyectoContenedor> {
    const now = new Date().toISOString();
    const c: ProyectoContenedor = {
      ...datos,
      createdAt: now,
      updatedAt: now,
    };
    this.contenedores.set(c.id, c);
    return { ...c };
  }

  async obtenerContenedor(id: UUID): Promise<ProyectoContenedor | null> {
    const c = this.contenedores.get(id);
    return c ? { ...c } : null;
  }

  async listarContenedores(): Promise<ProyectoContenedor[]> {
    return Array.from(this.contenedores.values()).map((c) => ({ ...c }));
  }

  async actualizarContenedor(id: UUID, patch: Partial<ProyectoContenedor>): Promise<ProyectoContenedor> {
    const existing = this.contenedores.get(id);
    if (!existing) throw new Error(`Contenedor no encontrado: ${id}`);
    const updated: ProyectoContenedor = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.contenedores.set(id, updated);
    return { ...updated };
  }

  async guardarItem(item: ItemNeumatico): Promise<ItemNeumatico> {
    const list = this.items.get(item.contenedorId) || [];
    const idx = list.findIndex((i) => i.id === item.id || i.claveCompuesta === item.claveCompuesta);
    if (item.cantidad <= 0) {
      if (idx >= 0) {
        list.splice(idx, 1);
      }
    } else if (idx >= 0) {
      list[idx] = { ...item };
    } else {
      list.push({ ...item });
    }
    this.items.set(item.contenedorId, list);

    // Recalcular total acumulado en contenedor
    const container = this.contenedores.get(item.contenedorId);
    if (container) {
      container.totalAcumulado = list.reduce((sum, i) => sum + i.cantidad, 0);
      container.updatedAt = new Date().toISOString();
    }
    return { ...item };
  }

  async obtenerItems(contenedorId: UUID): Promise<ItemNeumatico[]> {
    return (this.items.get(contenedorId) || []).map((i) => ({ ...i }));
  }

  async guardarFoto(foto: EvidenciaFoto): Promise<EvidenciaFoto> {
    const list = this.fotos.get(foto.contenedorId) || [];
    list.push({ ...foto });
    this.fotos.set(foto.contenedorId, list);
    return { ...foto };
  }

  async obtenerFotos(contenedorId: UUID): Promise<EvidenciaFoto[]> {
    return (this.fotos.get(contenedorId) || []).map((f) => ({ ...f }));
  }

  async eliminarFotos(contenedorId: UUID): Promise<number> {
    const count = (this.fotos.get(contenedorId) || []).length;
    this.fotos.set(contenedorId, []);
    return count;
  }

  async obtenerStockTotal(): Promise<ItemStock[]> {
    return Array.from(this.stock.values()).map((s) => ({ ...s }));
  }

  async ingresarStockDesdeLote(loteId: UUID): Promise<number> {
    const items = this.items.get(loteId) || [];
    let sumIngresado = 0;
    const now = new Date().toISOString();

    for (const it of items) {
      const existing = this.stock.get(it.claveCompuesta);
      if (existing) {
        existing.cantidadTotal += it.cantidad;
        existing.updatedAt = now;
      } else {
        this.stock.set(it.claveCompuesta, {
          claveCompuesta: it.claveCompuesta,
          ancho: it.ancho,
          perfil: it.perfil,
          llanta: it.llanta,
          marca: it.marca || '',
          cantidadTotal: it.cantidad,
          updatedAt: now,
        });
      }
      sumIngresado += it.cantidad;
    }
    return sumIngresado;
  }
}

/**
 * HTTP LAN Client Adapter: Enruta las llamadas a un backend servidor LAN
 */
export class HttpLanClientAdapter implements IContenedorRepository {
  constructor(private readonly remoteEndpointMock: IContenedorRepository) {}

  async crearContenedor(datos: Omit<ProyectoContenedor, 'createdAt' | 'updatedAt'>): Promise<ProyectoContenedor> {
    return this.remoteEndpointMock.crearContenedor(datos);
  }

  async obtenerContenedor(id: UUID): Promise<ProyectoContenedor | null> {
    return this.remoteEndpointMock.obtenerContenedor(id);
  }

  async listarContenedores(): Promise<ProyectoContenedor[]> {
    return this.remoteEndpointMock.listarContenedores();
  }

  async actualizarContenedor(id: UUID, patch: Partial<ProyectoContenedor>): Promise<ProyectoContenedor> {
    return this.remoteEndpointMock.actualizarContenedor(id, patch);
  }

  async guardarItem(item: ItemNeumatico): Promise<ItemNeumatico> {
    return this.remoteEndpointMock.guardarItem(item);
  }

  async obtenerItems(contenedorId: UUID): Promise<ItemNeumatico[]> {
    return this.remoteEndpointMock.obtenerItems(contenedorId);
  }

  async guardarFoto(foto: EvidenciaFoto): Promise<EvidenciaFoto> {
    return this.remoteEndpointMock.guardarFoto(foto);
  }

  async obtenerFotos(contenedorId: UUID): Promise<EvidenciaFoto[]> {
    return this.remoteEndpointMock.obtenerFotos(contenedorId);
  }

  async eliminarFotos(contenedorId: UUID): Promise<number> {
    return this.remoteEndpointMock.eliminarFotos(contenedorId);
  }

  async obtenerStockTotal(): Promise<ItemStock[]> {
    return this.remoteEndpointMock.obtenerStockTotal();
  }

  async ingresarStockDesdeLote(loteId: UUID): Promise<number> {
    return this.remoteEndpointMock.ingresarStockDesdeLote(loteId);
  }
}
