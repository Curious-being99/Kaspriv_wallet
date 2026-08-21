import { SOMPI_PER_KAS } from './common';

/**
 * Convert Sompi (BigInt) to KAS number.
 * Note: For values > ~90 million KAS, use sompiToKasString to avoid JS floating point precision limits.
 */
export function sompiToKas(sompi: bigint): number {
  return Number(sompi) / Number(SOMPI_PER_KAS);
}

/**
 * Convert Sompi (BigInt) to exact KAS string representation without floating point loss.
 */
export function sompiToKasString(sompi: bigint, decimals: number = 8): string {
  const isNegative = sompi < 0n;
  const absSompi = isNegative ? -sompi : sompi;
  const whole = absSompi / SOMPI_PER_KAS;
  const fraction = absSompi % SOMPI_PER_KAS;

  if (fraction === 0n) {
    return `${isNegative ? '-' : ''}${whole.toString()}`;
  }

  let fracStr = fraction.toString().padStart(8, '0');
  if (decimals < 8) {
    fracStr = fracStr.slice(0, decimals);
  }
  fracStr = fracStr.replace(/0+$/, '');
  if (!fracStr) {
    return `${isNegative ? '-' : ''}${whole.toString()}`;
  }
  return `${isNegative ? '-' : ''}${whole.toString()}.${fracStr}`;
}

/**
 * Convert KAS number or numeric string to Sompi bigint.
 * Uses exact decimal string parsing to completely eliminate IEEE-754 floating-point inaccuracies.
 */
export function kasToSompi(kas: number | string | bigint): bigint {
  if (typeof kas === 'bigint') {
    return kas * SOMPI_PER_KAS;
  }

  let str: string;
  if (typeof kas === 'number') {
    if (!Number.isFinite(kas)) return 0n;
    // Format to 8 decimal places string to avoid scientific notation or floating-point multiplication
    str = kas.toFixed(8);
  } else {
    str = String(kas);
  }

  const clean = str.trim().replace(/,/g, '');
  if (!clean || !/^-?\d*(\.\d*)?$/.test(clean) || clean === '-' || clean === '.') {
    return 0n;
  }

  const isNeg = clean.startsWith('-');
  const unsigned = isNeg ? clean.slice(1) : clean;
  const parts = unsigned.split('.');
  const wholePart = parts[0] || '0';
  const fracPart = parts[1] || '';

  const wholeSompi = BigInt(wholePart) * SOMPI_PER_KAS;
  const paddedFrac = fracPart.padEnd(8, '0').slice(0, 8);
  const fracSompi = BigInt(paddedFrac);
  const total = wholeSompi + fracSompi;

  return isNeg ? -total : total;
}

/**
 * Format Kaspa amount for display with commas for whole numbers and configurable decimals
 */
export function formatKas(sompi: bigint, decimals: number = 8): string {
  const isNegative = sompi < 0n;
  const absSompi = isNegative ? -sompi : sompi;
  const whole = absSompi / SOMPI_PER_KAS;
  const fraction = absSompi % SOMPI_PER_KAS;

  const wholeFormatted = new Intl.NumberFormat('en-US').format(whole);

  if (decimals === 0) {
    return `${isNegative ? '-' : ''}${wholeFormatted}`;
  }

  if (fraction === 0n) {
    return `${isNegative ? '-' : ''}${wholeFormatted}.00`;
  }

  let fracStr = fraction.toString().padStart(8, '0');
  if (decimals < 8) {
    fracStr = fracStr.slice(0, decimals);
  }
  
  const trimmed = fracStr.replace(/0+$/, '');
  const finalFrac = trimmed.length >= 2 ? trimmed : trimmed.padEnd(2, '0');

  return `${isNegative ? '-' : ''}${wholeFormatted}.${finalFrac}`;
}
