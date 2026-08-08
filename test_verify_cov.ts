import { CovenantIDManager, CovenantType } from './src/utils/kaspa.ts';

const manager = new CovenantIDManager();
const finalId = manager.compute(
  CovenantType.P2SH,
  "56c8f07c2341d611195ddaca4981eea06f9c956c7c29fb2c5d37c5bd26c09821",
  1,
  [{
    outIdx: 0,
    amount: 50000000n,
    scriptBytes: new Uint8Array(Buffer.from("8c571f9c05380961debbd9fe6e90b2fba9f76859b724571a05807c845bb3600e", 'hex'))
  }],
  "timelock"
);
console.log("Computed ID:", finalId);
