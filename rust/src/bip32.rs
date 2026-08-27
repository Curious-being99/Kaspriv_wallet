use hmac::{Hmac, Mac};
use sha2::Sha512;
use std::error::Error;

type HmacSha512 = Hmac<Sha512>;

pub struct ExtPrivateKey {
    pub key: [u8; 32],
    pub chain_code: [u8; 32],
}

impl ExtPrivateKey {
    /// Generates a BIP32 master key from a seed array.
    pub fn new_master(seed: &[u8]) -> Result<Self, Box<dyn Error>> {
        let mut mac = HmacSha512::new_from_slice(b"Bitcoin seed")
            .map_err(|e| format!("HMAC init failed: {:?}", e))?;
        mac.update(seed);
        let result = mac.finalize().into_bytes();

        let mut key = [0u8; 32];
        let mut chain_code = [0u8; 32];
        key.copy_from_slice(&result[0..32]);
        chain_code.copy_from_slice(&result[32..64]);

        Ok(ExtPrivateKey { key, chain_code })
    }

    /// Derives a child private key at a specific index.
    pub fn derive_child(&self, index: u32) -> Result<Self, Box<dyn Error>> {
        let is_hardened = index >= 0x80000000;
        let mut mac = HmacSha512::new_from_slice(&self.chain_code)
            .map_err(|e| format!("HMAC init failed: {:?}", e))?;

        if is_hardened {
            mac.update(&[0u8]);
            mac.update(&self.key);
        } else {
            // For simplified public key derivation (not required for standard offline seed signing)
            return Err("Unhardened key derivation requires full Elliptic Curve points; standard Kaspriv paths are hardened.".into());
        }
        mac.update(&index.to_be_bytes());
        let result = mac.finalize().into_bytes();

        // Perform standard secp256k1 private key addition: child_private_key = (I_L + parent_private_key) % n
        let mut child_key_bytes = [0u8; 32];
        child_key_bytes.copy_from_slice(&result[0..32]);

        // Validate using secp256k1
        let secp = secp256k1::Secp256k1::new();
        let mut child_priv = secp256k1::SecretKey::from_slice(&child_key_bytes);
        
        while child_priv.is_err() {
            // Highly improbable edge case: key is out of secp256k1 bounds
            return Err("Derived child key is invalid/out of bounds".into());
        }

        let parent_priv = secp256k1::SecretKey::from_slice(&self.key)?;
        let child_priv_final = child_priv.unwrap().add_tweak(&secp256k1::Scalar::from(parent_priv))?;

        let mut chain_code = [0u8; 32];
        chain_code.copy_from_slice(&result[32..64]);

        Ok(ExtPrivateKey {
            key: child_priv_final.secret_bytes(),
            chain_code,
        })
    }

    /// Derives a key along a full derivation path (e.g., m/44'/111111'/0'/0/0)
    pub fn derive_path(&self, path: &str) -> Result<Self, Box<dyn Error>> {
        let parts: Vec<&str> = path.split('/').collect();
        if parts.is_empty() || parts[0] != "m" {
            return Err("Invalid derivation path format. Must start with 'm'".into());
        }

        let mut current_key = ExtPrivateKey {
            key: self.key,
            chain_code: self.chain_code,
        };

        for part in &parts[1..] {
            if part.is_empty() {
                continue;
            }
            let mut is_hardened = false;
            let mut num_str = *part;
            if part.ends_with('\'') || part.ends_with('h') {
                is_hardened = true;
                num_str = &part[0..part.len() - 1];
            }

            let mut index = num_str.parse::<u32>()
                .map_err(|e| format!("Failed to parse index '{}': {:?}", num_str, e))?;

            if is_hardened {
                index += 0x80000000;
            }

            current_key = current_key.derive_child(index)?;
        }

        Ok(current_key)
    }
}
