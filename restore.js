import fs from 'fs';
let content = fs.readFileSync('src/utils/kaspa/api.ts', 'utf8');

content = content.replace(
  /export async function fetchKaspaAddressesUtxos\(addresses: string\[\], network\?: string\): Promise<KaspaUtxo\[\] \| null> \{\s*if \(!addresses \|\| addresses\.length === 0\) return \[\];\s*const cleanAddresses = addresses\.map\(addr => addr\.trim\(\)\);\s*const inferredNetwork = network \|\| \(cleanAddresses\[0\]\?\.startsWith\('kaspatest'\) \? 'testnet' : \(cleanAddresses\[0\]\?\.startsWith\('kaspadev'\) \? 'devnet' : 'mainnet'\)\);\s*const candidates = getCandidateApiUrls\(inferredNetwork\);/,
  `export async function fetchKaspaAddressesUtxos(addresses: string[], network?: string): Promise<KaspaUtxo[] | null> {
  if (!addresses || addresses.length === 0) return [];
  const baseUrl = getKaspaApiUrl();
  const cleanAddresses = addresses.map(addr => addr.trim());
  const inferredNetwork = network || (cleanAddresses[0]?.startsWith('kaspatest') ? 'testnet' : (cleanAddresses[0]?.startsWith('kaspadev') ? 'devnet' : 'mainnet'));
  const candidates = getCandidateApiUrls(inferredNetwork);`
);

fs.writeFileSync('src/utils/kaspa/api.ts', content);
