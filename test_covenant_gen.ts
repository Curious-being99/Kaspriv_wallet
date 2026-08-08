export const CovenantType = { STANDARD: 'standard', P2SH: 'p2sh' };
import { blake2b } from '@noble/hashes/blake2.js';

export class CovenantIDManager {
  registry: Record<string, any> = {};

  covenantIdHash(data: Uint8Array): Uint8Array {
    const tag = new TextEncoder().encode("CovenantID");
    const tagged = new Uint8Array(tag.length + data.length);
    tagged.set(tag, 0);
    tagged.set(data, tag.length);
    return blake2b(tagged, { dkLen: 32 });
  }

  encodeOutpoint(txIdHex: string, index: number): Uint8Array {
    const txIdBytes = new Uint8Array(txIdHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const indexBytes = new Uint8Array(4);
    new DataView(indexBytes.buffer).setUint32(0, index, true);
    const outpoint = new Uint8Array(36);
    outpoint.set(txIdBytes, 0);
    outpoint.set(indexBytes, 32);
    return outpoint;
  }

  encodeOutput(outIdx: number, amountSompi: bigint, scriptPubKey: Uint8Array): Uint8Array {
    const buffer = new Uint8Array(4 + 8 + 4 + scriptPubKey.length);
    const view = new DataView(buffer.buffer);
    view.setUint32(0, outIdx, true);
    view.setBigUint64(4, amountSompi, true);
    view.setUint32(12, scriptPubKey.length, true);
    buffer.set(scriptPubKey, 16);
    return buffer;
  }

  encodeAuthOutputs(authOutputs: { outIdx: number, amount: bigint, scriptPubKey: Uint8Array }[]): Uint8Array {
    const sorted = [...authOutputs].sort((a, b) => a.outIdx - b.outIdx);
    let totalLen = 4; 
    const encodedList: Uint8Array[] = [];
    for (const out of sorted) {
      const enc = this.encodeOutput(out.outIdx, out.amount, out.scriptPubKey);
      encodedList.push(enc);
      totalLen += enc.length;
    }
    const buffer = new Uint8Array(totalLen);
    new DataView(buffer.buffer).setUint32(0, sorted.length, true);
    let offset = 4;
    for (const enc of encodedList) {
      buffer.set(enc, offset);
      offset += enc.length;
    }
    return buffer;
  }

  buildP2shLockingScript(innerScript: Uint8Array): Uint8Array {
    const scriptHash = blake2b(innerScript, { dkLen: 32 });
    const script = new Uint8Array(35);
    script[0] = 0xaa;
    script[1] = 0x20;
    script.set(scriptHash, 2);
    script[34] = 0x87;
    return script;
  }

  computeStandard(txIdHex: string, inputIndex: number, authOutputs: { outIdx: number, amount: bigint, scriptPubKey: Uint8Array }[]): string {
    const outpoint = this.encodeOutpoint(txIdHex, inputIndex);
    const outputsEnc = this.encodeAuthOutputs(authOutputs);
    const preimage = new Uint8Array(outpoint.length + outputsEnc.length);
    preimage.set(outpoint, 0);
    preimage.set(outputsEnc, outpoint.length);
    const cid = this.covenantIdHash(preimage);
    return Buffer.from(cid).toString('hex');
  }

  compute(
    covenantType: string,
    txIdHex: string,
    inputIndex: number,
    authOutputs: { outIdx: number, amount: bigint, scriptBytes: Uint8Array }[],
    label: string = ""
  ): string {
    let cidHex = "";
    if (covenantType === CovenantType.STANDARD) {
      cidHex = this.computeStandard(txIdHex, inputIndex, authOutputs.map(o => ({
        outIdx: o.outIdx,
        amount: o.amount,
        scriptPubKey: o.scriptBytes
      })));
    } else if (covenantType === CovenantType.P2SH) {
      const p2shOutputs = authOutputs.map(o => ({
        outIdx: o.outIdx,
        amount: o.amount,
        scriptPubKey: this.buildP2shLockingScript(o.scriptBytes)
      }));
      cidHex = this.computeStandard(txIdHex, inputIndex, p2shOutputs);
    }
    return cidHex;
  }
}

const manager = new CovenantIDManager();
try {
  const finalId = manager.compute(
    CovenantType.P2SH,
    "12362c10ab876a5b1d1b4824b93de88821eca978e14eceddd0b5e390bca847c2",
    0,
    [{
      outIdx: 0,
      amount: 100000000n,
      scriptBytes: new Uint8Array(Buffer.from("112233", 'hex'))
    }],
    "timelock"
  );
  console.log("Success! ID:", finalId);
} catch (err) {
  console.error("Failed:", err);
}
