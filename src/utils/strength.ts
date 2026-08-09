import zxcvbn from 'zxcvbn';

export type PassphraseStrength = 'empty' | 'weak' | 'fair' | 'good' | 'strong';

export interface StrengthResult {
  strength: PassphraseStrength;
  score: number; // 0 to 4
  color: string;
  label: string;
  feedback?: {
    warning?: string;
    suggestions?: string[];
  };
  crackTimeDisplay?: string;
  minimumLengthMet?: boolean;
}

export const MIN_PASSPHRASE_LENGTH = 8;

export const checkPassphraseStrength = (passphrase: string): StrengthResult => {
  if (!passphrase) {
    return {
      strength: 'empty',
      score: 0,
      color: 'transparent',
      label: '',
      feedback: { warning: '', suggestions: [] },
      minimumLengthMet: false,
    };
  }

  const result = zxcvbn(passphrase);
  let score = result.score; // 0 to 4

  const warnings: string[] = [];
  const suggestions: string[] = [...(result.feedback.suggestions || [])];

  if (result.feedback.warning) {
    warnings.push(result.feedback.warning);
  }

  // Enforce minimum length constraint (8 characters)
  const minimumLengthMet = passphrase.length >= MIN_PASSPHRASE_LENGTH;
  if (!minimumLengthMet) {
    score = Math.min(score, 1); // Cap at 'weak' (1) if shorter than 8 chars
    if (!warnings.some(w => w.includes('at least'))) {
      warnings.unshift(`Password must be at least ${MIN_PASSPHRASE_LENGTH} characters long`);
    }
  }

  let strength: PassphraseStrength = 'weak';
  let color = '#ef4444';
  let label = 'Weak';

  switch (score) {
    case 0:
    case 1:
      strength = 'weak';
      color = '#ef4444';
      label = 'Weak';
      break;
    case 2:
      strength = 'fair';
      color = '#f59e0b';
      label = 'Fair';
      break;
    case 3:
      strength = 'good';
      color = '#10b981';
      label = 'Good';
      break;
    case 4:
    default:
      strength = 'strong';
      color = '#70C7BA';
      label = 'Strong';
      break;
  }

  return {
    strength,
    score,
    color,
    label,
    feedback: {
      warning: warnings.join('. '),
      suggestions,
    },
    crackTimeDisplay: result.crack_times_display?.offline_slow_hashing_1e4_per_second as string || '',
    minimumLengthMet,
  };
};

