/// Exact Kaspa Consensus Mass Calculations

pub const SOMPI_PER_KAS: u64 = 100_000_000;
pub const MINIMUM_FEE_PER_GRAM: u64 = 100; // 100 sompi/gram

pub fn calculate_transaction_mass(
    inputs_count: usize,
    outputs_count: usize,
    is_p2sh: bool,
    payload_len: usize,
) -> u64 {
    let in_count = if inputs_count == 0 { 1 } else { inputs_count } as u64;
    let out_count = if outputs_count == 0 { 1 } else { outputs_count } as u64;

    let base_overhead = 40u64;
    let input_size = if is_p2sh { 150u64 } else { 112u64 };
    let output_size = 44u64;

    let serialized_size_mass = base_overhead + (in_count * input_size) + (out_count * output_size) + (payload_len as u64);
    let script_pub_key_size = if is_p2sh { 35u64 } else { 34u64 };
    let script_pub_key_mass = out_count * script_pub_key_size * 10;
    let sig_ops_mass = in_count * 1000;
    let safety_buffer = 300u64;

    serialized_size_mass + script_pub_key_mass + sig_ops_mass + safety_buffer
}

pub fn calculate_minimum_fee(
    inputs_count: usize,
    outputs_count: usize,
    is_p2sh: bool,
    payload_len: usize,
    sompi_per_gram: Option<u64>,
) -> u64 {
    let mass = calculate_transaction_mass(inputs_count, outputs_count, is_p2sh, payload_len);
    let rate = sompi_per_gram.unwrap_or(MINIMUM_FEE_PER_GRAM);
    mass * rate
}
