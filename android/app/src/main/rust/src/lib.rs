#![allow(non_snake_case)]

use jni::JNIEnv;
use jni::objects::{JClass, JString};
use jni::sys::{jboolean, jstring};
use bip39::{Mnemonic, MnemonicType, Language};
use rand::rngs::OsRng;

// -------------------------------------------------------------------------
// generateMnemonic() -> String
// -------------------------------------------------------------------------
#[no_mangle]
pub extern "system" fn Java_com_kaspriv_wallet_core_KaspaNativeCore_generateMnemonic<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
) -> jstring {
    let mnemonic = Mnemonic::new(MnemonicType::Words24, Language::English);
    let output = env.new_string(mnemonic.phrase()).expect("Couldn't create java string!");
    output.into_raw()
}

// -------------------------------------------------------------------------
// validateMnemonic(String) -> Boolean
// -------------------------------------------------------------------------
#[no_mangle]
pub extern "system" fn Java_com_kaspriv_wallet_core_KaspaNativeCore_validateMnemonic<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    mnemonic_jstring: JString<'local>,
) -> jboolean {
    let mnemonic_str: String = env.get_string(&mnemonic_jstring).expect("Couldn't get java string!").into();
    
    match Mnemonic::from_phrase(&mnemonic_str, Language::English) {
        Ok(_) => 1,
        Err(_) => 0,
    }
}

// -------------------------------------------------------------------------
// deriveAddress(String, String?, String, Boolean) -> String
// -------------------------------------------------------------------------
#[no_mangle]
pub extern "system" fn Java_com_kaspriv_wallet_core_KaspaNativeCore_deriveAddress<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    mnemonic_jstring: JString<'local>,
    _password_jstring: JString<'local>, // Can be null
    _derivation_path_jstring: JString<'local>,
    is_p2sh: jboolean,
) -> jstring {
    // 1. Get the mnemonic phrase from Java
    let mnemonic_str: String = env.get_string(&mnemonic_jstring).expect("Couldn't get java string!").into();
    
    // NOTE: For full Kaspa derivation, you would use kaspa-bip32 and kaspa-addresses here.
    // If is_p2sh == 1, we derive a Pay-To-Script-Hash (P2SH) address.
    // Real implementation:
    // let seed = Mnemonic::from_phrase(&mnemonic_str, Language::English).unwrap().to_seed("");
    // let xprv = XPrv::new(&seed).unwrap();
    // let derived = xprv.derive_path("m/44'/111111'/0'/0/0").unwrap();
    
    // Pseudo-derivation for UI display:
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    mnemonic_str.hash(&mut hasher);
    let hash = hasher.finish();
    
    // Kaspa P2PK addresses start with 'q', P2SH addresses start with 'p'
    let prefix = if is_p2sh != 0 { "p" } else { "q" };
    let simulated_address = format!("kaspa:{}{:038x}", prefix, hash);
    
    let output = env.new_string(simulated_address).expect("Couldn't create java string!");
    output.into_raw()
}

// -------------------------------------------------------------------------
// signTransaction(String, String, String?) -> String
// -------------------------------------------------------------------------
#[no_mangle]
pub extern "system" fn Java_com_kaspriv_wallet_core_KaspaNativeCore_signTransaction<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    tx_json_jstring: JString<'local>,
    _mnemonic_jstring: JString<'local>,
    _password_jstring: JString<'local>,
) -> jstring {
    let tx_json_str: String = env.get_string(&tx_json_jstring).expect("Couldn't get java string!").into();
    
    // NOTE: Call rusty-kaspa kaspa-wallet-core here to deserialize and sign the tx natively.
    let signed_tx_mock = format!("{{\"signed\": true, \"original\": {}}}", tx_json_str);
    
    let output = env.new_string(signed_tx_mock).expect("Couldn't create java string!");
    output.into_raw()
}
