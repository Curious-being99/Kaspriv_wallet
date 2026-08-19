/**
 * Input Sanitization & Anti-XSS Utilities
 * Encodes, strips HTML tags, and cleans untrusted user inputs.
 */

/**
 * Strips HTML tags, removes control characters, and constrains max length.
 */
export function sanitizeText(input: string, maxLength = 200): string {
  if (!input) return '';
  
  // 1. Convert to string and trim
  let clean = String(input).trim();

  // 2. Remove HTML tags
  clean = clean.replace(/<[^>]*>?/gm, '');

  // 3. Remove non-printable control characters (except space, tab, newline)
  clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 4. Truncate to maximum length
  return clean.slice(0, maxLength);
}

/**
 * Validates and cleans Kaspa address input strings.
 */
export function sanitizeKaspaAddress(address: string): string {
  if (!address) return '';
  
  let clean = String(address).trim().toLowerCase();
  // Keep only alphanumeric characters, colons, and hyphens (kaspa:qp...)
  clean = clean.replace(/[^a-z0-9:-]/gi, '');
  
  return clean.slice(0, 150);
}

/**
 * Sanitizes transaction notes or memo strings.
 */
export function sanitizeNote(note: string, maxLength = 500): string {
  return sanitizeText(note, maxLength);
}
