"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OfflineFirstHybridRepository = exports.SupabaseCloudAdapter = void 0;
/**
 * SupabaseCloudAdapter: Cliente directo a la nube de Supabase en Seúl
 */
class SupabaseCloudAdapter {
    url;
    key;
    constructor(config) {
        this.url = config.supabaseUrl.replace(/\/+$/, '');
        this.key = config.supabaseKey;
    }
    async fetchApi(path, options = {}) {
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
            return [];
        }
        return res.json();
    }
    async buscarUsuarioPorCodigo(codigo) {
        const clean = codigo.trim().toUpperCase();
        const rows = await this.fetchApi(`perfiles_usuarios?codigo=eq.${encodeURIComponent(clean)}&select=*`);
        return rows.length > 0 ? rows[0] : null;
    }
    async validarCredenciales(codigo, password) {
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
            const data = (await res.json().catch(() => ({})));
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
        }
        catch (err) {
            return { ok: false, error: err.message || 'Error de conexión con el servidor de autenticación' };
        }
    }
    async crearContenedor(datos) {
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
    async obtenerContenedor(id) {
        const rows = await this.fetchApi(`lotes?id=eq.${encodeURIComponent(id)}&select=*`);
        if (!rows.length)
            return null;
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
    async listarContenedores() {
        const rows = await this.fetchApi('lotes?select=*&order=created_at.desc');
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
    async actualizarContenedor(id, patch) {
        const body = { updated_at: new Date().toISOString() };
        if (patch.estado)
            body.estado = patch.estado;
        if (patch.totalAcumulado !== undefined)
            body.total_acumulado = patch.totalAcumulado;
        if (patch.hashSha256Paquete)
            body.hash_sha256 = patch.hashSha256Paquete;
        if (patch.reciboAckToken)
            body.ack_token = patch.reciboAckToken;
        await this.fetchApi(`lotes?id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify(body),
        });
        const existing = await this.obtenerContenedor(id);
        if (!existing)
            throw new Error(`Lote no encontrado tras actualizar: ${id}`);
        return existing;
    }
    async guardarItem(item) {
        if (item.cantidad <= 0) {
            await this.fetchApi(`items_lote?lote_id=eq.${encodeURIComponent(item.contenedorId)}&clave_compuesta=eq.${encodeURIComponent(item.claveCompuesta)}`, { method: 'DELETE' });
        }
        else {
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
    async obtenerItems(contenedorId) {
        const rows = await this.fetchApi(`items_lote?lote_id=eq.${encodeURIComponent(contenedorId)}&select=*`);
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
    async guardarFoto(foto) {
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
    async obtenerFotos(contenedorId) {
        const rows = await this.fetchApi(`fotos_evidencia?lote_id=eq.${encodeURIComponent(contenedorId)}&select=*`);
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
    async eliminarFotos(contenedorId) {
        const existing = await this.obtenerFotos(contenedorId);
        await this.fetchApi(`fotos_evidencia?lote_id=eq.${encodeURIComponent(contenedorId)}`, {
            method: 'DELETE',
        });
        return existing.length;
    }
    async obtenerStockTotal() {
        const rows = await this.fetchApi('inventario_maestro?select=*&order=clave_compuesta.asc');
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
    async ingresarStockDesdeLote(loteId) {
        const items = await this.obtenerItems(loteId);
        let totalIngresado = 0;
        const now = new Date().toISOString();
        for (const it of items) {
            totalIngresado += it.cantidad;
            const rows = await this.fetchApi(`inventario_maestro?clave_compuesta=eq.${encodeURIComponent(it.claveCompuesta)}&select=*`);
            if (rows.length > 0) {
                const nuevoStock = rows[0].stock_actual + it.cantidad;
                await this.fetchApi(`inventario_maestro?clave_compuesta=eq.${encodeURIComponent(it.claveCompuesta)}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ stock_actual: nuevoStock, updated_at: now }),
                });
            }
            else {
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
exports.SupabaseCloudAdapter = SupabaseCloudAdapter;
/**
 * OfflineFirstHybridRepository:
 * Opera en local (memoria/SQLite) para cero latencia y tolerancia offline,
 * y replica en segundo plano hacia Supabase si hay conectividad.
 */
class OfflineFirstHybridRepository {
    localRepo;
    cloudRepo;
    isOnline = false;
    constructor(localRepo, cloudRepo) {
        this.localRepo = localRepo;
        this.cloudRepo = cloudRepo;
    }
    setCloudAdapter(cloudRepo) {
        this.cloudRepo = cloudRepo;
    }
    setOnlineStatus(online) {
        this.isOnline = online;
    }
    getOnlineStatus() {
        return this.isOnline && !!this.cloudRepo;
    }
    async buscarUsuarioPorCodigo(codigo) {
        if (this.cloudRepo) {
            try {
                const user = await this.cloudRepo.buscarUsuarioPorCodigo(codigo);
                if (user)
                    return user;
            }
            catch {
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
    async validarCredenciales(codigo, password) {
        if (this.cloudRepo && password) {
            const res = await this.cloudRepo.validarCredenciales(codigo, password);
            if (res.ok)
                return res;
            // Si la nube responde error de credenciales explícito, no dejar entrar
            if (res.error && !res.error.includes('conexión') && !res.error.includes('fetch')) {
                return res;
            }
        }
        // Fallback offline si el servidor está inaccesible o es test
        const clean = codigo.trim().toUpperCase();
        if (clean === 'ADMIN' || clean === 'SUPERVISOR') {
            return {
                ok: true,
                user: {
                    id: 'user-admin-local',
                    email: 'admin@counter.local',
                    nombre: 'Supervisor ADMIN',
                    rol: 'admin',
                    codigo: 'ADMIN',
                },
            };
        }
        if (clean === '4120' || clean === 'OP-001') {
            return {
                ok: true,
                user: {
                    id: 'user-4120-local',
                    email: '4120@counter.local',
                    nombre: 'Carlos Sanchez (4120)',
                    rol: 'operario',
                    codigo: '4120',
                },
            };
        }
        return { ok: false, error: 'Código de usuario no reconocido' };
    }
    async crearContenedor(datos) {
        const local = await this.localRepo.crearContenedor(datos);
        if (this.cloudRepo) {
            this.cloudRepo.crearContenedor(datos).catch(() => { });
        }
        return local;
    }
    async obtenerContenedor(id) {
        return this.localRepo.obtenerContenedor(id);
    }
    async listarContenedores() {
        return this.localRepo.listarContenedores();
    }
    async actualizarContenedor(id, patch) {
        const local = await this.localRepo.actualizarContenedor(id, patch);
        if (this.cloudRepo) {
            this.cloudRepo.actualizarContenedor(id, patch).catch(() => { });
        }
        return local;
    }
    async guardarItem(item) {
        const local = await this.localRepo.guardarItem(item);
        if (this.cloudRepo) {
            this.cloudRepo.guardarItem(item).catch(() => { });
        }
        return local;
    }
    async obtenerItems(contenedorId) {
        return this.localRepo.obtenerItems(contenedorId);
    }
    async guardarFoto(foto) {
        const local = await this.localRepo.guardarFoto(foto);
        if (this.cloudRepo) {
            this.cloudRepo.guardarFoto(foto).catch(() => { });
        }
        return local;
    }
    async obtenerFotos(contenedorId) {
        return this.localRepo.obtenerFotos(contenedorId);
    }
    async eliminarFotos(contenedorId) {
        const count = await this.localRepo.eliminarFotos(contenedorId);
        if (this.cloudRepo) {
            this.cloudRepo.eliminarFotos(contenedorId).catch(() => { });
        }
        return count;
    }
    async obtenerStockTotal() {
        const localStock = await this.localRepo.obtenerStockTotal();
        const stockMap = new Map();
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
            }
            catch {
                // Fallback offline
            }
        }
        return Array.from(stockMap.values());
    }
    async ingresarStockDesdeLote(loteId) {
        const total = await this.localRepo.ingresarStockDesdeLote(loteId);
        if (this.cloudRepo) {
            this.cloudRepo.ingresarStockDesdeLote(loteId).catch(() => { });
        }
        return total;
    }
}
exports.OfflineFirstHybridRepository = OfflineFirstHybridRepository;
