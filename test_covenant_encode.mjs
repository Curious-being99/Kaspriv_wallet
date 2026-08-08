import { bech32, bech32m } from 'bech32';

function encodeAddress(prefix, payloadBytes, version) {
  const versionByte = version;
  const words = bech32m.toWords(Buffer.from([versionByte, ...payloadBytes]));
  return bech32m.encode(prefix, words);
}

const cidHex = "a79e912ab50764e3b3d99ae21a08e2d8e7036db7f6b8700be8200435e0b32c7b";
const cidBytes = Buffer.from(cidHex, 'hex');

// Maybe version is something else?
for (let v = 0; v < 16; v++) {
  const enc = encodeAddress('kaspa', cidBytes, v);
  console.log(`Version ${v}: ${enc}`);
}
