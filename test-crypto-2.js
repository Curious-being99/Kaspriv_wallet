import kaspa from '@kasdk/nodejs';
const password = "my-password";
const plaintext = "my-secret-data";
const ciphertext = kaspa.encryptXChaCha20Poly1305(plaintext, password);
console.log('Ciphertext:', ciphertext);
const decrypted = kaspa.decryptXChaCha20Poly1305(ciphertext, password);
console.log('Decrypted:', decrypted);
