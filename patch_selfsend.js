const fs = require('fs');
let content = fs.readFileSync('src/utils/IsolatedSigner.ts', 'utf-8');

content = content.replace(
  `  if (isSelfSend) {
    const combinedAmount = BigInt(recipientOutput.amount);
    const expectedCombined = intent.amountSompi + expectedChangeAmount;
    
    if (combinedAmount > expectedCombined) {
      throw new Error(\\\`Security failure: Signed transaction self-send combined output (\${combinedAmount}) exceeds expected (\${expectedCombined}).\\\`);
    }
    const feeDiscrepancy = expectedCombined - combinedAmount;
    if (feeDiscrepancy > 200000n) {
      throw new Error(\\\`Security failure: Signed transaction combined output amount (\${combinedAmount} sompi) is suspiciously lower than expected (\${expectedCombined} sompi).\\\`);
    }
  }`,
  `  if (isSelfSend) {
    let combinedAmount = 0n;
    for (const out of signedTx.outputs) {
      const spk = out.scriptPublicKey?.scriptPublicKey || out.scriptPublicKey;
      if (spk === expectedScriptPubKey) {
        combinedAmount += BigInt(out.amount);
      }
    }
    
    const expectedCombined = intent.amountSompi + expectedChangeAmount;
    
    if (combinedAmount > expectedCombined) {
      throw new Error(\`Security failure: Signed transaction self-send combined output (\${combinedAmount}) exceeds expected (\${expectedCombined}).\`);
    }
    const feeDiscrepancy = expectedCombined - combinedAmount;
    if (feeDiscrepancy > 200000n) {
      throw new Error(\`Security failure: Signed transaction combined output amount (\${combinedAmount} sompi) is suspiciously lower than expected (\${expectedCombined} sompi).\`);
    }
  }`
);

fs.writeFileSync('src/utils/IsolatedSigner.ts', content);
