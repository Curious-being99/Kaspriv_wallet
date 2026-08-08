import re

with open('src/context/WalletContext.tsx', 'r') as f:
    content = f.read()

bad_block = """          if (firstW.encryptedMnemonic) {
            await decryptWithPassword(firstW.encryptedMnemonic.ciphertext, firstW.encryptedMnemonic.salt, firstW.encryptedMnemonic.iv, password);
           
            await decryptWithPassword(
              firstW.encryptedMnemonic.ciphertext,
              firstW.encryptedMnemonic.salt,
              firstW.encryptedMnemonic.iv,
              password
            );
          }"""
good_block = """          if (firstW.encryptedMnemonic) {
            await decryptWithPassword(firstW.encryptedMnemonic.ciphertext, firstW.encryptedMnemonic.salt, firstW.encryptedMnemonic.iv, password);
          }"""

content = content.replace(bad_block, good_block)

with open('src/context/WalletContext.tsx', 'w') as f:
    f.write(content)
