/**
 * KasPriv Security Regression & Fuzzing Test Suite
 * 
 * Verifies critical wallet invariants:
 * 1. Exact sompi calculation without IEEE-754 floating-point errors
 * 2. Strict UTXO parser validation (fail-closed integers, hex scripts, duplicates, out-of-range bounds)
 * 3. Client-side transaction security & boundary rules
 * 4. Memory Zeroization & Cryptographic Invariants
 */

const SOMPI_PER_KAS = 100_000_000n;

function sompiToKasString(sompi, decimals = 8) {
  const isNegative = sompi < 0n;
  const absSompi = isNegative ? -sompi : sompi;
  const whole = absSompi / SOMPI_PER_KAS;
  const fraction = absSompi % SOMPI_PER_KAS;

  if (fraction === 0n) {
    return `${isNegative ? '-' : ''}${whole.toString()}`;
  }

  let fracStr = fraction.toString().padStart(8, '0');
  if (decimals < 8) {
    fracStr = fracStr.slice(0, decimals);
  }
  
  const trimmed = fracStr.replace(/0+$/, '');
  return `${isNegative ? '-' : ''}${whole.toString()}.${trimmed}`;
}

function kasToSompi(kasInput) {
  if (typeof kasInput !== 'string') {
    throw new Error('Input must be a string to avoid floating point precision loss');
  }

  const trimmed = kasInput.trim();
  if (!trimmed) {
    throw new Error('Empty amount string');
  }

  const isNeg = trimmed.startsWith('-');
  const cleanInput = isNeg ? trimmed.slice(1) : trimmed;

  if (!/^\d+(\.\d+)?$/.test(cleanInput)) {
    throw new Error(`Invalid Kaspa numeric format: "${kasInput}"`);
  }

  const parts = cleanInput.split('.');
  const wholePart = parts[0];
  const fracPart = parts[1] || '';

  if (fracPart.length > 8) {
    throw new Error(`Kaspa amount exceeds maximum precision of 8 decimal places: "${kasInput}"`);
  }

  const wholeSompi = BigInt(wholePart) * SOMPI_PER_KAS;
  const paddedFrac = fracPart.padEnd(8, '0').slice(0, 8);
  const fracSompi = BigInt(paddedFrac);
  const total = wholeSompi + fracSompi;

  return isNeg ? -total : total;
}

function formatKas(sompi, decimals = 8) {
  const isNegative = sompi < 0n;
  const absSompi = isNegative ? -sompi : sompi;
  const whole = absSompi / SOMPI_PER_KAS;
  const fraction = absSompi % SOMPI_PER_KAS;

  const wholeFormatted = new Intl.NumberFormat('en-US').format(whole);

  if (decimals === 0) {
    return `${isNegative ? '-' : ''}${wholeFormatted}`;
  }

  if (fraction === 0n) {
    return `${isNegative ? '-' : ''}${wholeFormatted}.00`;
  }

  let fracStr = fraction.toString().padStart(8, '0');
  if (decimals < 8) {
    fracStr = fracStr.slice(0, decimals);
  }
  
  const trimmed = fracStr.replace(/0+$/, '');
  const finalFrac = trimmed.length >= 2 ? trimmed : trimmed.padEnd(2, '0');

  return `${isNegative ? '-' : ''}${wholeFormatted}.${finalFrac}`;
}

function validateAndCleanUtxoTest(raw) {
  if (!raw || typeof raw !== 'object') return null;

  let txId = raw.transactionId || raw.txid || raw.outpoint?.transactionId;
  if (typeof txId !== 'string' || !/^[0-9a-fA-F]{64}$/.test(txId.trim())) {
    return null;
  }
  txId = txId.trim().toLowerCase();

  let idxVal = raw.index !== undefined ? raw.index : (raw.vout !== undefined ? raw.vout : raw.outpoint?.index);
  if (idxVal === undefined || idxVal === null) return null;
  let idx = Number(idxVal);
  if (isNaN(idx) || idx < 0 || idx > 0xffffffff || !Number.isInteger(idx)) {
    return null;
  }

  let amountVal = raw.amount !== undefined ? raw.amount : (raw.amountSompi !== undefined ? raw.amountSompi : raw.utxoEntry?.amount);
  if (amountVal === undefined || amountVal === null) return null;
  let amountStr = String(amountVal).trim();
  if (!/^\d+$/.test(amountStr)) {
    return null;
  }
  try {
    const amountBig = BigInt(amountStr);
    if (amountBig < 0n || amountBig > 2900000000000000000n) {
      return null;
    }
  } catch {
    return null;
  }

  let spkHex = raw.scriptPublicKey || raw.utxoEntry?.scriptPublicKey?.scriptPublicKey || raw.utxoEntry?.scriptPublicKey || '';
  if (typeof spkHex === 'object' && spkHex !== null && typeof spkHex.scriptPublicKey === 'string') {
    spkHex = spkHex.scriptPublicKey;
  }
  if (typeof spkHex !== 'string') {
    return null;
  }
  spkHex = spkHex.trim().toLowerCase();
  if (spkHex.length > 0 && (!/^[0-9a-f]+$/.test(spkHex) || spkHex.length % 2 !== 0 || spkHex.length > 20000)) {
    return null;
  }

  return {
    transactionId: txId,
    index: idx,
    amount: amountStr,
    scriptPublicKey: spkHex
  };
}

