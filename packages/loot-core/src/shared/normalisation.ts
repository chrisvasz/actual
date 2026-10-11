const iMap: Record<string, string> = {
  ł: 'l',
  ø: 'o',
  ß: 'ss',
  œ: 'oe',
};
const iRegex = new RegExp(Object.keys(iMap).join('|'), 'g');

// Characters that normalising can change beyond lowercasing: anything
// outside ASCII, plus the two ASCII characters that count as diacritics
const needsNormalisingRegex = /[\u0080-\uFFFF^`]/;

export function getNormalisedString(value: string) {
  const lower = value.toLowerCase();
  // Most text is plain ASCII, so skip the much slower full normalisation
  if (!needsNormalisingRegex.test(lower)) {
    return lower;
  }
  return lower
    .replace(iRegex, m => iMap[m])
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}
