import re
import glob

for filename in glob.glob('src/components/*.tsx'):
    with open(filename, 'r') as f:
        content = f.read()
    
    # Imports
    content = re.sub(r'decryptMnemonicFromFragments,\s*', '', content)
    content = re.sub(r'encryptMnemonicToFragments,\s*', '', content)
    content = re.sub(r'decryptPieces,\s*', '', content)
    content = re.sub(r'encryptPieces,\s*', '', content)

    # Variables
    content = content.replace('encryptedMnemonicFragments', 'encryptedMnemonic')
    content = content.replace('encryptedPassphraseFragments', 'encryptedPassphrase')

    with open(filename, 'w') as f:
        f.write(content)

