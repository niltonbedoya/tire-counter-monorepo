import { describe, it, expect } from 'vitest';
import {
  ItemNeumaticoSchema,
  EvidenciaFotoSchema,
  ReceiptAckTokenSchema,
} from '../src/schemas';

describe('Zod Contracts & Invariants Validation Suite', () => {
  it('should validate an ItemNeumatico with valid composite key and quantity >= 1', () => {
    const valid = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      contenedorId: '550e8400-e29b-41d4-a716-446655440001',
      llanta: 16,
      ancho: 205,
      perfil: 55,
      marca: 'Michelin',
      claveCompuesta: '205/55R16--Michelin',
      cantidad: 4,
      updatedAt: new Date().toISOString(),
    };
    expect(() => ItemNeumaticoSchema.parse(valid)).not.toThrow();
  });

  it('should reject ItemNeumatico when claveCompuesta does not follow the domain formula', () => {
    const invalid = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      contenedorId: '550e8400-e29b-41d4-a716-446655440001',
      llanta: 16,
      ancho: 205,
      perfil: 55,
      marca: 'Michelin',
      claveCompuesta: 'WRONG_KEY',
      cantidad: 4,
      updatedAt: new Date().toISOString(),
    };
    expect(() => ItemNeumaticoSchema.parse(invalid)).toThrow();
  });

  it('should reject EvidenciaFoto if dimension > 1280 or size >= 153600 bytes', () => {
    const oversized = {
      id: '550e8400-e29b-41d4-a716-446655440002',
      contenedorId: '550e8400-e29b-41d4-a716-446655440001',
      rutaLocal: '/vault/photo1.webp',
      formato: 'image/webp',
      dimensionMaxPx: 1920, // Exceeds 1280
      pesoBytes: 120000,
      sha256Local: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      timestamp: new Date().toISOString(),
    };
    expect(() => EvidenciaFotoSchema.parse(oversized)).toThrow();

    const overweight = {
      id: '550e8400-e29b-41d4-a716-446655440003',
      contenedorId: '550e8400-e29b-41d4-a716-446655440001',
      rutaLocal: '/vault/photo2.webp',
      formato: 'image/webp',
      dimensionMaxPx: 1280,
      pesoBytes: 160000, // Exceeds 153600
      sha256Local: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      timestamp: new Date().toISOString(),
    };
    expect(() => EvidenciaFotoSchema.parse(overweight)).toThrow();
  });
});
