use std::fs;
use std::path::Path;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("Starting Rust patcher for Kaspa WASM Transaction & Broadcast logic...");

    // 1. Patch src/utils/kaspa/wasmTx.ts
    let wasm_tx_path = Path::new("src/utils/kaspa/wasmTx.ts");
    if wasm_tx_path.exists() {
        let mut wasm_tx_content = fs::read_to_string(wasm_tx_path)?;
        
        // Define target and replacement strings
        let target_wasm = "return {\n    value: safeAmount,\n    scriptPublicKey: spkHex,\n  };";
        let replacement_wasm = "return {\n      value: safeAmount,\n      scriptPublicKey: new ScriptPublicKey(Number(outTx.scriptPublicKey?.version || 0), spkHex),\n    };";
        
        if wasm_tx_content.contains(target_wasm) {
            wasm_tx_content = wasm_tx_content.replace(target_wasm, replacement_wasm);
            fs::write(wasm_tx_path, wasm_tx_content)?;
            println!("Successfully patched src/utils/kaspa/wasmTx.ts");
        } else {
            // Also handle alternative space formatting variations
            let target_wasm_alt = "return {\n      value: safeAmount,\n      scriptPublicKey: spkHex,\n    };";
            if wasm_tx_content.contains(target_wasm_alt) {
                wasm_tx_content = wasm_tx_content.replace(target_wasm_alt, replacement_wasm);
                fs::write(wasm_tx_path, wasm_tx_content)?;
                println!("Successfully patched src/utils/kaspa/wasmTx.ts (alternative spacing)");
            } else {
                println!("Note: src/utils/kaspa/wasmTx.ts already fully updated or target block not found.");
            }
        }
    } else {
        println!("Error: src/utils/kaspa/wasmTx.ts does not exist.");
    }

    // 2. Patch src/services/kaspaBroadcastService.ts
    let broadcast_svc_path = Path::new("src/services/kaspaBroadcastService.ts");
    if broadcast_svc_path.exists() {
        let mut broadcast_content = fs::read_to_string(broadcast_svc_path)?;
        
        let target_broadcast = "let localComputedTxId = knownTxId;\n  try {\n    localComputedTxId = await computeTxIdWasm(rawTx);\n  } catch (e) {";
        let replacement_broadcast = "let localComputedTxId = knownTxId || rawTx.id || rawTx.transactionId;\n  try {\n    if (!localComputedTxId) {\n      localComputedTxId = await computeTxIdWasm(rawTx);\n    }\n  } catch (e) {";
        
        if broadcast_content.contains(target_broadcast) {
            broadcast_content = broadcast_content.replace(target_broadcast, replacement_broadcast);
            fs::write(broadcast_svc_path, broadcast_content)?;
            println!("Successfully patched src/services/kaspaBroadcastService.ts");
        } else {
            println!("Note: src/services/kaspaBroadcastService.ts already updated or target block not found.");
        }
    } else {
        println!("Error: src/services/kaspaBroadcastService.ts does not exist.");
    }

    println!("Patcher finished successfully!");
    Ok(())
}
