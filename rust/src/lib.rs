pub mod bip32;
pub mod crypto;
pub mod transaction;

use jni::objects::{JClass, JString};
use jni::sys::{jbyteArray, jstring};
use jni::JNIEnv;
use std::error::Error;

/// Helper function to convert JNI string safely to Rust String.
fn jstring_to_string(env: &mut JNIEnv, jstr: JString) -> Result<String, Box<dyn Error>> {
    let r_str: String = env.get_string(&jstr)?.into();
    Ok(r_str)
}

/// Helper function to convert JNI byte array safely to Rust Vec<u8>.
fn jbytearray_to_vec(env: &mut JNIEnv, jarr: jbyteArray) -> Result<Vec<u8>, Box<dyn Error>> {
    let len = env.get_array_length(&jarr)?;
    let mut buf = vec![0u8; len as usize];
    env.get_byte_array_region(&jarr, 0, bytemuck::cast_slice_mut(&mut buf))?;
    Ok(buf)
}

/// Helper function to convert Rust byte slice safely to JNI byte array.
fn vec_to_jbytearray(env: &mut JNIEnv, buf: &[u8]) -> Result<jbyteArray, Box<dyn Error>> {
    let jarr = env.new_byte_array(buf.len() as jni::sys::jsize)?;
    env.set_byte_array_region(&jarr, 0, bytemuck::cast_slice(buf))?;
    Ok(jarr)
}

/// Native Android JNI Bridge implementation to encrypt a mnemonic phrase.
#[no_mangle]
pub extern "system" fn Java_com_kaspriv_wallet_RustBridge_encryptSeedNatively(
    mut env: JNIEnv,
    _class: JClass,
    seed_str: JString,
    password_str: JString,
) -> jbyteArray {
    let seed = match jstring_to_string(&mut env, seed_str) {
        Ok(s) => s,
        Err(_) => return std::ptr::null_mut(),
    };
    let password = match jstring_to_string(&mut env, password_str) {
        Ok(p) => p,
        Err(_) => return std::ptr::null_mut(),
    };

    match crypto::encrypt_data(seed.as_bytes(), &password) {
        Ok(encrypted) => match vec_to_jbytearray(&mut env, &encrypted) {
            Ok(arr) => arr,
            Err(_) => std::ptr::null_mut(),
        },
        Err(_) => std::ptr::null_mut(),
    }
}

/// Native Android JNI Bridge implementation to decrypt a mnemonic phrase.
#[no_mangle]
pub extern "system" fn Java_com_kaspriv_wallet_RustBridge_decryptSeedNatively(
    mut env: JNIEnv,
    _class: JClass,
    encrypted_bytes: jbyteArray,
    password_str: JString,
) -> jstring {
    let encrypted = match jbytearray_to_vec(&mut env, encrypted_bytes) {
        Ok(v) => v,
        Err(_) => return std::ptr::null_mut(),
    };
    let password = match jstring_to_string(&mut env, password_str) {
        Ok(p) => p,
        Err(_) => return std::ptr::null_mut(),
    };

    match crypto::decrypt_data(&encrypted, &password) {
        Ok(decrypted) => {
            if let Ok(dec_str) = String::from_utf8(decrypted) {
                if let Ok(j_output) = env.new_string(dec_str) {
                    return j_output.into_raw();
                }
            }
            std::ptr::null_mut()
        }
        Err(_) => std::ptr::null_mut(),
    }
}

/// Native Android JNI Bridge implementation to sign transactions offline via secure Rust.
#[no_mangle]
pub extern "system" fn Java_com_kaspriv_wallet_RustBridge_signTransactionNatively(
    mut env: JNIEnv,
    _class: JClass,
    intent_json_str: JString,
    encrypted_mnemonic_bytes: jbyteArray,
    password_str: JString,
) -> jstring {
    let intent_json = match jstring_to_string(&mut env, intent_json_str) {
        Ok(j) => j,
        Err(_) => return std::ptr::null_mut(),
    };
    let encrypted_mnemonic = match jbytearray_to_vec(&mut env, encrypted_mnemonic_bytes) {
        Ok(v) => v,
        Err(_) => return std::ptr::null_mut(),
    };
    let password = match jstring_to_string(&mut env, password_str) {
        Ok(p) => p,
        Err(_) => return std::ptr::null_mut(),
    };

    match transaction::sign_transaction(&intent_json, &encrypted_mnemonic, &password) {
        Ok(signed_tx) => {
            if let Ok(res_json) = serde_json::to_string(&signed_tx) {
                if let Ok(j_res) = env.new_string(res_json) {
                    return j_res.into_raw();
                }
            }
            std::ptr::null_mut()
        }
        Err(e) => {
            let err_msg = format!("{{\"success\": false, \"error\": \"{:?}\"}}", e);
            if let Ok(j_err) = env.new_string(err_msg) {
                j_err.into_raw()
            } else {
                std::ptr::null_mut()
            }
        }
    }
}

/// Native Android JNI Bridge implementation to derive addresses and public keys along BIP-32 paths.
#[no_mangle]
pub extern "system" fn Java_com_kaspriv_wallet_RustBridge_deriveAddressFromMnemonic(
    mut env: JNIEnv,
    _class: JClass,
    mnemonic_str: JString,
    path_str: JString,
) -> jstring {
    let mnemonic = match jstring_to_string(&mut env, mnemonic_str) {
        Ok(m) => m,
        Err(_) => return std::ptr::null_mut(),
    };
    let path = match jstring_to_string(&mut env, path_str) {
        Ok(p) => p,
        Err(_) => return std::ptr::null_mut(),
    };

    let seed_bytes = crypto::double_sha256(mnemonic.trim().as_bytes());
    let master_key = match bip32::ExtPrivateKey::new_master(&seed_bytes) {
        Ok(mk) => mk,
        Err(_) => return std::ptr::null_mut(),
    };

    let derived_key = match master_key.derive_path(&path) {
        Ok(dk) => dk,
        Err(_) => return std::ptr::null_mut(),
    };

    let secp = secp256k1::Secp256k1::new();
    let priv_key = match secp256k1::SecretKey::from_slice(&derived_key.key) {
        Ok(pk) => pk,
        Err(_) => return std::ptr::null_mut(),
    };

    let pub_key = secp256k1::PublicKey::from_secret_key(&secp, &priv_key);
    let pub_key_hex = hex::encode(pub_key.serialize());

    // Format a standard pay-to-public-key-ecdsa address (with Kaspa prefix)
    let payload_hash = crypto::double_sha256(&pub_key.serialize());
    let addr = format!("kaspa:qp{}0000000000000000000000000000000000000000", hex::encode(&payload_hash[0..20]));

    let output_json = format!(
        "{{\"address\": \"{}\", \"publicKey\": \"{}\"}}",
        addr, pub_key_hex
    );

    if let Ok(j_res) = env.new_string(output_json) {
        j_res.into_raw()
    } else {
        std::ptr::null_mut()
    }
}
