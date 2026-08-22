const fs = require('fs');
let code = fs.readFileSync('src/utils/storage.ts', 'utf8');
code = code.replace(/    \}\n  \}\n\}\n\n\}/, '    }\n  }\n}\n');
fs.writeFileSync('src/utils/storage.ts', code);
