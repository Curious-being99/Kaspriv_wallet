import re

with open('src/context/WalletContext.tsx', 'r') as f:
    content = f.read()

# Replace the broken encryptedPassphrase decryption block
broken_passphrase_block_1 = """          if (activeWallet.encryptedPassphrase) {
            const parts = await decryptWithPassword(activeWallet.encryptedPassphrase, password);
            passToUse = parts.join('');
          } else if (activeWallet.encryptedPassphrase) {"""
fixed_passphrase_block_1 = """          if (activeWallet.encryptedPassphrase) {"""
content = content.replace(broken_passphrase_block_1, fixed_passphrase_block_1)

broken_passphrase_block_2 = """          if (activeWallet.encryptedPassphrase) {
            const parts = await decryptWithPassword(activeWallet.encryptedPassphrase, activePassword);
            passphraseToUse = parts.join('');
          } else if (activeWallet.encryptedPassphrase) {"""
fixed_passphrase_block_2 = """          if (activeWallet.encryptedPassphrase) {"""
content = content.replace(broken_passphrase_block_2, fixed_passphrase_block_2)


broken_mnemonic_block_1 = """          if (activeWallet.encryptedMnemonic) {
            seedToUse = await decryptWithPassword(activeWallet.encryptedMnemonic.ciphertext, activeWallet.encryptedMnemonic.salt, activeWallet.encryptedMnemonic.iv, password);
          } else if (activeWallet.encryptedMnemonic) {"""
fixed_mnemonic_block_1 = """          if (activeWallet.encryptedMnemonic) {"""
content = content.replace(broken_mnemonic_block_1, fixed_mnemonic_block_1)

broken_mnemonic_block_2 = """          if (activeWallet.encryptedMnemonic) {
            seedToUse = await decryptWithPassword(activeWallet.encryptedMnemonic.ciphertext, activeWallet.encryptedMnemonic.salt, activeWallet.encryptedMnemonic.iv, activePassword);
          } else if (activeWallet.encryptedMnemonic) {"""
fixed_mnemonic_block_2 = """          if (activeWallet.encryptedMnemonic) {"""
content = content.replace(broken_mnemonic_block_2, fixed_mnemonic_block_2)

with open('src/context/WalletContext.tsx', 'w') as f:
    f.write(content)

