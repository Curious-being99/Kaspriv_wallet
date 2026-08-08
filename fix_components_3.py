import re
import glob

def fix_file(filename):
    with open(filename, 'r') as f:
        content = f.read()

    # MobileSettingsView
    content = re.sub(
        r'const decryptedM = await decryptWithPassword\(activeWallet\.encryptedMnemonic\.ciphertext, activeWallet\.encryptedMnemonic\.salt, activeWallet\.encryptedMnemonic\.iv, seedPasswordInput\);\s*\} else if \(activeWallet\?\.encryptedMnemonic\) \{',
        '',
        content
    )
    content = re.sub(
        r'if \(activeWallet\?\.encryptedPassphrase\) \{\s*decryptedP = await decryptWithPassword\(\s*activeWallet\.encryptedPassphrase,\s*seedPasswordInput\s*\);\s*\} else if \(activeWallet\?\.encryptedPassphrase\) \{',
        'if (activeWallet?.encryptedPassphrase) {',
        content
    )

    with open(filename, 'w') as f:
        f.write(content)

for filename in glob.glob('src/components/*.tsx'):
    fix_file(filename)
