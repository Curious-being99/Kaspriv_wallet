use blake2::digest::consts::U32;
use blake2::{Blake2b, Digest as Blake2Digest};
use secp256k1::{schnorr::Signature, KeyPair, Message, Secp256k1, SecretKey, XOnlyPublicKey};
use sha2::{Digest, Sha256};
use zeroize::{Zeroize, ZeroizeOnDrop};

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct SafePrivateKey {
    pub key_bytes: [u8; 32],
}

impl SafePrivateKey {
    pub fn from_hex(hex_str: &str) -> Result<Self, String> {
        let clean = hex_str.trim().trim_start_matches("0x");
        let bytes = hex::decode(clean).map_err(|e| format!("Invalid hex: {}", e))?;
        if bytes.len() != 32 {
            return Err("Private key must be exactly 32 bytes".to_string());
        }
        let mut key_bytes = [0u8; 32];
        key_bytes.copy_from_slice(&bytes);
        Ok(Self { key_bytes })
    }

    pub fn get_schnorr_public_key_hex(&self) -> Result<String, String> {
        let secp = Secp256k1::new();
        let sk = SecretKey::from_slice(&self.key_bytes)
            .map_err(|e| format!("Invalid secret key: {}", e))?;
        let keypair = KeyPair::from_secret_key(&secp, &sk);
        let (xonly, _) = XOnlyPublicKey::from_keypair(&keypair);
        Ok(hex::encode(xonly.serialize()))
    }

    /// Direct lightweight BIP-340 Schnorr signature over 32-byte hash (single-pass, zero intermediate copies)
    pub fn sign_schnorr_hash(&self, hash32: &[u8; 32]) -> Result<String, String> {
        let secp = Secp256k1::new();
        let sk = SecretKey::from_slice(&self.key_bytes)
            .map_err(|e| format!("Invalid secret key: {}", e))?;
        let keypair = KeyPair::from_secret_key(&secp, &sk);
        let msg = Message::from_digest_slice(hash32)
            .map_err(|e| format!("Invalid digest slice: {}", e))?;
        let sig: Signature = secp.sign_schnorr(&msg, &keypair);
        Ok(hex::encode(sig.as_ref()))
    }

    /// Direct signature of message bytes using single-pass Kaspa Blake2b-256 hash
    pub fn sign_message_lightweight(&self, message: &[u8]) -> Result<String, String> {
        let hash = blake2b_256(message);
        self.sign_schnorr_hash(&hash)
    }
}

/// Single-pass Blake2b-256 hash (Kaspa native sighash specification)
pub fn blake2b_256(data: &[u8]) -> [u8; 32] {
    let mut hasher = Blake2b::<U32>::new();
    hasher.update(data);
    let res = hasher.finalize();
    let mut out = [0u8; 32];
    out.copy_from_slice(&res);
    out
}

/// Single-pass SHA-256 for lightweight digests
pub fn single_sha256(data: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(data);
    let res = hasher.finalize();
    let mut out = [0u8; 32];
    out.copy_from_slice(&res);
    out
}
