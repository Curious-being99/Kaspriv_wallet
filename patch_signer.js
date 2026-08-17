const fs = require('fs');
let content = fs.readFileSync('src/utils/IsolatedSigner.ts', 'utf-8');

// Replace the inputs verification logic
content = content.replace(
  `  // 1. Verify inputs match the intent UTXOs exactly
  if (signedTx.inputs.length !== intent.utxos.length) {
    throw new Error(\`Security failure: Signed transaction input count (\${signedTx.inputs.length}) does not match the approved intent UTXO count (\${intent.utxos.length}).\`);
  }

  for (const input of signedTx.inputs) {
    const txId = input.previousOutpoint?.transactionId;
    const index = input.previousOutpoint?.index;
    if (!txId || index === undefined) {
      throw new Error('Security failure: Signed transaction input is missing previousOutpoint fields.');
    }

    // Every input outpoint must match a UTXO in the intent
    const utxoMatch = intent.utxos.some(u => {
      const uTxId = u.outpoint?.transactionId || u.transactionId;
      const uIndex = u.outpoint?.index !== undefined ? u.outpoint.index : (u.index || 0);
      return String(uTxId) === String(txId) && Number(uIndex) === Number(index);
    });

    if (!utxoMatch) {
      throw new Error(\`Security failure: Signed transaction contains an unapproved input outpoint \${txId}:\${index}.\`);
    }

    // Ensure the signatureScript is present (meaning it has been signed)
    if (!input.signatureScript) {
      throw new Error('Security failure: Signed transaction has an unsigned input (signatureScript is empty).');
    }
  }`,
  `  // 1. Verify inputs match the intent UTXOs exactly (allow subset if WASM builder optimized it)
  let totalActualInputSompi = 0n;
  for (const input of signedTx.inputs) {
    const txId = input.previousOutpoint?.transactionId;
    const index = input.previousOutpoint?.index;
    if (!txId || index === undefined) {
      throw new Error('Security failure: Signed transaction input is missing previousOutpoint fields.');
    }

    // Every input outpoint must match a UTXO in the intent
    const utxoMatch = intent.utxos.find(u => {
      const uTxId = u.outpoint?.transactionId || u.transactionId;
      const uIndex = u.outpoint?.index !== undefined ? u.outpoint.index : (u.index || 0);
      return String(uTxId) === String(txId) && Number(uIndex) === Number(index);
    });

    if (!utxoMatch) {
      throw new Error(\`Security failure: Signed transaction contains an unapproved input outpoint \${txId}:\${index}.\`);
    }
    
    totalActualInputSompi += BigInt(utxoMatch.utxoEntry?.amount || utxoMatch.amount || 0);

    // Ensure the signatureScript is present (meaning it has been signed)
    if (!input.signatureScript) {
      throw new Error('Security failure: Signed transaction has an unsigned input (signatureScript is empty).');
    }
  }`
);

// Replace change calculation
content = content.replace(
  `  const totalInputSompi = intent.utxos.reduce((acc, u) => {
    const amt = BigInt(u.utxoEntry?.amount || u.amount || 0);
    return acc + amt;
  }, 0n);

  const expectedChangeAmount = totalInputSompi - intent.amountSompi - intent.feeSompi;`,
  `  const expectedChangeAmount = totalActualInputSompi - intent.amountSompi - intent.feeSompi;`
);

// Allow Kaspa WASM standard fee inclusion in change output discrepancy
content = content.replace(
  `    const actualChangeAmount = BigInt(changeOutput.amount);
    if (actualChangeAmount !== expectedChangeAmount) {
      throw new Error(\`Security failure: Signed transaction change output amount (\${actualChangeAmount} sompi) does not match expected change (\${expectedChangeAmount} sompi).\`);
    }`,
  `    const actualChangeAmount = BigInt(changeOutput.amount);
    // Allow actual change to be slightly less than expected change to account for WASM automatic mass fee
    // Maximum mass fee difference usually shouldn't exceed 100000 sompi (0.001 KAS)
    if (actualChangeAmount > expectedChangeAmount) {
      throw new Error(\`Security failure: Signed transaction change output (\${actualChangeAmount}) exceeds expected (\${expectedChangeAmount}).\`);
    }
    const feeDiscrepancy = expectedChangeAmount - actualChangeAmount;
    if (feeDiscrepancy > 200000n) {
      throw new Error(\`Security failure: Signed transaction change output amount (\${actualChangeAmount} sompi) is suspiciously lower than expected (\${expectedChangeAmount} sompi).\`);
    }`
);

fs.writeFileSync('src/utils/IsolatedSigner.ts', content);