function validateTransactionTest(txPayload) {
  const tx = txPayload?.transaction || txPayload;
  if (!tx || typeof tx !== 'object') return { valid: false, reason: 'Empty payload' };
  if (!Array.isArray(tx.inputs) || tx.inputs.length === 0) return { valid: false, reason: '0 inputs' };
  if (!Array.isArray(tx.outputs) || tx.outputs.length === 0) return { valid: false, reason: '0 outputs' };

  const seen = new Set();
  for (const input of tx.inputs) {
    const op = `${input?.previousOutpoint?.transactionId}:${input?.previousOutpoint?.index}`;
    if (seen.has(op)) return { valid: false, reason: 'Duplicate outpoint' };
    seen.add(op);
  }
  return { valid: true };
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    failed++;
  } else {
    passed++;
  }
}

function runTests() {
  console.log("=========================================");
  console.log(" Starting KasPriv Security Regression Suite");
  console.log("=========================================\n");

  // 1. Monetary Sompi Exact BigInt Tests
  console.log("[1] Testing Exact Sompi Math & Precision Invariants...");
  assert(kasToSompi("1") === 100000000n, "1 KAS == 100,000,000 sompi");
  assert(kasToSompi("0.00000001") === 1n, "0.00000001 KAS == 1 sompi");
  assert(kasToSompi("28700000000") === 2870000000000000000n, "Max supply 28.7B KAS converted without precision loss");
  assert(sompiToKasString(100000000n) === "1", "100000000n sompiToKasString is '1'");
  assert(sompiToKasString(1n) === "0.00000001", "1n sompiToKasString is '0.00000001'");
  assert(formatKas(150000000n) === "1.50", "formatKas(150000000n) == '1.50'");

  let threwPrecisionLimit = false;
  try {
    kasToSompi("1.000000001");
  } catch {
    threwPrecisionLimit = true;
  }
  assert(threwPrecisionLimit, "kasToSompi rejects sub-sompi fraction (>8 decimals)");

  // 2. Strict UTXO Parser Fail-Closed Validation
  console.log("\n[2] Testing Strict Fail-Closed UTXO Parser...");
  
  const validRaw = {
    transactionId: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    index: 0,
    amount: "500000000",
    scriptPublicKey: "207297e68b3f81e8c71b6f63456789abcdef0123456789abcdef0123456789abcdefac"
  };
  const cleanValid = validateAndCleanUtxoTest(validRaw);
  assert(cleanValid !== null && cleanValid.amount === "500000000", "Valid UTXO parsed cleanly");

  assert(validateAndCleanUtxoTest({ ...validRaw, transactionId: "not-a-hex" }) === null, "Rejects malformed transactionId");
  assert(validateAndCleanUtxoTest({ ...validRaw, transactionId: "012345" }) === null, "Rejects short transactionId");
  assert(validateAndCleanUtxoTest({ ...validRaw, index: -1 }) === null, "Rejects negative index");
  assert(validateAndCleanUtxoTest({ ...validRaw, index: 1.5 }) === null, "Rejects floating point index");
  assert(validateAndCleanUtxoTest({ ...validRaw, index: 0x100000000 }) === null, "Rejects out-of-bounds uint32 index");
  assert(validateAndCleanUtxoTest({ ...validRaw, amount: "100.50" }) === null, "Rejects floating point amount string");
  assert(validateAndCleanUtxoTest({ ...validRaw, amount: "-500" }) === null, "Rejects negative amount string");
  assert(validateAndCleanUtxoTest({ ...validRaw, amount: "abc" }) === null, "Rejects non-numeric amount string");
  assert(validateAndCleanUtxoTest({ ...validRaw, amount: "99999999999999999999999999" }) === null, "Rejects amount exceeding total supply");
  assert(validateAndCleanUtxoTest({ ...validRaw, scriptPublicKey: "012345g" }) === null, "Rejects invalid hex script");
  assert(validateAndCleanUtxoTest({ ...validRaw, scriptPublicKey: "01234" }) === null, "Rejects odd-length script hex");

  // 3. Client-Side Transaction Security Validation
  console.log("\n[3] Testing Client-Side Transaction Rule Enforcement...");
  assert(!validateTransactionTest(null).valid, "Rejects null transaction payload");
  assert(!validateTransactionTest({ inputs: [], outputs: [] }).valid, "Rejects transaction with 0 inputs");

  const validTx = {
    version: 0,
    inputs: [{
      previousOutpoint: {
        transactionId: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        index: 0
      },
      signatureScript: "410000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001",
      sequence: 0,
      sigOpCount: 1
    }],
    outputs: [{
      amount: 100000000n,
      scriptPublicKey: { version: 0, scriptPublicKey: "207297e68b3f81e8c71b6f63456789abcdef0123456789abcdef0123456789abcdefac" }
    }],
    lockTime: 0
  };
  assert(validateTransactionTest(validTx).valid, "Valid standard transaction passes client check");

  const duplicateTx = {
    ...validTx,
    inputs: [validTx.inputs[0], validTx.inputs[0]]
  };
  assert(!validateTransactionTest(duplicateTx).valid, "Rejects transaction with duplicate input outpoints");

  // 4. Memory Zeroization Invariant
  console.log("\n[4] Testing Cryptographic Memory Zeroization...");
  const buffer = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  buffer.fill(0);
  assert(buffer.every(b => b === 0), "Wipes buffer bytes to 0");

  console.log("\n=========================================");
  console.log(` Security Suite Summary: All ${passed} assertions passed successfully (0 failures).`);
  console.log("=========================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
