"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeCompositeKey = computeCompositeKey;
exports.aggregateItem = aggregateItem;
const node_crypto_1 = __importDefault(require("node:crypto"));
function computeCompositeKey(ancho, perfil, llanta, marca, moduloMarcaActivo = true) {
    const brand = moduloMarcaActivo && marca && marca.trim() !== '' ? marca.trim() : 'GENERICA';
    return `${ancho}/${perfil}R${llanta}--${brand}`;
}
function aggregateItem(existingItems, input) {
    const { contenedorId, llanta, ancho, perfil, marca, deltaCantidad, moduloMarcaActivo = true, } = input;
    const brand = moduloMarcaActivo && marca && marca.trim() !== '' ? marca.trim() : '';
    const claveCompuesta = computeCompositeKey(ancho, perfil, llanta, marca, moduloMarcaActivo);
    const now = new Date().toISOString();
    const items = [...existingItems];
    const index = items.findIndex((i) => i.contenedorId === contenedorId && i.claveCompuesta === claveCompuesta);
    let targetItem;
    if (index >= 0) {
        const existing = items[index];
        const newQty = existing.cantidad + deltaCantidad;
        if (newQty < 1) {
            // Remove item if depleted to 0 or below
            items.splice(index, 1);
            targetItem = {
                ...existing,
                cantidad: 0,
                updatedAt: now,
            };
        }
        else {
            targetItem = {
                ...existing,
                cantidad: newQty,
                updatedAt: now,
            };
            items[index] = targetItem;
        }
    }
    else {
        if (deltaCantidad < 1) {
            throw new Error(`No se puede inicializar un item con cantidad menor a 1 (recibido: ${deltaCantidad})`);
        }
        targetItem = {
            id: node_crypto_1.default.randomUUID(),
            contenedorId,
            llanta,
            ancho,
            perfil,
            marca: brand,
            claveCompuesta,
            cantidad: deltaCantidad,
            updatedAt: now,
        };
        items.push(targetItem);
    }
    const totalAcumulado = items.reduce((acc, curr) => acc + curr.cantidad, 0);
    return {
        item: targetItem,
        items,
        totalAcumulado,
    };
}
