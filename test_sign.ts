import { createSignedTransactionIsolatedWasm } from './src/utils/kaspa/wasmTx';
import { getPrivateKeyBytesFromMnemonic } from './src/utils/kaspa';

async function run() {
  const mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
  const bytes = getPrivateKeyBytesFromMnemonic(mnemonic, "", "m/44'/111111'/0'/0/0");
  const keysMap = { "m/44'/111111'/0'/0/0": bytes };
  
  const utxos = [{
    outpoint: { transactionId: '0000000000000000000000000000000000000000000000000000000000000000', index: 0 },
    utxoEntry: { amount: 100000000n, scriptPublicKey: '200000000000000000000000000000000000000000000000000000000000000000ac' }
  }];
  
  try {
    const res = await createSignedTransactionIsolatedWasm(
      utxos,
      'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9aw3j',
      50000000n,
      'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9aw3j',
      keysMap,
      10000n,
      'P2SH'
    );
    console.log("Success:", res.id);
  } catch (err) {
    console.error("Failed:", err);
  }
}
run();
