use wasm_bindgen::prelude::*;
use argon2::{Argon2, PasswordHasher, PasswordVerifier, Params, Algorithm, Version};
use chacha20poly1305::{XChaCha20Poly1305, KeyInit, aead::{Aead, Payload}};
use chacha20poly1305::aead::generic_array::GenericArray;
use zeroize::{Zeroize, Zeroizing};
use secp256k1::{Secp256k1, Message, SecretKey, PublicKey};
use sha2::{Sha256, Digest};
use hmac::{Hmac, Mac};
use pbkdf2::pbkdf2;
use serde::{Serialize, Deserialize};

type HmacSha512 = Hmac<sha2::Sha512>;

#[derive(Serialize, Deserialize)]
pub struct EncryptedResult {
    pub ciphertext: String,
    pub salt: String,
    pub iv: String,
}

#[derive(Zeroize)]
struct SensitiveData {
    key_bytes: Vec<u8>,
}

impl Drop for SensitiveData {
    fn drop(&mut self) {
        self.key_bytes.zeroize();
    }
}

/// Safely derive a KEK using Argon2id with strict parameters.
#[wasm_bindgen]
pub fn derive_key_argon2id(password: &str, salt_hex: &str, m_cost: u32, t_cost: u32, p_cost: u32) -> Result<String, JsValue> {
    let mut secret_pwd = Zeroizing::new(password.as_bytes().to_vec());
    let salt = hex::decode(salt_hex).map_err(|e| JsValue::from_str(&format!("Invalid salt hex: {}", e)))?;
    
    // Setup Argon2id parameters (m_cost is in KiB)
    let params = Params::new(m_cost, t_cost, p_cost, Some(32))
        .map_err(|e| JsValue::from_str(&format!("Argon2 params error: {}", e)))?;
        
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    
    let mut output_key = [0u8; 32];
    argon2.hash_password_into(&secret_pwd, &salt, &mut output_key)
        .map_err(|e| JsValue::from_str(&format!("KDF Hash error: {}", e)))?;
        
    let res = hex::encode(output_key);
    output_key.zeroize();
    
    Ok(res)
}

