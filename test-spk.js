import { payToScriptHashScript } from '@kasdk/nodejs';
const scriptHash = new Uint8Array(32); // All zeros
const script = payToScriptHashScript(scriptHash);
console.log(Buffer.from(script.script).toString('hex'));
