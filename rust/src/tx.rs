use serde::{Deserialize, Serialize};
use crate::crypto::SafePrivateKey;
use crate::mass::calculate_minimum_fee;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UtxoEntry {
    pub transaction_id: String,
    pub index: u32,
    pub amount_sompi: u64,
    pub script_public_key: String,
    pub block_daa_score: u64,
    pub is_coinbase: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Outpoint {
    #[serde(rename = "transactionId")]
    pub transaction_id: String,
    pub index: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionInput {
    #[serde(rename = "previousOutpoint")]
    pub previous_outpoint: Outpoint,
    #[serde(rename = "signatureScript")]
    pub signature_script: String,
    pub sequence: u64,
    #[serde(rename = "sigOpCount")]
    pub sig_op_count: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptPublicKey {
    pub version: u16,
    #[serde(rename = "scriptPublicKey")]
    pub script_public_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionOutput {
    pub amount: u64,
    #[serde(rename = "scriptPublicKey")]
    pub script_public_key: ScriptPublicKey,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KaspaRpcTransaction {
    pub version: u16,
    pub inputs: Vec<TransactionInput>,
    pub outputs: Vec<TransactionOutput>,
    #[serde(rename = "lockTime")]
    pub lock_time: u64,
    #[serde(rename = "subnetworkId")]
    pub subnetwork_id: String,
    pub gas: u64,
    pub payload: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BroadcastPayload {
    pub transaction: KaspaRpcTransaction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TxBuildParams {
    pub utxos: Vec<UtxoEntry>,
    pub destination_spk_hex: String,
    pub amount_sompi: u64,
    pub change_spk_hex: String,
    pub fee_sompi: Option<u64>,
    pub private_key_hex: Option<String>,
}

pub fn create_and_sign_transaction(params: TxBuildParams) -> Result<BroadcastPayload, String> {
    let total_in: u64 = params.utxos.iter().map(|u| u.amount_sompi).sum();
    let fee = params.fee_sompi.unwrap_or_else(|| {
        calculate_minimum_fee(params.utxos.len(), 2, false, 0, None)
    });

    if total_in < params.amount_sompi + fee {
        return Err(format!(
            "Insufficient funds: available {} sompi, required {} (amount: {}, fee: {})",
            total_in,
            params.amount_sompi + fee,
            params.amount_sompi,
            fee
        ));
    }

    let change = total_in - params.amount_sompi - fee;

    // Generate Inputs
    let mut inputs = Vec::with_capacity(params.utxos.len());
    for u in &params.utxos {
        let sig_script = if let Some(ref pk_hex) = params.private_key_hex {
            let key = SafePrivateKey::from_hex(pk_hex)?;
            let dummy_hash = [0u8; 32];
            let sig_hex = key.sign_schnorr_hash(&dummy_hash)?;
            format!("41{}01", sig_hex)
        } else {
            format!("41{}01", "00".repeat(64))
        };

        inputs.push(TransactionInput {
            previous_outpoint: Outpoint {
                transaction_id: u.transaction_id.to_lowercase(),
                index: u.index,
            },
            signature_script: sig_script,
            sequence: 0,
            sigOpCount: 1,
        });
    }

    // Generate Outputs
    let mut outputs = Vec::new();
    outputs.push(TransactionOutput {
        amount: params.amount_sompi,
        script_public_key: ScriptPublicKey {
            version: 0,
            script_public_key: params.destination_spk_hex,
        },
    });

    // Dust threshold for Kaspa is typically > 10,000 sompi
    if change > 10_000 {
        outputs.push(TransactionOutput {
            amount: change,
            script_public_key: ScriptPublicKey {
                version: 0,
                script_public_key: params.change_spk_hex,
            },
        });
    }

    let tx = KaspaRpcTransaction {
        version: 0,
        inputs,
        outputs,
        lock_time: 0,
        subnetwork_id: "0000000000000000000000000000000000000000".to_string(),
        gas: 0,
        payload: "".to_string(),
    };

    Ok(BroadcastPayload { transaction: tx })
}
