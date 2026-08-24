import { IsolatedSigner } from './src/utils/IsolatedSigner';
import { UnsignedTxIntent } from './src/types';
import { getPrivateKeyBytesFromMnemonic } from './src/utils/kaspa/keys';
import { PrivateKey, Address, payToScriptHashScript, payToAddressScript } from '@kasdk/web';

async function run() {
  const wasm = require('@kasdk/web');
  const fs = require('fs');
  const wasmBuffer = fs.readFileSync('./node_modules/@kasdk/web/kaspa_bg.wasm');
  await wasm.default(wasmBuffer);
  
  const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const passphrase = '';
  
  // Just derive the key to get the address and redeemScript
  const privBytes = getPrivateKeyBytesFromMnemonic(mnemonic, passphrase, "m/44'/111111'/0'/0/0");
  const pkHex = Array.from(privBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const pk = new PrivateKey(pkHex);
  const xOnly = pk.toPublicKey().toXOnlyPublicKey();
  const redeemScriptHex = '20' + xOnly.toString() + 'ac';
  
  const p2shScript = payToScriptHashScript(redeemScriptHex);
  const addressType = 'P2SH';
  
  // Create an intent
  const intent: UnsignedTxIntent = {
    utxos: [
      {
        transactionId: '0000000000000000000000000000000000000000000000000000000000000001',
        index: 0,
        amount: 100000000n,
        scriptPublicKey: p2shScript.script,
        address: 'kaspa:pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e',
        utxoEntry: {
          amount: 100000000n,
          scriptPublicKey: { script: p2shScript.script, version: 0 },
          blockDaaScore: 1n,
          isCoinbase: false
        }
      }
    ],
    toAddress: 'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e',
    amountSompi: 50000000n,
    changeAddress: 'kaspa:pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e',
    feeSompi: 100000n,
    lockTime: 0,
    derivationPaths: ["m/44'/111111'/0'/0/0"]
  };

  const res = await IsolatedSigner.signTransactionIsolated(
    mnemonic, 
    passphrase,
    intent,
    addressType,
    redeemScriptHex,
    true // skip worker
  );
  
  console.log('Result:', res);
}

run().catch(console.error);
