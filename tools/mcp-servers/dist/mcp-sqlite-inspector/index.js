"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMockSQLiteState = createMockSQLiteState;
exports.inspectSchema = inspectSchema;
exports.queryContainerState = queryContainerState;
exports.verifyVaultIsolation = verifyVaultIsolation;
function createMockSQLiteState() {
    return {
        tables: {
            operarios: ['id', 'nombre', 'pinHash', 'rol', 'idiomaPreferido', 'activo', 'createdAt'],
            contenedores: [
                'id',
                'codigoReferencia',
                'operarioId',
                'nombreOperarioSnapshot',
                'estado',
                'capacidadObjetivo',
                'totalAcumulado',
                'hashSha256Paquete',
                'reciboAckToken',
                'createdAt',
                'updatedAt',
            ],
            items_neumaticos: [
                'id',
                'contenedorId',
                'llanta',
                'ancho',
                'perfil',
                'marca',
                'claveCompuesta',
                'cantidad',
                'updatedAt',
            ],
            evidencias_fotos: [
                'id',
                'contenedorId',
                'rutaLocal',
                'formato',
                'dimensionMaxPx',
                'pesoBytes',
                'sha256Local',
                'timestamp',
            ],
        },
        containers: new Map(),
        items: new Map(),
        history: [],
    };
}
function inspectSchema(state) {
    return {
        tables: Object.keys(state.tables),
        schema: state.tables,
        constraints: [
            'PRIMARY KEY (id)',
            'UNIQUE (contenedorId, claveCompuesta)',
            'CHECK (cantidad >= 1)',
            'FOREIGN KEY (contenedorId) REFERENCES contenedores(id)',
        ],
    };
}
function queryContainerState(state, containerId) {
    const container = state.containers.get(containerId);
    if (!container) {
        return { found: false, error: `Contenedor ${containerId} no encontrado` };
    }
    const items = state.items.get(containerId) || [];
    const total = items.reduce((sum, item) => sum + item.cantidad, 0);
    return {
        found: true,
        container,
        itemsCount: items.length,
        totalCalculado: total,
        totalPersistido: container.totalAcumulado,
        isConsistent: total === container.totalAcumulado,
        items,
    };
}
function verifyVaultIsolation(container) {
    const vaultStates = [
        'BLOQUEADO_EN_BOVEDA',
        'DESPACHADO_PENDIENTE_ACK',
        'CONFIRMADO_EN_DESTINO',
        'PURGADO',
    ];
    const inVault = vaultStates.includes(container.estado);
    return {
        isIsolated: inVault,
        canMutate: !inVault,
        status: container.estado,
        reason: inVault
            ? `Aislamiento de bóveda activo: estado '${container.estado}' bloquea escrituras.`
            : `Contenedor activo: mutaciones permitidas.`,
    };
}
