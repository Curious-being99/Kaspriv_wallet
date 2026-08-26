const fs = require('fs');

// Fix computeTxIdWasm in wasmTx.ts
let wasmTx = fs.readFileSync('src/utils/kaspa/wasmTx.ts', 'utf8');
wasmTx = wasmTx.replace(
  /return \{\n\s*value: safeAmount,\n\s*scriptPublicKey: spkHex,\n\s*\};/g,
  'return {\n      value: safeAmount,\n      scriptPublicKey: new ScriptPublicKey(Number(outTx.scriptPublicKey?.version || 0), spkHex),\n    };'
);
fs.writeFileSync('src/utils/kaspa/wasmTx.ts', wasmTx);

// Use rawTx.id if available in kaspaBroadcastService.ts
let broadcastSvc = fs.readFileSync('src/services/kaspaBroadcastService.ts', 'utf8');
broadcastSvc = broadcastSvc.replace(
  /let localComputedTxId = knownTxId;\n\s*try \{\n\s*localComputedTxId = await computeTxIdWasm\(rawTx\);\n\s*\} catch \(e\) \{/g,
  "let localComputedTxId = knownTxId || rawTx.id || rawTx.transactionId;\n  try {\n    if (!localComputedTxId) {\n      localComputedTxId = await computeTxIdWasm(rawTx);\n    }\n  } catch (e) {"
);
fs.writeFileSync('src/services/kaspaBroadcastService.ts', broadcastSvc);

console.log('Patched correctly');
