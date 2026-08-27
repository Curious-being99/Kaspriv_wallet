use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use hmac::SimpleHmac;
use pbkdf2::pbkdf2;
use rand::{rngs::OsRng, RngCore};
use sha2::Sha256;
use std::error::Error;

/// Derives a 256-bit AES key from a user-supplied password using PBKDF2-HMAC-SHA256.
pub fn derive_key(password: &str, salt: &[u8]) -> Result<[u8; 32], Box<dyn Error>> {
    let mut derived_key: [u8; 32] = core::array::from_fn(|_| 0);
    pbkdf2::<SimpleHmac<Sha256>>(
        password.as_bytes(),
        salt,
        10_000, // Safe mobile iteration count
        &mut derived_key,
    )
    .map_err(|e| format!("PBKDF2 derivation failed: {:?}", e))?;
    Ok(derived_key)
}

/// Encrypts raw data using AES-256-GCM with a derived password key.
pub fn encrypt_data(data: &[u8], password: &str) -> Result<Vec<u8>, Box<dyn Error>> {
    // 1. Generate secure 16-byte random salt and 12-byte random nonce
    let salt: [u8; 16] = {
        let mut s = [0u8; 16];
        OsRng.fill_bytes(&mut s);
        s
    };
    let nonce_bytes: [u8; 12] = {
        let mut n = [0u8; 12];
        OsRng.fill_bytes(&mut n);
        n
    };

    // 2. Derive encryption key
    let key = derive_key(password, &salt)?;

    // 3. Initialize AES-256-GCM cipher
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("Cipher initialization failed: {:?}", e))?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    // 4. Encrypt the data
    let ciphertext = cipher
        .encrypt(nonce, data)
        .map_err(|e| format!("Encryption failure: {:?}", e))?;

    // 5. Package output: [Salt (16 bytes)] + [Nonce (12 bytes)] + [Ciphertext]
    let mut packaged = Vec::with_capacity(16 + 12 + ciphertext.len());
    packaged.extend_from_slice(&salt);
    packaged.extend_from_slice(&nonce_bytes);
    packaged.extend_from_slice(&ciphertext);

    Ok(packaged)
}

/// Decrypts data using AES-256-GCM with a derived password key.
pub fn decrypt_data(packaged_data: &[u8], password: &str) -> Result<Vec<u8>, Box<dyn Error>> {
    if packaged_data.len() < 28 {
        return Err("Packaged ciphertext too short".into());
    }

    // 1. Unpack salt, nonce, and ciphertext
    let salt = &packaged_data[0..16];
    let nonce_bytes = &packaged_data[16..28];
    let ciphertext = &packaged_data[28..];

    // 2. Derive key using the unpacked salt
    let key = derive_key(password, salt)?;

    // 3. Initialize AES-256-GCM cipher
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("Cipher initialization failed: {:?}", e))?;
    let nonce = Nonce::from_slice(nonce_bytes);

    // 4. Decrypt and authenticate
    let decrypted = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Authentication failed: invalid password or corrupted data")?;

    Ok(decrypted)
}

/// Computes a standard double SHA-256 hash.
pub fn double_sha256(data: &[u8]) -> [u8; 32] {
    use sha2::Digest;
    let mut hasher = Sha256::new();
    hasher.update(data);
    let first = hasher.finalize();
    
    let mut second_hasher = Sha256::new();
    second_hasher.update(first);
    let result = second_hasher.finalize();
    
    let mut out = [0u8; 32];
    out.copy_from_slice(&result);
    out
}
