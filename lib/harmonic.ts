export function getCamelotStyles(key: string): { bg: string, text: string } {
  if (!key) return { bg: 'var(--color-slate-800)', text: 'var(--color-slate-400)' };

  const camelotColors: Record<string, { bg: string, text: string }> = {
    '1A': { bg: '#01D5C9', text: '#000000' },
    '2A': { bg: '#34DD8D', text: '#000000' },
    '3A': { bg: '#72E45C', text: '#000000' },
    '4A': { bg: '#BEE33C', text: '#000000' },
    '5A': { bg: '#E9D22D', text: '#000000' },
    '6A': { bg: '#E29B27', text: '#000000' },
    '7A': { bg: '#E3523B', text: '#ffffff' },
    '8A': { bg: '#E61E5E', text: '#ffffff' },
    '9A': { bg: '#DF1996', text: '#ffffff' },
    '10A': { bg: '#A11AF3', text: '#ffffff' },
    '11A': { bg: '#3A2BF6', text: '#ffffff' },
    '12A': { bg: '#0492E3', text: '#ffffff' },
    
    '1B': { bg: '#2DF1E5', text: '#000000' },
    '2B': { bg: '#5EF5AB', text: '#000000' },
    '3B': { bg: '#8EFD78', text: '#000000' },
    '4B': { bg: '#D7FB58', text: '#000000' },
    '5B': { bg: '#FFEA49', text: '#000000' },
    '6B': { bg: '#FDB540', text: '#000000' },
    '7B': { bg: '#FC6B55', text: '#000000' },
    '8B': { bg: '#FF3878', text: '#ffffff' },
    '9B': { bg: '#F934B0', text: '#ffffff' },
    '10B': { bg: '#BD34FF', text: '#ffffff' },
    '11B': { bg: '#5545FF', text: '#ffffff' },
    '12B': { bg: '#20AFFF', text: '#ffffff' },
  };

  return camelotColors[key.toUpperCase()] || { bg: 'var(--color-slate-800)', text: 'var(--color-slate-400)' };
}

export function isSmartMatch(masterKey: string, masterBpm: number, targetKey: string, targetBpm: number): boolean {
  if (!masterKey || !targetKey || !masterBpm || !targetBpm) return true;

  // BPM check: Within +/- 5%
  const bpmDiff = Math.abs(masterBpm - targetBpm) / masterBpm;
  if (bpmDiff > 0.05) return false;

  // Exact match
  if (masterKey.toUpperCase() === targetKey.toUpperCase()) return true;

  // Camelot adjacency check
  const m = masterKey.toUpperCase().match(/^(\d+)([AB])$/);
  const t = targetKey.toUpperCase().match(/^(\d+)([AB])$/);
  
  if (m && t) {
    const mNum = parseInt(m[1]);
    const mLet = m[2];
    const tNum = parseInt(t[1]);
    const tLet = t[2];

    const isSameLetter = mLet === tLet;
    const isAdjacentNumber = (mNum === tNum + 1) || (mNum === tNum - 1) || (mNum === 1 && tNum === 12) || (mNum === 12 && tNum === 1);
    const isSameNumberDiffLetter = (mNum === tNum) && (mLet !== tLet);

    if (isSameLetter && isAdjacentNumber) return true;
    if (isSameNumberDiffLetter) return true;
  }

  return false;
}
