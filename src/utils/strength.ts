export type PassphraseStrength = 'empty' | 'weak' | 'fair' | 'good' | 'strong';

export interface StrengthResult {
  strength: PassphraseStrength;
  score: number; // 0 to 4
  color: string;
  label: string;
}

export const checkPassphraseStrength = (passphrase: string): StrengthResult => {
  if (!passphrase) {
    return { strength: 'empty', score: 0, color: 'transparent', label: '' };
  }

  let score = 0;
  if (passphrase.length > 6) score++;
  if (passphrase.length > 10) score++;
  if (/[A-Z]/.test(passphrase) && /[a-z]/.test(passphrase)) score++;
  if (/[0-9]/.test(passphrase) || /[^A-Za-z0-9]/.test(passphrase)) score++;

  switch (score) {
    case 0:
    case 1:
      return { strength: 'weak', score: 1, color: '#ef4444', label: 'Weak' };
    case 2:
      return { strength: 'fair', score: 2, color: '#f59e0b', label: 'Fair' };
    case 3:
      return { strength: 'good', score: 3, color: '#10b981', label: 'Good' };
    case 4:
    default:
      return { strength: 'strong', score: 4, color: '#70C7BA', label: 'Strong' };
  }
};
