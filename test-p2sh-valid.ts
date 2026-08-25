import { Address } from '@kasdk/web';
import { blake2b } from '@noble/hashes/blake2b';

export function createP2SH() {
  const hash = new Uint8Array(32); // All zeros
  // In BECH32 encoding, the payload must be exactly 32 bytes for version 8
  const { convertBits, CHARSET } = require('./src/utils/kaspa/address');
  // wait we don't have require in tsx by default.
}
