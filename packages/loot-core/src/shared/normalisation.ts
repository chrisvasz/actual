// Letters `toLowerCase` keeps apart that are the same letter ignoring case
// (a RegExp's `i` flag matches them): final sigma, micro sign, Greek symbol
// variants and old Cyrillic forms, each to the usual lowercase letter
const CASE_VARIANTS: Record<string, string> = {
  '\u00b5': '\u03bc',
  '\u0345': '\u03b9',
  '\u1fbe': '\u03b9',
  '\u03d0': '\u03b2',
  '\u03f5': '\u03b5',
  '\u03d1': '\u03b8',
  '\u03f0': '\u03ba',
  '\u03d6': '\u03c0',
  '\u03f1': '\u03c1',
  '\u03c2': '\u03c3',
  '\u03d5': '\u03c6',
  '\u1c80': '\u0432',
  '\u1c81': '\u0434',
  '\u1c82': '\u043e',
  '\u1c83': '\u0441',
  '\u1c84': '\u0442',
  '\u1c85': '\u0442',
  '\u1c86': '\u044a',
  '\u1c87': '\u0463',
  '\u1c88': '\ua64b',
  '\u1e9b': '\u1e61',
};
const CASE_VARIANT = new RegExp(
  `[${Object.keys(CASE_VARIANTS).join('')}]`,
  'g',
);

/** `text` lowercased, with every letter in a single lowercase form. */
export function foldCase(text: string): string {
  return text.toLowerCase().replace(CASE_VARIANT, ch => CASE_VARIANTS[ch]);
}

// Letters a search matches as plain ones, and the case variants, replaced
// in the same pass
const iMap: Record<string, string> = {
  ł: 'l',
  ø: 'o',
  ß: 'ss',
  œ: 'oe',
  ...CASE_VARIANTS,
};
const iRegex = new RegExp(Object.keys(iMap).join('|'), 'g');

export function getNormalisedString(value: string) {
  return value
    .toLowerCase()
    .replace(iRegex, m => iMap[m])
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}