/// Zero-Trust Two-Tier Encrypt with Password using Rust XChaCha20-Poly1305.
#[wasm_bindgen]
pub fn encrypt_with_password_rust(plaintext: &str, password: &str, context: &str) -> Result<JsValue, JsValue> {
    let mut secret_plain = Zeroizing::new(plaintext.as_bytes().to_vec());
    let mut secret_pwd = Zeroizing::new(password.as_bytes().to_vec());
    
    // Generate secure random salt (16 bytes) and KEK IV (24 bytes for XChaCha20)
    let mut salt = [0u8; 16];
    let mut kek_iv = [0u8; 24];
    let mut dek_iv = [0u8; 24];
    let mut random_dek = [0u8; 32];
    
    getrandom::getrandom(&mut salt).map_err(|e| JsValue::from_str(&format!("RNG salt error: {}", e)))?;
    getrandom::getrandom(&mut kek_iv).map_err(|e| JsValue::from_str(&format!("RNG KEK IV error: {}", e)))?;
    getrandom::getrandom(&mut dek_iv).map_err(|e| JsValue::from_str(&format!("RNG DEK IV error: {}", e)))?;
    getrandom::getrandom(&mut random_dek).map_err(|e| JsValue::from_str(&format!("RNG DEK generation error: {}", e)))?;
    
    // Derive KEK from password using Argon2id (aligned with JS production specs: 128MB, 6 iterations, 1 parallelism)
    let params = Params::new(131072, 6, 1, Some(32))
        .map_err(|e| JsValue::from_str(&format!("Argon2 params error: {}", e)))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    
    let mut kek_bytes = [0u8; 32];
    argon2.hash_password_into(&secret_pwd, &salt, &mut kek_bytes)
        .map_err(|e| JsValue::from_str(&format!("KDF Hash error: {}", e)))?;
        
    // Import keys into XChaCha20Poly1305 engines
    let kek_cipher = XChaCha20Poly1305::new_from_slice(&kek_bytes)
        .map_err(|e| JsValue::from_str(&format!("Cipher initialization error: {}", e)))?;
    kek_bytes.zeroize();
    
    let dek_cipher = XChaCha20Poly1305::new_from_slice(&random_dek)
        .map_err(|e| JsValue::from_str(&format!("DEK initialization error: {}", e)))?;
        
    // 1. Encrypt Payload with DEK (Data Encryption Key) with associated AAD context
    let payload = Payload {
        msg: &secret_plain,
        aad: context.as_bytes(),
    };
    let encrypted_payload_bytes = dek_cipher.encrypt(GenericArray::from_slice(&dek_iv), payload)
        .map_err(|e| JsValue::from_str(&format!("Payload encryption error: {}", e)))?;
        
    // 2. Encrypt DEK using KEK with associated dynamic AAD context (matching JS)
    let dek_payload = Payload {
        msg: &random_dek,
        aad: context.as_bytes(),
    };
    let encrypted_dek_bytes = kek_cipher.encrypt(GenericArray::from_slice(&kek_iv), dek_payload)
        .map_err(|e| JsValue::from_str(&format!("DEK wrapping error: {}", e)))?;
    random_dek.zeroize();
    
    // 3. Format into fully structured V2 record format: v2:dek_iv:encrypted_dek:encrypted_payload
    let ciphertext = format!(
        "v2:{}:{}:{}",
        hex::encode(dek_iv),
        hex::encode(encrypted_dek_bytes),
        hex::encode(encrypted_payload_bytes)
    );
    
    let result = EncryptedResult {
        ciphertext,
        salt: hex::encode(salt),
        iv: hex::encode(kek_iv),
    };
    
    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Zero-Trust Two-Tier Decrypt with Password using Rust XChaCha20-Poly1305.
#[wasm_bindgen]
pub fn decrypt_with_password_rust(ciphertext: &str, password: &str, salt_hex: &str, iv_hex: &str, context: &str) -> Result<String, JsValue> {
    let mut secret_pwd = Zeroizing::new(password.as_bytes().to_vec());
    let salt = hex::decode(salt_hex).map_err(|e| JsValue::from_str(&format!("Salt parse error: {}", e)))?;
    let kek_iv = hex::decode(iv_hex).map_err(|e| JsValue::from_str(&format!("KEK IV parse error: {}", e)))?;
    
    // Parse structured V2 layout: v2:dek_iv:encrypted_dek:encrypted_payload
    if !ciphertext.starts_with("v2:") {
        return Err(JsValue::from_str("Invalid format: Only v2 encrypted records are supported by the Rust core."));
    }
    
    let parts: Vec<&str> = ciphertext.split(':').collect();
    if parts.len() != 4 {
        return Err(JsValue::from_str("Malformed encrypted payload structure."));
    }
    
    let dek_iv = hex::decode(parts[1]).map_err(|e| JsValue::from_str(&format!("DEK IV parse error: {}", e)))?;
    let encrypted_dek = hex::decode(parts[2]).map_err(|e| JsValue::from_str(&format!("Encrypted DEK parse error: {}", e)))?;
    let encrypted_payload = hex::decode(parts[3]).map_err(|e| JsValue::from_str(&format!("Encrypted payload parse error: {}", e)))?;
    
    // Derive KEK (using the same 128MB, 6 iterations, 1 parallelism parameters)
    let params = Params::new(131072, 6, 1, Some(32))
        .map_err(|e| JsValue::from_str(&format!("Argon2 params error: {}", e)))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    
    let mut kek_bytes = [0u8; 32];
    argon2.hash_password_into(&secret_pwd, &salt, &mut kek_bytes)
        .map_err(|e| JsValue::from_str(&format!("KDF Hash error: {}", e)))?;
        
    let kek_cipher = XChaCha20Poly1305::new_from_slice(&kek_bytes)
        .map_err(|e| JsValue::from_str(&format!("Cipher initialization error: {}", e)))?;
    kek_bytes.zeroize();
    
    // Decrypt the DEK using kek_iv and dynamic AAD context (matching JS)
    let dek_payload = Payload {
        msg: &encrypted_dek,
        aad: context.as_bytes(),
    };
    let mut dek_bytes = kek_cipher.decrypt(GenericArray::from_slice(&kek_iv), dek_payload)
        .map_err(|e| JsValue::from_str(&format!("DEK decryption error: {}", e)))?;
        
    // Decrypt the payload using the decrypted DEK and dek_iv
    let dek_cipher = XChaCha20Poly1305::new_from_slice(&dek_bytes)
        .map_err(|e| JsValue::from_str(&format!("DEK initialization error: {}", e)))?;
    dek_bytes.zeroize();
    
    let payload = Payload {
        msg: &encrypted_payload,
        aad: context.as_bytes(),
    };
    let decrypted_bytes = dek_cipher.decrypt(GenericArray::from_slice(&dek_iv), payload)
        .map_err(|e| JsValue::from_str(&format!("Payload decryption error: {}", e)))?;
        
    let decrypted_str = String::from_utf8(decrypted_bytes)
        .map_err(|e| JsValue::from_str(&format!("UTF-8 decode error: {}", e)))?;
        
    Ok(decrypted_str)
}

/// Derive child keys and sign Kaspa transaction input hashes securely in Rust (Zero-Trust)
#[wasm_bindgen]
pub fn sign_input_hash_rust(seed_hex: &str, path: &str, hash_hex: &str) -> Result<String, JsValue> {
    let mut seed_bytes = hex::decode(seed_hex).map_err(|e| JsValue::from_str(&format!("Seed hex error: {}", e)))?;
    let hash_bytes = hex::decode(hash_hex).map_err(|e| JsValue::from_str(&format!("Hash hex error: {}", e)))?;
    
    if hash_bytes.len() != 32 {
        return Err(JsValue::from_str("Hash must be exactly 32 bytes (256-bit)."));
    }
    
    // Derive private key using hierarchical derivation algorithm (BIP32 child derivation)
    // We parse the path e.g. "m/44'/111111'/0'/0/0"
    let mut current_key = derive_master_key_bip32(&seed_bytes)?;
    seed_bytes.zeroize();
    
    let parts: Vec<&str> = path.split('/').collect();
    for part in parts.iter().skip(1) {
        let is_hardened = part.ends_with('\'');
        let index_str = if is_hardened { &part[..part.len() - 1] } else { part };
        let mut index: u32 = index_str.parse().map_err(|_| JsValue::from_str("Invalid path index"))?;
        if is_hardened {
            index += 0x8000_0000;
        }
        current_key = derive_child_key_bip32(&current_key, index)?;
    }
    
    // Extract the final private key (first 32 bytes of derived key material)
    let priv_key_bytes = &current_key[0..32];
    
    let secp = Secp256k1::signing_only();
    let secret_key = SecretKey::from_slice(priv_key_bytes)
        .map_err(|e| JsValue::from_str(&format!("Invalid derived secret key: {}", e)))?;
        
    let message = Message::from_digest_slice(&hash_bytes)
        .map_err(|e| JsValue::from_str(&format!("Message hash format error: {}", e)))?;
        
    // Sign the transaction input hash with ECDSA
    let signature = secp.sign_ecdsa(&message, &secret_key);
    let signature_der = signature.serialize_der();
    
    Ok(hex::encode(signature_der))
}

// Low-level BIP32 master key derivation helper
fn derive_master_key_bip32(seed: &[u8]) -> Result<Vec<u8>, JsValue> {
    let mut mac = HmacSha512::new_from_slice(b"Bitcoin seed")
        .map_err(|e| JsValue::from_str(&format!("HMAC init error: {}", e)))?;
    mac.update(seed);
    let result = mac.finalize().into_bytes();
    Ok(result.to_vec()) // Returns [SecretKey (32 bytes), ChainCode (32 bytes)]
}

// Low-level BIP32 child key derivation helper
fn derive_child_key_bip32(parent: &[u8], index: u32) -> Result<Vec<u8>, JsValue> {
    let parent_key = &parent[0..32];
    let chain_code = &parent[32..64];
    
    let mut mac = HmacSha512::new_from_slice(chain_code)
        .map_err(|e| JsValue::from_str(&format!("HMAC child init error: {}", e)))?;
        
    let is_hardened = index >= 0x8000_0000;
    if is_hardened {
        mac.update(&[0u8]);
        mac.update(parent_key);
    } else {
        // Derive public key for non-hardened paths
        let secp = Secp256k1::signing_only();
        let secret_key = SecretKey::from_slice(parent_key)
            .map_err(|e| JsValue::from_str("Invalid parent key"))?;
        let pub_key = PublicKey::from_secret_key(&secp, &secret_key);
        mac.update(&pub_key.serialize());
    }
    
    mac.update(&index.to_be_bytes());
    let result = mac.finalize().into_bytes();
    Ok(result.to_vec())
}

// =========================================================================
// Native JNI Bindings for direct Android Kotlin/Java Integration
// =========================================================================
#[cfg(target_os = "android")]
#[allow(non_snake_case)]
pub mod jni_bindings {
    use super::*;
    use jni::JNIEnv;
    use jni::objects::{JClass, JString};
    use jni::sys::jstring;

    #[no_mangle]
    pub extern "system" fn Java_com_kaspriv_wallet_RustCrypto_deriveKeyArgon2id(
        mut env: JNIEnv,
        _class: JClass,
        password: JString,
        salt_hex: JString,
        m_cost: jni::sys::jint,
        t_cost: jni::sys::jint,
        p_cost: jni::sys::jint,
    ) -> jstring {
        let pwd_str: String = env.get_string(&password).unwrap().into();
        let salt_str: String = env.get_string(&salt_hex).unwrap().into();

        match derive_key_argon2id(&pwd_str, &salt_str, m_cost as u32, t_cost as u32, p_cost as u32) {
            Ok(hex_key) => env.new_string(hex_key).unwrap().into_raw(),
            Err(err) => {
                let err_msg = format!("Argon2id Error: {:?}", err);
                env.throw_new("java/lang/RuntimeException", err_msg).unwrap();
                std::ptr::null_mut()
            }
        }
    }

    #[no_mangle]
    pub extern "system" fn Java_com_kaspriv_wallet_RustCrypto_signInputHash(
        mut env: JNIEnv,
        _class: JClass,
        seed_hex: JString,
        path: JString,
        hash_hex: JString,
    ) -> jstring {
        let seed_str: String = env.get_string(&seed_hex).unwrap().into();
        let path_str: String = env.get_string(&path).unwrap().into();
        let hash_str: String = env.get_string(&hash_hex).unwrap().into();

        match sign_input_hash_rust(&seed_str, &path_str, &hash_str) {
            Ok(signature_hex) => env.new_string(signature_hex).unwrap().into_raw(),
            Err(err) => {
                let err_msg = format!("Signing Error: {:?}", err);
                env.throw_new("java/lang/RuntimeException", err_msg).unwrap();
                std::ptr::null_mut()
            }
        }
    }
}

