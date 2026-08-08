import re

with open('src/context/WalletContext.tsx', 'r') as f:
    content = f.read()

else_block = """    } else {
      const activePassword = passwordState || passwordRef.current;
      setIsPasswordEnabled(false);
      setPasswordState(null);
      await saveSetting('wallet_password_enabled', false);
      await removeSetting('wallet_password_canary');
      setIsLocked(false);
      
      if (activePassword) {
        const updatedWallets = await Promise.all(wallets.map(async (w) => {
          let decryptedMnemonic = w.mnemonic;
          let decryptedPassphrase = w.passphrase;
          
          if (!decryptedMnemonic && w.encryptedMnemonic) {
            try {
              decryptedMnemonic = await decryptWithPassword(w.encryptedMnemonic.ciphertext, w.encryptedMnemonic.salt, w.encryptedMnemonic.iv, activePassword);
            } catch (e) {
              // ignore
            }
          }
          
          if (!decryptedPassphrase && w.encryptedPassphrase) {
            try {
              decryptedPassphrase = await decryptWithPassword(w.encryptedPassphrase.ciphertext, w.encryptedPassphrase.salt, w.encryptedPassphrase.iv, activePassword);
            } catch (e) {
              // ignore
            }
          }
          
          return {
            ...w,
            mnemonic: decryptedMnemonic,
            passphrase: decryptedPassphrase,
            encryptedMnemonic: undefined,
            encryptedPassphrase: undefined
          };
        }));
        setWallets(updatedWallets);
      } else {
        setWallets(prev => prev.map(w => ({
          ...w,
          encryptedPassphrase: undefined,
          encryptedMnemonic: undefined
        })));
      }
      showToast('Password security disabled', 'info');
    }"""

# Using regex to replace the else block in setPassword
content = re.sub(r'\} else \{\s*setIsPasswordEnabled\(false\);\s*setPasswordState\(null\);\s*await saveSetting\(\'wallet_password_enabled\', false\);\s*await removeSetting\(\'wallet_password_canary\'\);\s*setIsLocked\(false\);\s*setWallets\(prev => prev.map\(w => \(\{\s*\.\.\.w,\s*encryptedPassphrase: undefined\s*\}\)\)\);\s*showToast\(\'Password security disabled\', \'info\'\);\s*\}', else_block, content)

with open('src/context/WalletContext.tsx', 'w') as f:
    f.write(content)
