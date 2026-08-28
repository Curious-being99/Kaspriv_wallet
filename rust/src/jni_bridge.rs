use jni::objects::{JClass, JString};
use jni::sys::jstring;
use jni::JNIEnv;
use crate::crypto::SafePrivateKey;
use crate::mass::calculate_transaction_mass;
use crate::tx::{create_and_sign_transaction, TxBuildParams};

#[no_mangle]
pub extern "system" fn Java_com_kaspriv_wallet_crypto_NativeKaspaCore_calculateMass(
    _env: JNIEnv,
    _class: JClass,
    inputs_count: i32,
    outputs_count: i32,
    is_p2sh: bool,
    payload_len: i32,
) -> i64 {
    calculate_transaction_mass(
        inputs_count as usize,
        outputs_count as usize,
        is_p2sh,
        payload_len as usize,
    ) as i64
}

#[no_mangle]
pub extern "system" fn Java_com_kaspriv_wallet_crypto_NativeKaspaCore_buildAndSignTx(
    mut env: JNIEnv,
    _class: JClass,
    params_json: JString,
) -> jstring {
    let json_str: String = match env.get_string(&params_json) {
        Ok(s) => s.into(),
        Err(_) => {
            let res = env.new_string("{\"error\": \"Invalid JString\"}").unwrap();
            return res.into_raw();
        }
    };

    let params: TxBuildParams = match serde_json::from_str(&json_str) {
        Ok(p) => p,
        Err(e) => {
            let err_json = format!("{{\"error\": \"JSON deserialize error: {}\"}}", e);
            let res = env.new_string(err_json).unwrap();
            return res.into_raw();
        }
    };

    match create_and_sign_transaction(params) {
        Ok(tx_payload) => {
            let out_str = serde_json::to_string(&tx_payload).unwrap_or_else(|_| "{}".to_string());
            let res = env.new_string(out_str).unwrap();
            res.into_raw()
        }
        Err(e) => {
            let err_json = format!("{{\"error\": \"{}\"}}", e);
            let res = env.new_string(err_json).unwrap();
            res.into_raw()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kaspriv_wallet_crypto_NativeKaspaCore_signMessageLightweight(
    mut env: JNIEnv,
    _class: JClass,
    private_key_hex: JString,
    message_utf8: JString,
) -> jstring {
    let pk_str: String = match env.get_string(&private_key_hex) {
        Ok(s) => s.into(),
        Err(_) => {
            let res = env.new_string("").unwrap();
            return res.into_raw();
        }
    };
    let msg_str: String = match env.get_string(&message_utf8) {
        Ok(s) => s.into(),
        Err(_) => {
            let res = env.new_string("").unwrap();
            return res.into_raw();
        }
    };

    match SafePrivateKey::from_hex(&pk_str) {
        Ok(key) => match key.sign_message_lightweight(msg_str.as_bytes()) {
            Ok(sig) => {
                let res = env.new_string(sig).unwrap();
                res.into_raw()
            }
            Err(_) => {
                let res = env.new_string("").unwrap();
                res.into_raw()
            }
        },
        Err(_) => {
            let res = env.new_string("").unwrap();
            res.into_raw()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kaspriv_wallet_crypto_NativeKaspaCore_deriveSchnorrPublicKey(
    mut env: JNIEnv,
    _class: JClass,
    private_key_hex: JString,
) -> jstring {
    let pk_str: String = match env.get_string(&private_key_hex) {
        Ok(s) => s.into(),
        Err(_) => {
            let res = env.new_string("").unwrap();
            return res.into_raw();
        }
    };

    match SafePrivateKey::from_hex(&pk_str) {
        Ok(key) => match key.get_schnorr_public_key_hex() {
            Ok(pub_hex) => {
                let res = env.new_string(pub_hex).unwrap();
                res.into_raw()
            }
            Err(_) => {
                let res = env.new_string("").unwrap();
                res.into_raw()
            }
        },
        Err(_) => {
            let res = env.new_string("").unwrap();
            res.into_raw()
        }
    }
}
