import re
import glob

def fix_file(filename):
    with open(filename, 'r') as f:
        content = f.read()

    # MobileSettingsView
    content = re.sub(
        r'const decryptedM = await \s*activeWallet\.encryptedMnemonic,\s*seedPasswordInput\s*\);',
        'const decryptedM = await decryptWithPassword(activeWallet.encryptedMnemonic.ciphertext, activeWallet.encryptedMnemonic.salt, activeWallet.encryptedMnemonic.iv, seedPasswordInput);',
        content
    )
    
    # SendModal
    content = re.sub(
        r'const decrypted = await \s*activeWallet\.encryptedMnemonic,\s*passwordInput\s*\);',
        'const decrypted = await decryptWithPassword(activeWallet.encryptedMnemonic.ciphertext, activeWallet.encryptedMnemonic.salt, activeWallet.encryptedMnemonic.iv, passwordInput);',
        content
    )

    with open(filename, 'w') as f:
        f.write(content)

for filename in glob.glob('src/components/*.tsx'):
    fix_file(filename)
