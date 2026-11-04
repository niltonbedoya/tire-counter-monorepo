-- ============================================================================
-- COUNTER - ESQUEMA DE BASE DE DATOS SUPABASE (POSTGRESQL)
-- Arquitectura: Offline-First con sincronización en la nube y RLS
-- Cumplimiento estricto: SDD, FSM de lotes, cuotas WebP y auditoría
-- ============================================================================

-- 1. EXTENSIONES NECESARIAS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TIPOS ENUMERADOS (DOMINIO COUNTER)
DO $$ BEGIN
    CREATE TYPE rol_usuario AS ENUM ('operario', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE tipo_flujo AS ENUM ('despacho', 'recepcion');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE estado_lote AS ENUM (
        'ACTIVO',
        'BLOQUEADO_EN_BOVEDA',
        'DESPACHADO_PENDIENTE_ACK',
        'CONFIRMADO_EN_DESTINO',
        'PURGADO'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE tipo_movimiento AS ENUM (
        'ENTRADA_ALMACEN',
        'SALIDA_DESPACHO',
        'AJUSTE_AUDITORIA'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- 3. TABLAS PRINCIPALES
-- ============================================================================

-- 3.1 Perfiles de Usuarios (vinculados a auth.users de Supabase)
CREATE TABLE IF NOT EXISTS public.perfiles_usuarios (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    nombre TEXT NOT NULL,
    rol rol_usuario NOT NULL DEFAULT 'operario',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3.2 Lotes (Despachos y Entradas Almacén)
CREATE TABLE IF NOT EXISTS public.lotes (
    id TEXT PRIMARY KEY, -- e.g. "LOTE-2026-0001" o UUID
    tipo tipo_flujo NOT NULL DEFAULT 'despacho',
    estado estado_lote NOT NULL DEFAULT 'ACTIVO',
    operario_id UUID REFERENCES public.perfiles_usuarios(id) ON DELETE SET NULL,
    total_acumulado INTEGER NOT NULL DEFAULT 0 CHECK (total_acumulado >= 0),
    hash_sha256 TEXT,
    ack_token TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    bloqueado_at TIMESTAMPTZ,
    confirmado_at TIMESTAMPTZ
);

-- 3.3 Ítems de Lote (Ruedas asociadas al lote)
CREATE TABLE IF NOT EXISTS public.items_lote (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lote_id TEXT NOT NULL REFERENCES public.lotes(id) ON DELETE CASCADE,
    clave_compuesta TEXT NOT NULL, -- e.g. "205/55R16--MICHELIN"
    ancho INTEGER NOT NULL CHECK (ancho > 0),
    perfil INTEGER NOT NULL CHECK (perfil > 0),
    llanta INTEGER NOT NULL CHECK (llanta > 0),
    marca TEXT NOT NULL DEFAULT 'GENERICA',
    cantidad INTEGER NOT NULL CHECK (cantidad >= 1),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_lote_clave UNIQUE (lote_id, clave_compuesta)
);

-- 3.4 Inventario Maestro (Stock Centralizado en Almacén)
CREATE TABLE IF NOT EXISTS public.inventario_maestro (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clave_compuesta TEXT NOT NULL UNIQUE, -- Clave Canónica
    ancho INTEGER NOT NULL CHECK (ancho > 0),
    perfil INTEGER NOT NULL CHECK (perfil > 0),
    llanta INTEGER NOT NULL CHECK (llanta > 0),
    marca TEXT NOT NULL DEFAULT 'GENERICA',
    stock_actual INTEGER NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3.5 Registro de Movimientos de Inventario (Kardex Inmutable)
CREATE TABLE IF NOT EXISTS public.movimientos_inventario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lote_id TEXT REFERENCES public.lotes(id) ON DELETE SET NULL,
    clave_compuesta TEXT NOT NULL,
    tipo tipo_movimiento NOT NULL,
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    stock_previo INTEGER NOT NULL,
    stock_posterior INTEGER NOT NULL,
    usuario_id UUID REFERENCES public.perfiles_usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3.6 Evidencias Fotográficas
CREATE TABLE IF NOT EXISTS public.fotos_evidencia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lote_id TEXT NOT NULL REFERENCES public.lotes(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    hash_sha256 TEXT NOT NULL,
    peso_bytes INTEGER NOT NULL CHECK (peso_bytes <= 153600), -- Máx 150 KB
    ancho_px INTEGER NOT NULL CHECK (ancho_px <= 1280),       -- Lado mayor <= 1280 px
    alto_px INTEGER NOT NULL CHECK (alto_px <= 1280),
    formato TEXT NOT NULL DEFAULT 'image/webp' CHECK (formato = 'image/webp'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3.7 Registro de Auditoría (Bitácora de Seguridad)
CREATE TABLE IF NOT EXISTS public.registro_auditoria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lote_id TEXT,
    accion TEXT NOT NULL,
    detalle JSONB,
    usuario_id UUID REFERENCES public.perfiles_usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 4. ÍNDICES DE RENDIMIENTO
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_lotes_estado ON public.lotes(estado);
CREATE INDEX IF NOT EXISTS idx_lotes_tipo ON public.lotes(tipo);
CREATE INDEX IF NOT EXISTS idx_items_lote_id ON public.items_lote(lote_id);
CREATE INDEX IF NOT EXISTS idx_items_clave ON public.items_lote(clave_compuesta);
CREATE INDEX IF NOT EXISTS idx_inventario_clave ON public.inventario_maestro(clave_compuesta);
CREATE INDEX IF NOT EXISTS idx_movimientos_lote ON public.movimientos_inventario(lote_id);
CREATE INDEX IF NOT EXISTS idx_fotos_lote ON public.fotos_evidencia(lote_id);

-- ============================================================================
-- 5. FUNCIONES Y DISPARADORES (FSM E INMUTABILIDAD)
-- ============================================================================

-- 5.1 Invariante de Inmutabilidad en Bóveda
-- Prohíbe modificar o insertar ítems si el lote no está en estado 'ACTIVO'
CREATE OR REPLACE FUNCTION public.fn_verificar_inmutabilidad_lote()
RETURNS TRIGGER AS $$
DECLARE
    v_estado estado_lote;
BEGIN
    SELECT estado INTO v_estado FROM public.lotes WHERE id = COALESCE(NEW.lote_id, OLD.lote_id);
    IF v_estado IS NOT NULL AND v_estado <> 'ACTIVO' THEN
        RAISE EXCEPTION 'Operación denegada: El lote % se encuentra en estado % y es inmutable.', 
            COALESCE(NEW.lote_id, OLD.lote_id), v_estado;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_verificar_inmutabilidad ON public.items_lote;
CREATE TRIGGER trg_verificar_inmutabilidad
BEFORE INSERT OR UPDATE OR DELETE ON public.items_lote
FOR EACH ROW EXECUTE FUNCTION public.fn_verificar_inmutabilidad_lote();

-- 5.2 Recálculo Automático del Total Acumulado en Lote
CREATE OR REPLACE FUNCTION public.fn_recalcular_total_lote()
RETURNS TRIGGER AS $$
DECLARE
    v_lote_id TEXT;
    v_total INTEGER;
BEGIN
    v_lote_id := COALESCE(NEW.lote_id, OLD.lote_id);
    SELECT COALESCE(SUM(cantidad), 0) INTO v_total FROM public.items_lote WHERE lote_id = v_lote_id;
    UPDATE public.lotes 
    SET total_acumulado = v_total, updated_at = timezone('utc'::text, now())
    WHERE id = v_lote_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recalcular_total ON public.items_lote;
CREATE TRIGGER trg_recalcular_total
AFTER INSERT OR UPDATE OR DELETE ON public.items_lote
FOR EACH ROW EXECUTE FUNCTION public.fn_recalcular_total_lote();

-- 5.3 Procedimiento Atómico: Confirmación de Lote y Afectación de Stock (Admin "Tic")
CREATE OR REPLACE FUNCTION public.confirmar_lote_y_actualizar_inventario(
    p_lote_id TEXT,
    p_supervisor_id UUID
)
RETURNS JSONB AS $$
DECLARE
    r_lote RECORD;
    r_item RECORD;
    v_stock_actual INTEGER;
    v_nuevo_stock INTEGER;
    v_items_count INTEGER := 0;
BEGIN
    -- 1. Obtener y bloquear lote para actualización
    SELECT * INTO r_lote FROM public.lotes WHERE id = p_lote_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lote % no encontrado.', p_lote_id;
    END IF;

    IF r_lote.estado NOT IN ('BLOQUEADO_EN_BOVEDA', 'DESPACHADO_PENDIENTE_ACK') THEN
        RAISE EXCEPTION 'El lote % no está listo para confirmación (Estado actual: %).', p_lote_id, r_lote.estado;
    END IF;

    -- 2. Procesar ítems según el tipo de lote
    FOR r_item IN SELECT * FROM public.items_lote WHERE lote_id = p_lote_id LOOP
        v_items_count := v_items_count + 1;

        -- Obtener o inicializar stock en inventario maestro
        SELECT stock_actual INTO v_stock_actual 
        FROM public.inventario_maestro 
        WHERE clave_compuesta = r_item.clave_compuesta
        FOR UPDATE;

        IF NOT FOUND THEN
            -- Si no existe en maestro, crearlo con stock 0
            INSERT INTO public.inventario_maestro (clave_compuesta, ancho, perfil, llanta, marca, stock_actual)
            VALUES (r_item.clave_compuesta, r_item.ancho, r_item.perfil, r_item.llanta, r_item.marca, 0)
            RETURNING stock_actual INTO v_stock_actual;
        END IF;

        IF r_lote.tipo = 'recepcion' THEN
            -- ENTRADA ALMACÉN: Aumenta el stock
            v_nuevo_stock := v_stock_actual + r_item.cantidad;

            UPDATE public.inventario_maestro 
            SET stock_actual = v_nuevo_stock, updated_at = timezone('utc'::text, now())
            WHERE clave_compuesta = r_item.clave_compuesta;

            -- Registrar movimiento
            INSERT INTO public.movimientos_inventario (
                lote_id, clave_compuesta, tipo, cantidad, stock_previo, stock_posterior, usuario_id
            ) VALUES (
                p_lote_id, r_item.clave_compuesta, 'ENTRADA_ALMACEN', r_item.cantidad, v_stock_actual, v_nuevo_stock, p_supervisor_id
            );

        ELSIF r_lote.tipo = 'despacho' THEN
            -- SALIDA DESPACHO: Disminuye el stock (comprobando existencia)
            IF v_stock_actual < r_item.cantidad THEN
                RAISE EXCEPTION 'Stock insuficiente para %: Disponible %, Requerido %.',
                    r_item.clave_compuesta, v_stock_actual, r_item.cantidad;
            END IF;

            v_nuevo_stock := v_stock_actual - r_item.cantidad;

            UPDATE public.inventario_maestro 
            SET stock_actual = v_nuevo_stock, updated_at = timezone('utc'::text, now())
            WHERE clave_compuesta = r_item.clave_compuesta;

            -- Registrar movimiento
            INSERT INTO public.movimientos_inventario (
                lote_id, clave_compuesta, tipo, cantidad, stock_previo, stock_posterior, usuario_id
            ) VALUES (
                p_lote_id, r_item.clave_compuesta, 'SALIDA_DESPACHO', r_item.cantidad, v_stock_actual, v_nuevo_stock, p_supervisor_id
            );
        END IF;
    END LOOP;

    -- 3. Marcar lote como CONFIRMADO_EN_DESTINO
    UPDATE public.lotes
    SET estado = 'CONFIRMADO_EN_DESTINO',
        confirmado_at = timezone('utc'::text, now()),
        ack_token = 'ACK-' || encode(gen_random_bytes(16), 'hex'),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_lote_id;

    -- 4. Registrar auditoría
    INSERT INTO public.registro_auditoria (lote_id, accion, detalle, usuario_id)
    VALUES (
        p_lote_id, 
        'CONFIRMACION_TIC', 
        jsonb_build_object('tipo', r_lote.tipo, 'items_procesados', v_items_count, 'total', r_lote.total_acumulado),
        p_supervisor_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'lote_id', p_lote_id,
        'estado', 'CONFIRMADO_EN_DESTINO',
        'items_procesados', v_items_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. SEGURIDAD A NIVEL DE FILAS (ROW LEVEL SECURITY - RLS)
-- ============================================================================

-- Función auxiliar para verificar si el usuario conectado es Administrador
CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.perfiles_usuarios
        WHERE id = auth.uid() AND rol = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Habilitar RLS en todas las tablas
ALTER TABLE public.perfiles_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items_lote ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario_maestro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fotos_evidencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registro_auditoria ENABLE ROW LEVEL SECURITY;

-- 6.1 Políticas para perfiles_usuarios
CREATE POLICY "Usuarios pueden ver su propio perfil o Admin ve todos"
    ON public.perfiles_usuarios FOR SELECT
    USING (auth.uid() = id OR public.es_admin());

CREATE POLICY "Admin puede actualizar perfiles"
    ON public.perfiles_usuarios FOR UPDATE
    USING (public.es_admin());

-- 6.2 Políticas para lotes
CREATE POLICY "Lectura de lotes: Operario ve los suyos o Admin ve todos"
    ON public.lotes FOR SELECT
    USING (auth.uid() = operario_id OR public.es_admin());

CREATE POLICY "Operario puede crear lotes"
    ON public.lotes FOR INSERT
    WITH CHECK (auth.uid() = operario_id OR public.es_admin());

CREATE POLICY "Actualizar lote: Operario modifica si está ACTIVO, Admin siempre"
    ON public.lotes FOR UPDATE
    USING (
        (auth.uid() = operario_id AND estado = 'ACTIVO') OR public.es_admin()
    );

-- 6.3 Políticas para items_lote
CREATE POLICY "Lectura de items: Operario de su lote o Admin"
    ON public.items_lote FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.lotes 
            WHERE lotes.id = items_lote.lote_id 
              AND (lotes.operario_id = auth.uid() OR public.es_admin())
        )
    );

CREATE POLICY "Gestión de items: Operario en lote ACTIVO o Admin"
    ON public.items_lote FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.lotes 
            WHERE lotes.id = items_lote.lote_id 
              AND (lotes.operario_id = auth.uid() OR public.es_admin())
              AND lotes.estado = 'ACTIVO'
        )
    );

-- 6.4 Políticas para inventario_maestro
CREATE POLICY "Todos los autenticados pueden ver el inventario"
    ON public.inventario_maestro FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Solo Administrador puede modificar stock manualmente"
    ON public.inventario_maestro FOR ALL
    USING (public.es_admin());

-- 6.5 Políticas para movimientos_inventario y auditoría
CREATE POLICY "Lectura de movimientos y auditoría para Admin"
    ON public.movimientos_inventario FOR SELECT
    USING (public.es_admin());

CREATE POLICY "Lectura de auditoría para Admin"
    ON public.registro_auditoria FOR SELECT
    USING (public.es_admin());

-- 6.6 Políticas para fotos_evidencia
CREATE POLICY "Lectura de fotos para usuarios autenticados"
    ON public.fotos_evidencia FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Operario puede subir fotos a su lote activo"
    ON public.fotos_evidencia FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.lotes 
            WHERE lotes.id = fotos_evidencia.lote_id 
              AND lotes.operario_id = auth.uid()
              AND lotes.estado = 'ACTIVO'
        )
    );

-- ============================================================================
-- 7. TRIGGER DE REGISTRO AUTOMÁTICO DE PERFIL AL CREAR USUARIO EN SUPABASE AUTH
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.perfiles_usuarios (id, email, nombre, rol)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
        COALESCE((NEW.raw_user_meta_data->>'rol')::rol_usuario, 'operario')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 8. CONFIGURACIÓN DEL BUCKET STORAGE (fotos-evidencias)
-- ============================================================================
-- Crear bucket si no existe
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'fotos-evidencias',
    'fotos-evidencias',
    false,
    153600, -- 150 KB estricto
    ARRAY['image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = 153600,
    allowed_mime_types = ARRAY['image/webp'];

-- Políticas de Storage para fotos-evidencias
CREATE POLICY "Subida de fotos WebP autorizada"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'fotos-evidencias' 
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "Lectura de fotos para usuarios autenticados"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'fotos-evidencias' 
        AND auth.role() = 'authenticated'
    );
