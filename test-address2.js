import { Address } from '@kasdk/web';
const scriptHash = new Uint8Array(32); // All zeros
const p2shAddr = new Address(scriptHash, 'kaspa', 8); // 8 is P2SH version
console.log('P2SH:', p2shAddr.toString());
