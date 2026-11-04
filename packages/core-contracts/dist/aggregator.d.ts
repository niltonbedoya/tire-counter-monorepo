import { ItemNeumatico, AggregatorInput, AggregatorOutput } from './types';
export declare function computeCompositeKey(ancho: number, perfil: number, llanta: number, marca?: string, moduloMarcaActivo?: boolean): string;
export declare function aggregateItem(existingItems: ItemNeumatico[], input: AggregatorInput): AggregatorOutput;
