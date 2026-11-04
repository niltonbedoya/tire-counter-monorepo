"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpLanClientAdapter = exports.SQLiteLocalAdapter = void 0;
/**
 * SQLite Local Adapter: Simula la persistencia local transaccional SQLite
 */
class SQLiteLocalAdapter {
    contenedores = new Map();
    items = new Map();
    fotos = new Map();
    stock = new Map();
    async crearContenedor(datos) {
        const now = new Date().toISOString();
        const c = {
            ...datos,
            createdAt: now,
            updatedAt: now,
        };
        this.contenedores.set(c.id, c);
        return { ...c };
    }
    async obtenerContenedor(id) {
        const c = this.contenedores.get(id);
        return c ? { ...c } : null;
    }
    async listarContenedores() {
        return Array.from(this.contenedores.values()).map((c) => ({ ...c }));
    }
    async actualizarContenedor(id, patch) {
        const existing = this.contenedores.get(id);
        if (!existing)
            throw new Error(`Contenedor no encontrado: ${id}`);
        const updated = {
            ...existing,
            ...patch,
            updatedAt: new Date().toISOString(),
        };
        this.contenedores.set(id, updated);
        return { ...updated };
    }
    async guardarItem(item) {
        const list = this.items.get(item.contenedorId) || [];
        const idx = list.findIndex((i) => i.id === item.id || i.claveCompuesta === item.claveCompuesta);
        if (item.cantidad <= 0) {
            if (idx >= 0) {
                list.splice(idx, 1);
            }
        }
        else if (idx >= 0) {
            list[idx] = { ...item };
        }
        else {
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
    async obtenerItems(contenedorId) {
        return (this.items.get(contenedorId) || []).map((i) => ({ ...i }));
    }
    async guardarFoto(foto) {
        const list = this.fotos.get(foto.contenedorId) || [];
        list.push({ ...foto });
        this.fotos.set(foto.contenedorId, list);
        return { ...foto };
    }
    async obtenerFotos(contenedorId) {
        return (this.fotos.get(contenedorId) || []).map((f) => ({ ...f }));
    }
    async eliminarFotos(contenedorId) {
        const count = (this.fotos.get(contenedorId) || []).length;
        this.fotos.set(contenedorId, []);
        return count;
    }
    async obtenerStockTotal() {
        return Array.from(this.stock.values()).map((s) => ({ ...s }));
    }
    async ingresarStockDesdeLote(loteId) {
        const items = this.items.get(loteId) || [];
        let sumIngresado = 0;
        const now = new Date().toISOString();
        for (const it of items) {
            const existing = this.stock.get(it.claveCompuesta);
            if (existing) {
                existing.cantidadTotal += it.cantidad;
                existing.updatedAt = now;
            }
            else {
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
exports.SQLiteLocalAdapter = SQLiteLocalAdapter;
/**
 * HTTP LAN Client Adapter: Enruta las llamadas a un backend servidor LAN
 */
class HttpLanClientAdapter {
    remoteEndpointMock;
    constructor(remoteEndpointMock) {
        this.remoteEndpointMock = remoteEndpointMock;
    }
    async crearContenedor(datos) {
        return this.remoteEndpointMock.crearContenedor(datos);
    }
    async obtenerContenedor(id) {
        return this.remoteEndpointMock.obtenerContenedor(id);
    }
    async listarContenedores() {
        return this.remoteEndpointMock.listarContenedores();
    }
    async actualizarContenedor(id, patch) {
        return this.remoteEndpointMock.actualizarContenedor(id, patch);
    }
    async guardarItem(item) {
        return this.remoteEndpointMock.guardarItem(item);
    }
    async obtenerItems(contenedorId) {
        return this.remoteEndpointMock.obtenerItems(contenedorId);
    }
    async guardarFoto(foto) {
        return this.remoteEndpointMock.guardarFoto(foto);
    }
    async obtenerFotos(contenedorId) {
        return this.remoteEndpointMock.obtenerFotos(contenedorId);
    }
    async eliminarFotos(contenedorId) {
        return this.remoteEndpointMock.eliminarFotos(contenedorId);
    }
    async obtenerStockTotal() {
        return this.remoteEndpointMock.obtenerStockTotal();
    }
    async ingresarStockDesdeLote(loteId) {
        return this.remoteEndpointMock.ingresarStockDesdeLote(loteId);
    }
}
exports.HttpLanClientAdapter = HttpLanClientAdapter;
