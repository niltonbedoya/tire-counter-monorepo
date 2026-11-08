import {
  ProyectoContenedor,
  ItemNeumatico,
  EvidenciaFoto,
  ItemStock,
  UUID,
} from './types';
import { IContenedorRepository, SQLiteLocalAdapter } from './repository';

export interface SupabaseConfig {
  supabaseUrl: string;
  supabaseKey: string;
}

export interface UsuarioPerfil {
  id: string;
  email: string;
  nombre: string;
  rol: 'operario' | 'admin';
  codigo: string;
}

/**
 * SupabaseCloudAdapter: Cliente directo a la nube de Supabase en Seúl
 */
export class SupabaseCloudAdapter implements IContenedorRepository {
  private url: string;
  private key: string;

  constructor(config: SupabaseConfig) {
    this.url = config.supabaseUrl.replace(/\/+$/, '');
    this.key = config.supabaseKey;
  }

  private async fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = {
      'Content-Type': 'application/json',
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      Prefer: 'return=representation',
      ...(options.headers || {}),
    };

    const res = await fetch(`${this.url}/rest/v1/${path}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Supabase API error (${res.status}): ${errText}`);
    }

    if (res.status === 204) {
      return [] as unknown as T;
    }
    return res.json() as Promise<T>;
  }

  async buscarUsuarioPorCodigo(codigo: string): Promise<UsuarioPerfil | null> {
    const clean = codigo.trim().toUpperCase();
    const rows = await this.fetchApi<UsuarioPerfil[]>(
      `perfiles_usuarios?codigo=eq.${encodeURIComponent(clean)}&select=*`
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async validarCredenciales(
    codigo: string,
    password: string
  ): Promise<{ ok: boolean; user?: UsuarioPerfil; error?: string }> {
    const clean = codigo.trim().toUpperCase();
    const email = `${clean.toLowerCase()}@counter.local`;

    try {
      const res = await fetch(`${this.url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          apikey: this.key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data.access_token) {
        return {
          ok: false,
          error: data.msg || data.error_description || 'Código o contraseña incorrectos en Supabase.',
        };
      }

      const user = await this.buscarUsuarioPorCodigo(clean);
      return {
        ok: true,
        user: user || {
          id: data.user?.id || 'uid',
          email,
          nombre: clean,
          rol: clean === 'ADMIN' ? 'admin' : 'operario',
          codigo: clean,
        },
      };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Error de conexión con el servidor de autenticación' };
    }
  }

  async crearContenedor(datos: Omit<ProyectoContenedor, 'createdAt' | 'updatedAt'>): Promise<ProyectoContenedor> {
    const now = new Date().toISOString();
    const payload = {
      id: datos.id,
      tipo: datos.tipoOperacion === 'RECEPCION' ? 'recepcion' : 'despacho',
      estado: datos.estado,
      total_acumulado: datos.totalAcumulado,
      created_at: now,
      updated_at: now,
    };

    await this.fetchApi('lotes', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    });

    return {
      ...datos,
      createdAt: now,
      updatedAt: now,
    };
  }

  async obtenerContenedor(id: UUID): Promise<ProyectoContenedor | null> {
    const rows = await this.fetchApi<any[]>(`lotes?id=eq.${encodeURIComponent(id)}&select=*`);
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      codigoReferencia: r.id,
      tipoOperacion: r.tipo === 'recepcion' ? 'RECEPCION' : 'DESPACHO',
      operarioId: r.operario_id || 'op-001',
      nombreOperarioSnapshot: 'Operario',
      estado: r.estado,
      capacidadObjetivo: null,
      totalAcumulado: r.total_acumulado,
      hashSha256Paquete: r.hash_sha256,
      reciboAckToken: r.ack_token,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  async listarContenedores(): Promise<ProyectoContenedor[]> {
    const rows = await this.fetchApi<any[]>('lotes?select=*&order=created_at.desc');
    return rows.map((r) => ({
      id: r.id,
      codigoReferencia: r.id,
      tipoOperacion: r.tipo === 'recepcion' ? 'RECEPCION' : 'DESPACHO',
      operarioId: r.operario_id || 'op-001',
      nombreOperarioSnapshot: 'Operario',
      estado: r.estado,
      capacidadObjetivo: null,
      totalAcumulado: r.total_acumulado,
      hashSha256Paquete: r.hash_sha256,
      reciboAckToken: r.ack_token,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async actualizarContenedor(id: UUID, patch: Partial<ProyectoContenedor>): Promise<ProyectoContenedor> {
    const body: Record<string, any> = { updated_at: new Date().toISOString() };
    if (patch.estado) body.estado = patch.estado;
    if (patch.totalAcumulado !== undefined) body.total_acumulado = patch.totalAcumulado;
    if (patch.hashSha256Paquete) body.hash_sha256 = patch.hashSha256Paquete;
    if (patch.reciboAckToken) body.ack_token = patch.reciboAckToken;

    await this.fetchApi(`lotes?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });

    const existing = await this.obtenerContenedor(id);
    if (!existing) throw new Error(`Lote no encontrado tras actualizar: ${id}`);
    return existing;
  }

  async guardarItem(item: ItemNeumatico): Promise<ItemNeumatico> {
    if (item.cantidad <= 0) {
      await this.fetchApi(
        `items_lote?lote_id=eq.${encodeURIComponent(item.contenedorId)}&clave_compuesta=eq.${encodeURIComponent(item.claveCompuesta)}`,
        { method: 'DELETE' }
      );
    } else {
      const payload = {
        lote_id: item.contenedorId,
        clave_compuesta: item.claveCompuesta,
        ancho: item.ancho,
        perfil: item.perfil,
        llanta: item.llanta,
        marca: item.marca || 'GENERICA',
        cantidad: item.cantidad,
        updated_at: new Date().toISOString(),
      };

      await this.fetchApi('items_lote', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      });
    }

    return item;
  }

  async obtenerItems(contenedorId: UUID): Promise<ItemNeumatico[]> {
    const rows = await this.fetchApi<any[]>(`items_lote?lote_id=eq.${encodeURIComponent(contenedorId)}&select=*`);
    return rows.map((r) => ({
      id: r.id,
      contenedorId: r.lote_id,
      claveCompuesta: r.clave_compuesta,
      ancho: r.ancho,
      perfil: r.perfil,
      llanta: r.llanta,
      marca: r.marca,
      cantidad: r.cantidad,
      updatedAt: r.updated_at,
    }));
  }

  async guardarFoto(foto: EvidenciaFoto): Promise<EvidenciaFoto> {
    const payload = {
      id: foto.id,
      lote_id: foto.contenedorId,
      storage_path: foto.rutaLocal,
      hash_sha256: foto.sha256Local,
      peso_bytes: foto.pesoBytes,
      ancho_px: foto.dimensionMaxPx,
      alto_px: foto.dimensionMaxPx,
      formato: 'image/webp',
      created_at: foto.timestamp,
    };
    await this.fetchApi('fotos_evidencia', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    });
    return foto;
  }

  async obtenerFotos(contenedorId: UUID): Promise<EvidenciaFoto[]> {
    const rows = await this.fetchApi<any[]>(`fotos_evidencia?lote_id=eq.${encodeURIComponent(contenedorId)}&select=*`);
    return rows.map((r) => ({
      id: r.id,
      contenedorId: r.lote_id,
      rutaLocal: r.storage_path,
      formato: 'image/webp',
      pesoBytes: r.peso_bytes,
      dimensionMaxPx: r.ancho_px,
      sha256Local: r.hash_sha256,
      timestamp: r.created_at,
    }));
  }

  async eliminarFotos(contenedorId: UUID): Promise<number> {
    const existing = await this.obtenerFotos(contenedorId);
    await this.fetchApi(`fotos_evidencia?lote_id=eq.${encodeURIComponent(contenedorId)}`, {
      method: 'DELETE',
    });
    return existing.length;
  }

  async obtenerStockTotal(): Promise<ItemStock[]> {
    const rows = await this.fetchApi<any[]>('inventario_maestro?select=*&order=clave_compuesta.asc');
    return rows.map((r) => ({
      claveCompuesta: r.clave_compuesta,
      ancho: r.ancho,
      perfil: r.perfil,
      llanta: r.llanta,
      marca: r.marca || '',
      cantidadTotal: r.stock_actual,
      updatedAt: r.updated_at,
    }));
  }

  async ingresarStockDesdeLote(loteId: UUID): Promise<number> {
    const items = await this.obtenerItems(loteId);
    let totalIngresado = 0;
    const now = new Date().toISOString();

    for (const it of items) {
      totalIngresado += it.cantidad;
      const rows = await this.fetchApi<any[]>(
        `inventario_maestro?clave_compuesta=eq.${encodeURIComponent(it.claveCompuesta)}&select=*`
      );
      if (rows.length > 0) {
        const nuevoStock = rows[0].stock_actual + it.cantidad;
        await this.fetchApi(
          `inventario_maestro?clave_compuesta=eq.${encodeURIComponent(it.claveCompuesta)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ stock_actual: nuevoStock, updated_at: now }),
          }
        );
      } else {
        await this.fetchApi('inventario_maestro', {
          method: 'POST',
          body: JSON.stringify({
            clave_compuesta: it.claveCompuesta,
            ancho: it.ancho,
            perfil: it.perfil,
            llanta: it.llanta,
            marca: it.marca || 'GENERICA',
            stock_actual: it.cantidad,
            updated_at: now,
          }),
        });
      }
    }
    return totalIngresado;
  }
}

/**
 * OfflineFirstHybridRepository:
 * Opera en local (memoria/SQLite) para cero latencia y tolerancia offline,
 * y replica en segundo plano hacia Supabase si hay conectividad.
 */
export class OfflineFirstHybridRepository implements IContenedorRepository {
  private localRepo: SQLiteLocalAdapter;
  private cloudRepo?: SupabaseCloudAdapter;
  private isOnline = false;

  constructor(localRepo: SQLiteLocalAdapter, cloudRepo?: SupabaseCloudAdapter) {
    this.localRepo = localRepo;
    this.cloudRepo = cloudRepo;
  }

  setCloudAdapter(cloudRepo: SupabaseCloudAdapter) {
    this.cloudRepo = cloudRepo;
  }

  setOnlineStatus(online: boolean) {
    this.isOnline = online;
  }

  getOnlineStatus(): boolean {
    return this.isOnline && !!this.cloudRepo;
  }

  async buscarUsuarioPorCodigo(codigo: string): Promise<UsuarioPerfil | null> {
    if (this.cloudRepo) {
      try {
        const user = await this.cloudRepo.buscarUsuarioPorCodigo(codigo);
        if (user) return user;
      } catch {
        // Fallback offline
      }
    }
    // Fallback estático para modo sin internet
    const clean = codigo.trim().toUpperCase();
    if (clean === 'ADMIN' || clean === 'SUPERVISOR') {
      return {
        id: 'user-admin-local',
        email: 'admin@counter.local',
        nombre: 'Supervisor ADMIN',
        rol: 'admin',
        codigo: 'ADMIN',
      };
    }
    if (clean === '4120' || clean === 'OP-001') {
      return {
        id: 'user-4120-local',
        email: '4120@counter.local',
        nombre: 'Carlos Sanchez (4120)',
        rol: 'operario',
        codigo: '4120',
      };
    }
    return null;
  }

  async validarCredenciales(
    codigo: string,
    password?: string
  ): Promise<{ ok: boolean; user?: UsuarioPerfil; error?: string }> {
    if (this.cloudRepo && password) {
      try {
        const res = await this.cloudRepo.validarCredenciales(codigo, password);
        if (res.ok) return res;
      } catch {
        // Cloud repo unreachable: no offline credentials exist, reject below.
      }
    }

    // Offline mode has no real credentials configured: reject any fallback auth.
    return { ok: false, error: 'Credenciales no configuradas en modo offline' };
  }

  async crearContenedor(datos: Omit<ProyectoContenedor, 'createdAt' | 'updatedAt'>): Promise<ProyectoContenedor> {
    const local = await this.localRepo.crearContenedor(datos);
    if (this.cloudRepo) {
      this.cloudRepo.crearContenedor(datos).catch(() => {});
    }
    return local;
  }

  async obtenerContenedor(id: UUID): Promise<ProyectoContenedor | null> {
    return this.localRepo.obtenerContenedor(id);
  }

  async listarContenedores(): Promise<ProyectoContenedor[]> {
    return this.localRepo.listarContenedores();
  }

  async actualizarContenedor(id: UUID, patch: Partial<ProyectoContenedor>): Promise<ProyectoContenedor> {
    const local = await this.localRepo.actualizarContenedor(id, patch);
    if (this.cloudRepo) {
      this.cloudRepo.actualizarContenedor(id, patch).catch(() => {});
    }
    return local;
  }

  async guardarItem(item: ItemNeumatico): Promise<ItemNeumatico> {
    const local = await this.localRepo.guardarItem(item);
    if (this.cloudRepo) {
      this.cloudRepo.guardarItem(item).catch(() => {});
    }
    return local;
  }

  async obtenerItems(contenedorId: UUID): Promise<ItemNeumatico[]> {
    return this.localRepo.obtenerItems(contenedorId);
  }

  async guardarFoto(foto: EvidenciaFoto): Promise<EvidenciaFoto> {
    const local = await this.localRepo.guardarFoto(foto);
    if (this.cloudRepo) {
      this.cloudRepo.guardarFoto(foto).catch(() => {});
    }
    return local;
  }

  async obtenerFotos(contenedorId: UUID): Promise<EvidenciaFoto[]> {
    return this.localRepo.obtenerFotos(contenedorId);
  }

  async eliminarFotos(contenedorId: UUID): Promise<number> {
    const count = await this.localRepo.eliminarFotos(contenedorId);
    if (this.cloudRepo) {
      this.cloudRepo.eliminarFotos(contenedorId).catch(() => {});
    }
    return count;
  }

  async obtenerStockTotal(): Promise<ItemStock[]> {
    const localStock = await this.localRepo.obtenerStockTotal();
    const stockMap = new Map<string, ItemStock>();

    for (const item of localStock) {
      stockMap.set(item.claveCompuesta, { ...item });
    }

    if (this.cloudRepo) {
      try {
        const cloudStock = await this.cloudRepo.obtenerStockTotal();
        for (const cItem of cloudStock) {
          if (!stockMap.has(cItem.claveCompuesta)) {
            stockMap.set(cItem.claveCompuesta, { ...cItem });
          }
        }
      } catch {
        // Fallback offline
      }
    }

    return Array.from(stockMap.values());
  }

  async ingresarStockDesdeLote(loteId: UUID): Promise<number> {
    const total = await this.localRepo.ingresarStockDesdeLote(loteId);
    if (this.cloudRepo) {
      this.cloudRepo.ingresarStockDesdeLote(loteId).catch(() => {});
    }
    return total;
  }
}
