import { blake2b } from '@noble/hashes/blake2.js';

export function computeCovenantId(
    txId: Uint8Array,
    inputIndex: number,
    authOutputs: { outIdx: number, amount: bigint, spk: Uint8Array }[]
): Uint8Array {
    // 1. Create a buffer for the preimage
    // txId: 32 bytes (usually), inputIndex: 4 bytes
    // authOutputs count: 4 bytes
    // For each output: outIdx: 4, amount: 8, len(spk): 4, spk: len bytes
    
    // Calculate total size
    let totalSize = txId.length + 4 + 4;
    for (const { spk } of authOutputs) {
        totalSize += 4 + 8 + 4 + spk.length;
    }
    
    const buffer = new Uint8Array(totalSize);
    let offset = 0;
    
    // Encode txId
    buffer.set(txId, offset);
    offset += txId.length;
    
    // Encode inputIndex (LE)
    const view = new DataView(buffer.buffer);
    view.setUint32(offset, inputIndex, true);
    offset += 4;
    
    // Encode auth_outputs count
    view.setUint32(offset, authOutputs.length, true);
    offset += 4;
    
    // Sort auth_outputs by outIdx
    const sortedOutputs = [...authOutputs].sort((a, b) => a.outIdx - b.outIdx);
    
    for (const { outIdx, amount, spk } of sortedOutputs) {
        view.setUint32(offset, outIdx, true);
        offset += 4;
        
        view.setBigUint64(offset, amount, true);
        offset += 8;
        
        view.setUint32(offset, spk.length, true);
        offset += 4;
        
        buffer.set(spk, offset);
        offset += spk.length;
    }
    
    // BLAKE2b-256 with domain tag "CovenantID"
    const tag = new TextEncoder().encode("CovenantID");
    const preimage = new Uint8Array(tag.length + buffer.length);
    preimage.set(tag);
    preimage.set(buffer, tag.length);
    
    return blake2b(preimage, { dkLen: 32 });
}
