import re

with open('src/context/WalletContext.tsx', 'r') as f:
    content = f.read()

# Remove decryptMnemonicFromFragments, encryptMnemonicToFragments, encryptPieces, decryptPieces from imports
content = re.sub(r'encryptMnemonicToFragments,\s*', '', content)
content = re.sub(r'decryptMnemonicFromFragments,\s*', '', content)
content = re.sub(r'encryptPieces,\s*', '', content)
content = re.sub(r'decryptPieces,\s*', '', content)

# Replace encryptedMnemonicFragments with encryptedMnemonic
content = content.replace('encryptedMnemonicFragments', 'encryptedMnemonic')

# Replace encryptedPassphraseFragments with encryptedPassphrase
content = content.replace('encryptedPassphraseFragments', 'encryptedPassphrase')

# Let's fix the assignments in WalletContext
# Wait, encryptPieces([passphrase], activePassword) -> encryptWithPassword(passphrase, activePassword)
content = re.sub(r'await encryptPieces\(\[([^\]]+)\],\s*([^)]+)\)', r'await encryptWithPassword(\1, \2)', content)

with open('src/context/WalletContext.tsx', 'w') as f:
    f.write(content)

