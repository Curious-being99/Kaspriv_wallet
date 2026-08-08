import { blake2b } from '@noble/hashes/blake2.js';
class CovenantIDManager {
  covenantIdHash(data) {
    const tag = Buffer.from("CovenantID");
    const tagged = new Uint8Array(tag.length + data.length);
    tagged.set(tag, 0);
    tagged.set(data, tag.length);
    return blake2b(tagged, { dkLen: 32 });
  }

  encodeOutpoint(txIdHex, index) {
    const txIdBytes = new Uint8Array(Buffer.from(txIdHex, 'hex'));
    const indexBytes = new Uint8Array(4);
    new DataView(indexBytes.buffer).setUint32(0, index, true);
    const outpoint = new Uint8Array(36);
    outpoint.set(txIdBytes, 0);
    outpoint.set(indexBytes, 32);
    return outpoint;
  }

  encodeOutput(outIdx, amountSompi, scriptPubKey) {
    const buffer = new Uint8Array(4 + 8 + 4 + scriptPubKey.length);
    const view = new DataView(buffer.buffer);
    view.setUint32(0, outIdx, true); // out_idx (u32)
    view.setBigUint64(4, amountSompi, true); // amount (u64)
    view.setUint32(12, scriptPubKey.length, true); // script length (u32)
    buffer.set(scriptPubKey, 16);
    return buffer;
  }

  encodeAuthOutputs(authOutputs) {
    const sorted = [...authOutputs].sort((a, b) => a.outIdx - b.outIdx);
    let totalLen = 4; 
    const encodedList = [];
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

  computeStandard(txIdHex, inputIndex, authOutputs) {
    const outpoint = this.encodeOutpoint(txIdHex, inputIndex);
    const outputsEnc = this.encodeAuthOutputs(authOutputs);
    const preimage = new Uint8Array(outpoint.length + outputsEnc.length);
    preimage.set(outpoint, 0);
    preimage.set(outputsEnc, outpoint.length);
    const cid = this.covenantIdHash(preimage);
    return Buffer.from(cid).toString('hex');
  }
}

const manager = new CovenantIDManager();
const cid = manager.computeStandard(
  "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  0,
  [{outIdx: 0, amount: 100000000000n, scriptPubKey: new Uint8Array(Buffer.from("112233", 'hex'))}]
);
console.log(cid);
