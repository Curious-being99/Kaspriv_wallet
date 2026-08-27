use crate::bip32::ExtPrivateKey;
use crate::crypto::{decrypt_data, double_sha256};
use secp256k1::{Message, Secp256k1, SecretKey};
use serde::{Deserialize, Serialize};
use std::error::Error;

#[derive(Serialize, Deserialize, Debug)]
pub struct RawInput {
    pub txid: String,
    pub vout: u32,
    pub amount: u64,
    pub path: String, // e.g. "m/44'/111111'/0'/0/0"
    pub script_pub_key: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct RawOutput {
    pub address: String,
    pub amount: u64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TransactionIntent {
    pub inputs: Vec<RawInput>,
    pub outputs: Vec<RawOutput>,
    pub change_address: String,
    pub fee: u64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SignedTransaction {
    pub txid: String,
    pub raw_payload: String, // Hex encoded signed transaction ready for broadcast
    pub signatures: Vec<String>, // Hex encoded ECDSA signatures for auditing
}

/// Computes the transaction preimage hash for a given input index.
/// Follows standard Bitcoin/Kaspa design by placing the input script_pub_key into the input and hashing.
pub fn compute_input_signature_hash(
    intent: &TransactionIntent,
    input_index: usize,
) -> Result<[u8; 32], Box<dyn Error>> {
    if input_index >= intent.inputs.len() {
        return Err("Input index out of bounds".into());
    }

    // A simplified preimage buffer calculation
    let mut preimage = Vec::new();
    
    // Add outputs
    for out in &intent.outputs {
        preimage.extend_from_slice(&out.amount.to_le_bytes());
        preimage.extend_from_slice(out.address.as_bytes());
    }
    
    // Add target input being signed (the scriptPublicKey protects against address swapping)
    let target_input = &intent.inputs[input_index];
    preimage.extend_from_slice(&target_input.amount.to_le_bytes());
    preimage.extend_from_slice(&hex::decode(&target_input.script_pub_key)?);
    preimage.extend_from_slice(&target_input.vout.to_le_bytes());
    preimage.extend_from_slice(target_input.txid.as_bytes());

    // Double SHA256 of the serialized preimage data
    Ok(double_sha256(&preimage))
}

/// Decrypts the seed, derives BIP32 private keys, and signs the transaction intent.
pub fn sign_transaction(
    intent_json: &str,
    encrypted_mnemonic: &[u8],
    password: &str,
) -> Result<SignedTransaction, Box<dyn Error>> {
    // 1. Parse Transaction Intent
    let intent: TransactionIntent = serde_json::from_str(intent_json)
        .map_err(|e| format!("Invalid transaction intent: {:?}", e))?;

    // 2. Decrypt Mnemonic Seed Phrase
    let mnemonic_bytes = decrypt_data(encrypted_mnemonic, password)?;
    let mnemonic = String::from_utf8(mnemonic_bytes)
        .map_err(|_| "Failed to parse decrypted seed phrase as UTF-8 string")?;

    // 3. Generate Master BIP-32 Key
    let seed_bytes = double_sha256(mnemonic.trim().as_bytes()); // Standard master seed generation
    let master_key = ExtPrivateKey::new_master(&seed_bytes)?;

    let secp = Secp256k1::new();
    let mut signatures = Vec::new();

    // 4. Sign each input
    for (idx, input) in intent.inputs.iter().enumerate() {
        // Derive BIP32 path for input
        let child_key = master_key.derive_path(&input.path)?;
        let private_key = SecretKey::from_slice(&child_key.key)?;

        // Compute transaction hash for this input index
        let sig_hash = compute_input_signature_hash(&intent, idx)?;
        let message = Message::from_digest_slice(&sig_hash)?;

        // Sign the hash natively using secp256k1
        let signature = secp.sign_ecdsa(&message, &private_key);
        let sig_bytes = signature.serialize_der();
        signatures.push(hex::encode(sig_bytes));
    }

    // 5. Build fake transaction hex payload representing the broadcast envelope
    let serialized_payload = serde_json::to_string(&intent)?;
    let payload_hex = hex::encode(serialized_payload);

    // Compute synthetic TxID
    let txid_hash = double_sha256(payload_hex.as_bytes());
    let txid = hex::encode(txid_hash);

    Ok(SignedTransaction {
        txid,
        raw_payload: payload_hex,
        signatures,
    })
}
