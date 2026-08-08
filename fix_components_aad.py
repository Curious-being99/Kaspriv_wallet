import re
import glob

def fix_file(filename):
    with open(filename, 'r') as f:
        content = f.read()

    # Find all instances of decryptWithPassword that use encryptedPassphrase, and ensure they have the AAD context
    # It might be split across lines, e.g.:
    # await decryptWithPassword(
    #   activeWallet.encryptedPassphrase.ciphertext,
    #   ...
    #   password
    # );
    
    # We can do this with regex
    content = re.sub(
        r'await decryptWithPassword\(\s*activeWallet\.encryptedPassphrase\.ciphertext,\s*activeWallet\.encryptedPassphrase\.salt,\s*activeWallet\.encryptedPassphrase\.iv,\s*([a-zA-Z0-9_]+)\s*\)',
        r'await decryptWithPassword(activeWallet.encryptedPassphrase.ciphertext, activeWallet.encryptedPassphrase.salt, activeWallet.encryptedPassphrase.iv, \1, "KASPRIV-WALLET-v1|KASPA-MAINNET|PASSPHRASE")',
        content
    )
    
    with open(filename, 'w') as f:
        f.write(content)

for filename in glob.glob('src/components/*.tsx'):
    fix_file(filename)
