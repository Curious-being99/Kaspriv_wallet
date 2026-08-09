import { SOMPI_PER_KAS } from './common';

/**
 * Convert Sompi to KAS number or formatted string
 */
export function sompiToKas(sompi: bigint): number {
  return Number(sompi) / Number(SOMPI_PER_KAS);
}

/**
 * Convert KAS number to Sompi bigint
 */
export function kasToSompi(kas: number): bigint {
  return BigInt(Math.round(kas * Number(SOMPI_PER_KAS)));
}

/**
 * Format Kaspa amount for display with optional currency decimals
 */
export function formatKas(sompi: bigint, decimals: number = 8): string {
  const kas = sompiToKas(sompi);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  }).format(kas);
}
