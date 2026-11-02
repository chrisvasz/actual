import { foldCase } from '#shared/normalisation';

// LIKE for SQLite, which only folds ASCII case. Matches anywhere in the
// value, ignoring case: `%` is any run of characters (line breaks too, as
// in SQLite's LIKE) and `?` any one character; `\%`, `\?` and `\\` are
// those characters themselves.
//
// It runs once per row, so it matches directly instead of building a
// RegExp from the pattern on each call.

// A pattern's parts between `%`s: the text itself, or with a `?`, its
// characters with `null` for each `?`
type Segment = string | Array<string | null>;

function parsePattern(pattern: string): Segment[] {
  if (!pattern.includes('\\') && !pattern.includes('?')) {
    // The usual search: text between `%`s
    return pattern.split('%').filter(segment => segment.length > 0);
  }
  const segments: Array<Array<string | null>> = [[]];
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    const next = pattern[i + 1];
    const segment = segments[segments.length - 1];
    if (ch === '\\' && (next === '%' || next === '?' || next === '\\')) {
      segment.push(next);
      i++;
    } else if (ch === '%') {
      segments.push([]);
    } else {
      segment.push(ch === '?' ? null : ch);
    }
  }
  return segments
    .filter(segment => segment.length > 0)
    .map(segment =>
      segment.includes(null) ? segment : (segment as string[]).join(''),
    );
}

// Where `segment` first matches in `text` at or after `from`, or -1
function findSegment(text: string, segment: Segment, from: number): number {
  if (typeof segment === 'string') {
    return text.indexOf(segment, from);
  }
  const last = text.length - segment.length;
  for (let start = from; start <= last; start++) {
    if (segment.every((ch, k) => ch === null || text[start + k] === ch)) {
      return start;
    }
  }
  return -1;
}

export function unicodeLike(
  pattern: string | null,
  value: string | null,
): number {
  if (!pattern) return 0;
  if (!value) value = '';

  // Values come through NORMALISE, which already folds case; a pattern
  // bound as a parameter may not have
  const segments = parsePattern(foldCase(pattern));
  const text = value.toLowerCase();
  // Each part matched as early as it can be, in order: a later match of one
  // part never lets the rest match where the earliest didn't
  let from = 0;
  for (const segment of segments) {
    const start = findSegment(text, segment, from);
    if (start === -1) {
      return 0;
    }
    from = start + segment.length;
  }
  return 1;
}
