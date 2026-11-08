import crypto from 'node:crypto';
import { UUID, EvidenciaFoto } from '../types';

export interface ProcessorInput {
  contenedorId: UUID;
  rawBuffer: Buffer | Uint8Array;
  originalWidth?: number;
  originalHeight?: number;
  fileName?: string;
}

export function processImageBuffer(input: ProcessorInput): {
  evidencia: EvidenciaFoto;
  webpBuffer: Buffer;
  simulado: true;
} {
  const { contenedorId, rawBuffer, originalWidth = 3840, originalHeight = 2160 } = input;
  const now = new Date().toISOString();

  // 1. Scale so the longest side is <= 1280 px
  const maxOriginal = Math.max(originalWidth, originalHeight);
  let scale = 1.0;
  if (maxOriginal > 1280) {
    scale = 1280 / maxOriginal;
  }
  const targetWidth = Math.round(originalWidth * scale);
  const targetHeight = Math.round(originalHeight * scale);
  const dimensionMaxPx = Math.max(targetWidth, targetHeight);

  // 2. WebP compression (ensuring weight < 153,600 bytes = 150 KB)
  // NOTE: In production, use a real WebP encoder instead of this synthetic RIFF/WEBP placeholder.
  const targetSize = Math.min(rawBuffer.length, 120 * 1024); // ~120 KB (strictly < 150 KB)
  const webpBuffer = Buffer.alloc(targetSize);

  // Magic bytes RIFF
  webpBuffer.write('RIFF', 0, 'ascii');
  webpBuffer.writeUInt32LE(targetSize - 8, 4);
  webpBuffer.write('WEBP', 8, 'ascii');
  // VP8 chunk
  webpBuffer.write('VP8 ', 12, 'ascii');
  webpBuffer.writeUInt32LE(targetSize - 20, 16);

  // Fill body with compressed payload derived from rawBuffer
  const filler = Buffer.isBuffer(rawBuffer) ? rawBuffer : Buffer.from(rawBuffer);
  for (let i = 20; i < targetSize; i++) {
    webpBuffer[i] = filler[i % filler.length] ^ 0x5a;
  }

  const pesoBytes = webpBuffer.length;
  const sha256Local = crypto.createHash('sha256').update(webpBuffer).digest('hex');
  const fotoId = crypto.randomUUID();
  const rutaLocal = `vault/fotos/${fotoId}.webp`;

  const evidencia: EvidenciaFoto = {
    id: fotoId,
    contenedorId,
    rutaLocal,
    formato: 'image/webp',
    dimensionMaxPx,
    pesoBytes,
    sha256Local,
    timestamp: now,
  };

  return {
    evidencia,
    webpBuffer,
    simulado: true,
  };
}
