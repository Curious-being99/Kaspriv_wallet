import re

with open('src/context/WalletContext.tsx', 'r') as f:
    content = f.read()

# Canaries
content = content.replace(
    'await encryptWithPassword("kaspriv-canary", password);',
    'await encryptWithPassword("kaspriv-canary", password, "KASPRIV-WALLET-v1|KASPA-MAINNET|CANARY");'
)
content = content.replace(
    'await decryptWithPassword(\n          canaryObj.ciphertext,\n          canaryObj.salt,\n          canaryObj.iv,\n          password\n        );',
    'await decryptWithPassword(canaryObj.ciphertext, canaryObj.salt, canaryObj.iv, password, "KASPRIV-WALLET-v1|KASPA-MAINNET|CANARY");'
)

# Passphrases (WalletContext)
content = content.replace(
    'await encryptWithPassword(passphrase, activePassword);',
    'await encryptWithPassword(passphrase, activePassword, "KASPRIV-WALLET-v1|KASPA-MAINNET|PASSPHRASE");'
)
content = content.replace(
    'await encryptWithPassword(passToUse, password);',
    'await encryptWithPassword(passToUse, password, "KASPRIV-WALLET-v1|KASPA-MAINNET|PASSPHRASE");'
)
content = content.replace(
    'await decryptWithPassword(activeWallet.encryptedPassphrase, password);',
    'await decryptWithPassword(activeWallet.encryptedPassphrase, password, "KASPRIV-WALLET-v1|KASPA-MAINNET|PASSPHRASE");'
)
content = content.replace(
    'await decryptWithPassword(activeWallet.encryptedPassphrase, activePassword);',
    'await decryptWithPassword(activeWallet.encryptedPassphrase, activePassword, "KASPRIV-WALLET-v1|KASPA-MAINNET|PASSPHRASE");'
)
content = content.replace(
    'await decryptWithPassword(w.encryptedPassphrase.ciphertext, w.encryptedPassphrase.salt, w.encryptedPassphrase.iv, activePassword);',
    'await decryptWithPassword(w.encryptedPassphrase.ciphertext, w.encryptedPassphrase.salt, w.encryptedPassphrase.iv, activePassword, "KASPRIV-WALLET-v1|KASPA-MAINNET|PASSPHRASE");'
)

with open('src/context/WalletContext.tsx', 'w') as f:
    f.write(content)

import glob
for filename in glob.glob('src/components/*.tsx'):
    with open(filename, 'r') as f:
        c = f.read()
    c = c.replace(
        'await decryptWithPassword(activeWallet.encryptedPassphrase, seedPasswordInput);',
        'await decryptWithPassword(activeWallet.encryptedPassphrase, seedPasswordInput, "KASPRIV-WALLET-v1|KASPA-MAINNET|PASSPHRASE");'
    )
    c = c.replace(
        'await decryptWithPassword(activeWallet.encryptedPassphrase, passwordInput);',
        'await decryptWithPassword(activeWallet.encryptedPassphrase, passwordInput, "KASPRIV-WALLET-v1|KASPA-MAINNET|PASSPHRASE");'
    )
    c = c.replace(
        'await decryptWithPassword(\n                activeWallet.encryptedPassphrase.ciphertext,\n                activeWallet.encryptedPassphrase.salt,\n                activeWallet.encryptedPassphrase.iv,\n                passwordInput\n              );',
        'await decryptWithPassword(activeWallet.encryptedPassphrase.ciphertext, activeWallet.encryptedPassphrase.salt, activeWallet.encryptedPassphrase.iv, passwordInput, "KASPRIV-WALLET-v1|KASPA-MAINNET|PASSPHRASE");'
    )
    c = c.replace(
        'await decryptWithPassword(\n              activeWallet.encryptedPassphrase.ciphertext,\n              activeWallet.encryptedPassphrase.salt,\n              activeWallet.encryptedPassphrase.iv,\n              passwordInput\n            );',
        'await decryptWithPassword(activeWallet.encryptedPassphrase.ciphertext, activeWallet.encryptedPassphrase.salt, activeWallet.encryptedPassphrase.iv, passwordInput, "KASPRIV-WALLET-v1|KASPA-MAINNET|PASSPHRASE");'
    )
    with open(filename, 'w') as f:
        f.write(c)
