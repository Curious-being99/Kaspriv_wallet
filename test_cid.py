import hashlib
import struct

def covenant_id_hash(data: bytes) -> bytes:
    tag    = b"CovenantID"
    tagged = tag + data
    return hashlib.blake2b(tagged, digest_size=32).digest()

def encode_outpoint(tx_id: bytes, index: int) -> bytes:
    return tx_id + struct.pack("<I", index)

def encode_output(out_idx: int, amount: int, script_pub_key: bytes) -> bytes:
    encoded  = struct.pack("<I", out_idx)
    encoded += struct.pack("<Q", amount)
    encoded += struct.pack("<I", len(script_pub_key))
    encoded += script_pub_key
    return encoded

def encode_auth_outputs(auth_outputs: list[tuple[int, int, bytes]]) -> bytes:
    encoded = b""
    encoded += struct.pack("<I", len(auth_outputs))
    for out_idx, amount, script_pub_key in auth_outputs:
        encoded += encode_output(out_idx, amount, script_pub_key)
    return encoded

def compute_covenant_id_standard(tx_id: bytes, input_index: int, auth_outputs: list[tuple[int, int, bytes]]) -> bytes:
    outpoint    = encode_outpoint(tx_id, input_index)
    outputs_enc = encode_auth_outputs(auth_outputs)
    preimage = outpoint + outputs_enc
    return covenant_id_hash(preimage)

tx_id = bytes.fromhex("a1b2c3d4e5f6" * 5 + "a1b2")
auth_outputs = [(0, 100_000_000_000, bytes.fromhex("112233"))]
print(compute_covenant_id_standard(tx_id, 0, auth_outputs).hex())
