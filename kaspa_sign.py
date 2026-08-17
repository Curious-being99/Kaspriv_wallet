import hashlib
from typing import List, Dict, Any, Union
import struct
from coincurve import PrivateKey

# Kaspa protocol signing hash constant key
SIGHASH_KEY = b"TransactionSigningHash"

def blake2b_keyed(data: bytes, key: bytes = SIGHASH_KEY, dk_len: int = 32) -> bytes:
    """
    Computes a keyed Blake2b hash as specified in the Kaspa consensus protocol.
    """
    h = hashlib.blake2b(key=key, digest_size=dk_len)
    h.update(data)
    return h.digest()

def write_uint16_le(val: int) -> bytes:
    return struct.pack("<H", val)

def write_uint32_le(val: int) -> bytes:
    return struct.pack("<I", val)

def write_uint64_le(val: int) -> bytes:
    return struct.pack("<Q", val)

def hex_to_bytes(hex_str: str) -> bytes:
    if hex_str.startswith("0x"):
        hex_str = hex_str[2:]
    return bytes.fromhex(hex_str)

def sign_transaction_with_python(
    tx_data: Dict[str, Any],
    private_keys: Union[bytes, Dict[str, bytes]]
) -> Dict[str, Any]:
    """
    Translates the Kaspa manual transaction signing logic into Python.
    Supports either a single private key (as bytes) or a dictionary mapping
    derivation paths (e.g. "m/44'/111111'/0'/0/0") to private key bytes.
    """
    
    # 1. Pre-calculate the consensus hashes for inputs (outpoints, sequences, and sig-op counts)
    outpoint_parts = []
    seq_parts = []
    sig_op_count_parts = []
    
    for inpt in tx_data["inputs"]:
        prev_out = inpt["previousOutpoint"]
        outpoint_parts.append(hex_to_bytes(prev_out["transactionId"]))
        outpoint_parts.append(write_uint32_le(prev_out["index"]))
        
        seq_parts.append(write_uint64_le(0))  # Sequence defaults to 0
        sig_op_count_parts.append(bytes([1]))  # SigOpCount defaults to 1
        
    previous_outpoints_hash = blake2b_keyed(b"".join(outpoint_parts))
    sequences_hash = blake2b_keyed(b"".join(seq_parts))
    sig_op_counts_hash = blake2b_keyed(b"".join(sig_op_count_parts))

    # 2. Pre-calculate outputs hash
    output_parts = []
    for out in tx_data["outputs"]:
        amt = int(out["amount"])
        spk_bytes = hex_to_bytes(out["scriptPublicKey"]["scriptPublicKey"])
        output_parts.append(write_uint64_le(amt))
        output_parts.append(write_uint16_le(0))  # ScriptPublicKey version
        output_parts.append(write_uint64_le(len(spk_bytes)))
        output_parts.append(spk_bytes)
        
    outputs_hash = blake2b_keyed(b"".join(output_parts))
    payload_hash = bytes(32)  # Zero payload for standard transfers
    subnetwork_id_bytes = bytes(20)  # Standard subnetwork

    # 3. Sign each input independently using its corresponding private key
    for i, inpt in enumerate(tx_data["inputs"]):
        utxo = inpt["utxo"]
        amt = int(utxo.get("utxoEntry", {}).get("amount", utxo.get("amount", 0)))
        
        # Extract the script public key hex
        spk_hex = (
            utxo.get("utxoEntry", {}).get("scriptPublicKey", {}).get("scriptPublicKey")
            or utxo.get("scriptPublicKey")
        )
        script_bytes = hex_to_bytes(spk_hex)

        # Retrieve the correct active private key for this input's path
        if isinstance(private_keys, bytes):
            active_key_bytes = private_keys
        else:
            # Match by derivation path, default to index 0 if not found
            path = utxo.get("derivationPath") or "m/44'/111111'/0'/0/0"
            active_key_bytes = private_keys.get(path, list(private_keys.values())[0])

        # Get Schnorr-compliant x-only public key from private key
        pk_obj = PrivateKey(active_key_bytes)
        pub_key_bytes = pk_obj.public_key.format(compressed=True)[1:]  # 32-byte X-Only key
        pub_key_hex = pub_key_bytes.hex()

        # Build BIP-340/Kaspa preimage structure
        preimage = b"".join([
            write_uint16_le(0),  # Transaction version
            previous_outpoints_hash,
            sequences_hash,
            sig_op_counts_hash,
            hex_to_bytes(inpt["previousOutpoint"]["transactionId"]),
            write_uint32_le(inpt["previousOutpoint"]["index"]),
            write_uint16_le(0),  # Input script version
            write_uint64_le(len(script_bytes)),
            script_bytes,
            write_uint64_le(amt),
            write_uint64_le(0),  # Input sequence
            bytes([1]),  # SigOpCount
            outputs_hash,
            write_uint64_le(int(tx_data.get("lockTime", 0))),
            subnetwork_id_bytes,
            write_uint64_le(0),  # Gas
            payload_hash,
            bytes([0x01])  # Hash Type (SIGHASH_ALL)
        ])

        # Compute sighash
        sig_hash = blake2b_keyed(preimage)

        # Sign using BIP-340 Schnorr signature
        raw_signature = pk_obj.sign_schnorr(sig_hash)
        
        # Append Hash Type byte (01) to the signature
        sig_with_sighash = f"{raw_signature.hex()}01"

        # Determine if it is a P2SH (script hash) input
        is_p2sh = (
            tx_data.get("addressType") == "P2SH"
            or ":p" in utxo.get("address", "")
            or spk_hex.startswith("aa20")
        )

        if is_p2sh:
            # Build P2SH execution script pushing signature + redeem script
            # OP_PUSH32 <pubkey> OP_CHECKSIG
            redeem_script = f"20{pub_key_hex}ac"
            redeem_bytes = hex_to_bytes(redeem_script)
            
            # Form standard OP_PUSH prefix for redeem script length
            if len(redeem_bytes) <= 75:
                push_prefix = f"{len(redeem_bytes):02x}"
            elif len(redeem_bytes) <= 255:
                push_prefix = f"4c{len(redeem_bytes):02x}"
            else:
                push_prefix = f"4d{struct.pack('<H', len(redeem_bytes)).hex()}"
                
            inpt["signatureScript"] = f"41{sig_with_sighash}{push_prefix}{redeem_script}"
        else:
            # Standard P2PKH pushes the 65-byte Schnorr signature
            inpt["signatureScript"] = f"41{sig_with_sighash}"

    # Return clean, fully-serialized Kaspa-compliant transaction structure
    return {
        "version": 0,
        "inputs": [
            {
                "previousOutpoint": i["previousOutpoint"],
                "signatureScript": i["signatureScript"],
                "sequence": i.get("sequence", 0),
                "sigOpCount": i.get("sigOpCount", 1)
            }
            for i in tx_data["inputs"]
        ],
        "outputs": tx_data["outputs"],
        "lockTime": tx_data.get("lockTime", 0),
        "subnetworkId": "0000000000000000000000000000000000000000"
    }

if __name__ == "__main__":
    print("[SUCCESS] Kaspa transaction signing script imported successfully.")
