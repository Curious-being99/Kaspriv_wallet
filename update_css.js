const fs = require('fs');
let content = fs.readFileSync('src/index.css', 'utf-8');
content = content.replace(/\/\* Gboard Dark Theme Styles \*\/[\s\S]*/, `/* Gboard Dark Theme Styles */
.gboard-dark-theme {
    background-color: transparent !important;
    padding: 8px 4px !important;
}
.gboard-dark-theme .hg-row {
    margin-bottom: 6px !important;
}
.gboard-dark-theme .hg-row:last-child {
    margin-bottom: 0 !important;
}
.gboard-dark-theme .hg-button {
    background: #131924 !important;
    color: #F1F5F9 !important;
    border: 1px solid #1F2937 !important;
    border-radius: 6px !important;
    box-shadow: none !important;
    margin: 0 3px !important;
    padding: 0 !important;
    height: 48px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-size: 20px !important;
    font-weight: 400 !important;
    transition: background 0.1s, border-color 0.1s !important;
}
.gboard-dark-theme .hg-button:active {
    background: #1F2937 !important;
    border-color: #374151 !important;
}
.gboard-dark-theme .hg-button.hg-functionBtn {
    background: #090D12 !important;
    color: #94A3B8 !important;
    font-size: 16px !important;
    border-color: #1F2937 !important;
}
.gboard-dark-theme .hg-button.hg-activeButton {
    background: #1F2937 !important;
    color: #70C7BA !important;
    border-color: #70C7BA !important;
}
.gboard-dark-theme .hg-button-space {
    flex-grow: 4 !important;
    max-width: 50% !important;
}
.gboard-dark-theme .hg-button-shift,
.gboard-dark-theme .hg-button-backspace {
    flex-grow: 1.5 !important;
    max-width: 15% !important;
    background: #090D12 !important;
}
.gboard-dark-theme .hg-button-enter {
    background: #70C7BA !important;
    color: #090D12 !important;
    border-color: #70C7BA !important;
    flex-grow: 1.5 !important;
    max-width: 15% !important;
}
.gboard-dark-theme .hg-button-enter:active {
    background: #5CA398 !important;
}
/* Half indent on row 2 */
.gboard-dark-theme .hg-row:nth-child(2) {
    padding: 0 5% !important;
}
`);
fs.writeFileSync('src/index.css', content);
