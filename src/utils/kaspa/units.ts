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
 * Convert KAS number or numeric string to Sompi bigint
 */
export function kasToSompi(kas: number | string): bigint {
  if (typeof kas === 'string') {
    const clean = kas.trim().replace(/,/g, '');
    if (!clean || isNaN(Number(clean))) return 0n;
    const parts = clean.split('.');
    const isNeg = clean.startsWith('-');
    const wholePart = parts[0].replace('-', '');
    const whole = BigInt(wholePart || '0') * SOMPI_PER_KAS;
    if (parts.length < 2 || !parts[1]) {
      return isNeg ? -whole : whole;
    }
    let fracStr = parts[1].padEnd(8, '0').slice(0, 8);
    const frac = BigInt(fracStr);
    const total = whole + frac;
    return isNeg ? -total : total;
  }
  return BigInt(Math.round(kas * Number(SOMPI_PER_KAS)));
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
