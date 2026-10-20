// SQL LIKE patterns as `UNICODE_LIKE` matches them: `%` is any run of
// characters, `?` any one character, and a backslash escapes either (or
// itself).
// Shared so a search run in JS matches what the same search in SQL does.

const REGEX_SPECIAL = /[.*+^${}()|[\]\\?]/g;

/** A case-insensitive RegExp matching the LIKE `pattern`. */
export function likePatternToRegex(pattern: string): RegExp {
  let regexStr = '';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '\\' && i + 1 < pattern.length) {
      const next = pattern[i + 1];
      if (next === '%' || next === '?' || next === '\\') {
        // escaped wildcard — treat as literal character
        regexStr += next.replace(REGEX_SPECIAL, '\\$&'); // ? added here
        i += 2;
        continue;
      }
    }
    if (ch === '%') {
      regexStr += '.*';
    } else if (ch === '?') {
      regexStr += '.';
    } else {
      regexStr += ch.replace(REGEX_SPECIAL, '\\$&');
    }
    i++;
  }
  return new RegExp(regexStr, 'i');
}
