with open('src/components/SendModal.tsx', 'r') as f:
    content = f.read()

content = content.replace("      return passphraseInput;\n    }\n    }", "      return passphraseInput;\n    }")

with open('src/components/SendModal.tsx', 'w') as f:
    f.write(content)
