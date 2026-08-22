const kaspa = require('@kasdk/nodejs');
const password = "my-password";
const plaintext = "my-secret-data";
const salt = Buffer.alloc(16, 0); // Simplified salt for test
const key = kaspa.argon2sha256ivFromText(password, salt); // Just guessing the signature here, let's verify
console.log('Key:', key);
