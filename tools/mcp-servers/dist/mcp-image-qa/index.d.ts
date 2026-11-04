export interface ImageInspectResult {
    width: number;
    height: number;
    dimensionMaxPx: number;
    pesoBytes: number;
    formato: string;
    isWebP: boolean;
    sha256: string;
}
export declare function inspectImageMetadata(buffer: Buffer | Uint8Array, customDimensions?: {
    width: number;
    height: number;
}): ImageInspectResult;
export declare function verifyCompressionLimits(meta: {
    dimensionMaxPx: number;
    pesoBytes: number;
}): {
    compliant: boolean;
    violations: string[];
};
export declare function checkWebpIntegrity(buffer: Buffer | Uint8Array): {
    validHeader: boolean;
    sha256: string;
    error?: string;
};
