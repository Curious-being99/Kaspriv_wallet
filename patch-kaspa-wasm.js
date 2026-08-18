import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'node_modules', 'kaspa-wasm', 'kaspa_wasm.js');

try {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    const target = 'const { TextDecoder, TextEncoder, inspect } = require(`util`);';
    const replacement = 'const inspect = require(`util`).inspect; const TextDecoder = globalThis.TextDecoder; const TextEncoder = globalThis.TextEncoder;';
    
    if (content.includes(target)) {
      content = content.replace(target, replacement);
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Successfully patched kaspa-wasm for browser/ESM environments.');
    } else {
      console.log('kaspa-wasm already patched or target signature not found.');
    }
  } else {
    console.log('node_modules/kaspa-wasm/kaspa_wasm.js not found. Skipping patch.');
  }
} catch (error) {
  console.warn('Warning: Failed to patch kaspa-wasm:', error);
}
process.exit(0);
