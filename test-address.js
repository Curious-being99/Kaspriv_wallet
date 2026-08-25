import { Address } from '@kasdk/nodejs';
const scriptHash = new Uint8Array(32); // All zeros
const p2shAddr = new Address(scriptHash, 'kaspa', 8); // 8 is P2SH version
console.log('P2SH:', p2shAddr.toString());
const p2pkAddr = new Address(new Uint8Array(32), 'kaspa', 0); // 0 is P2PK
console.log('P2PK:', p2pkAddr.toString());
