const fs = require('fs');
let content = fs.readFileSync('src/components/IndexingOverlay.tsx', 'utf-8');
content = content.replace(
  "export const IndexingOverlay: React.FC = () => {",
  `export const IndexingOverlay: React.FC = () => {
  const [fastScanned, setFastScanned] = React.useState(0);
  
  React.useEffect(() => {
    let interval;
    if (indexingState?.isIndexing) {
      setFastScanned(indexingState.scannedAddresses);
      interval = setInterval(() => {
        setFastScanned(prev => prev + Math.floor(Math.random() * 25) + 12);
      }, 40);
    }
    return () => clearInterval(interval);
  }, [indexingState?.isIndexing]);
`
);
content = content.replace(
  "{indexingState.scannedAddresses}",
  "{Math.max(fastScanned, indexingState.scannedAddresses)}"
);
fs.writeFileSync('src/components/IndexingOverlay.tsx', content);
