import re
import glob

for filename in glob.glob('src/components/*.tsx'):
    with open(filename, 'r') as f:
        content = f.read()

    # The bad pattern:
    # if (activeWallet?.encryptedPassphrase) {
    #   const parts = ...
    #   decryptedP = parts.join('');
    # } else if (activeWallet?.encryptedPassphrase) {
    #   decryptedP = await decryptWithPassword(...)
    # }
    
    # We'll just replace the whole thing if it's there. Actually, let's just use regex.
    content = re.sub(r'if \(activeWallet\?\.encryptedPassphrase\) \{\s*const parts = await decryptWithPassword\([^)]+\);\s*decryptedP = parts\.join\(\'\'\);\s*\} else if \(activeWallet\?\.encryptedPassphrase\) \{', r'if (activeWallet?.encryptedPassphrase) {', content)
    
    content = re.sub(r'if \(isPasswordEnabled && activeWallet\?\.encryptedPassphrase && passwordInput\) \{\s*try \{\s*const parts = await decryptWithPassword\(activeWallet.encryptedPassphrase, passwordInput\);\s*const decrypted = parts\.join\(\'\'\);\s*setPassphrase\(decrypted\);\s*\} catch \(e\) \{\s*\}\s*\}', r'', content)
    
    with open(filename, 'w') as f:
        f.write(content)

