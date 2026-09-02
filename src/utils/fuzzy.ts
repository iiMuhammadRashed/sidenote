/** A matched span within the haystack, as [start, endExclusive]. */
export type MatchRange = [number, number];

export interface FuzzyMatch {
  score: number;
  ranges: MatchRange[];
}

/** A run of adjacent characters is the strongest signal, so it must beat scattered hits. */
const SCORE_CONSECUTIVE = 15;
const SCORE_WORD_START = 10;
const SCORE_CAMEL_START = 8;
const SCORE_MID_WORD = 1;
const PENALTY_LEADING_GAP = -1;
const MAX_LEADING_PENALTY = -12;

function isWordSeparator(character: string): boolean {
  return character === ' ' || character === '-' || character === '_' || character === '/' || character === '.';
}

function isWordStart(text: string, index: number): boolean {
  if (index === 0) {
    return true;
  }
  const previous = text[index - 1];
  return isWordSeparator(previous);
}

function isCamelStart(text: string, index: number): boolean {
  const previous = text[index - 1];
  return (
    index > 0 &&
    text[index] === text[index].toUpperCase() &&
    text[index] !== text[index].toLowerCase() &&
    previous === previous.toLowerCase()
  );
}

/**
 * Picks where to match one character.
 *
 * Plain leftmost matching makes `mn` highlight the `n` inside "Meeti[n]g" rather than
 * "[N]otes", which is the opposite of what an initialism means. So a later word-start
 * position wins over an earlier mid-word one, as long as the rest of the query still fits.
 */
function choosePosition(
  haystack: string,
  original: string,
  character: string,
  from: number,
  remainingAfter: number
): number {
  const first = haystack.indexOf(character, from);
  if (first === -1) {
    return -1;
  }

  const latestUsable = original.length - remainingAfter - 1;
  for (let index = first; index <= latestUsable; index++) {
    if (haystack[index] === character && (isWordStart(original, index) || isCamelStart(original, index))) {
      return index;
    }
  }
  return first;
}

export function fuzzyMatch(query: string, text: string): FuzzyMatch | undefined {
  if (query === '') {
    return { score: 0, ranges: [] };
  }
  if (query.length > text.length) {
    return undefined;
  }

  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();

  const ranges: MatchRange[] = [];
  let score = 0;
  let textIndex = 0;
  let previousMatchIndex = -1;

  for (let needleIndex = 0; needleIndex < needle.length; needleIndex++) {
    const isAdjacent =
      previousMatchIndex >= 0 && haystack[previousMatchIndex + 1] === needle[needleIndex];

    const found = isAdjacent
      ? previousMatchIndex + 1
      : choosePosition(haystack, text, needle[needleIndex], textIndex, needle.length - needleIndex - 1);

    if (found === -1) {
      return undefined;
    }

    if (ranges.length > 0 && found === previousMatchIndex + 1) {
      score += SCORE_CONSECUTIVE;
      ranges[ranges.length - 1][1] = found + 1;
    } else {
      if (isWordStart(text, found)) {
        score += SCORE_WORD_START;
      } else if (isCamelStart(text, found)) {
        score += SCORE_CAMEL_START;
      } else {
        score += SCORE_MID_WORD;
      }
      ranges.push([found, found + 1]);
    }

    previousMatchIndex = found;
    textIndex = found + 1;
  }

  // A match near the start of the text is usually the one the user meant.
  score += Math.max(MAX_LEADING_PENALTY, ranges[0][0] * PENALTY_LEADING_GAP);
  return { score, ranges };
}

/**
 * Wraps matched spans in a highlight marker, escaping everything else so the
 * result is safe to inject into a webview.
 */
export function highlight(text: string, ranges: readonly MatchRange[], open = '<b>', close = '</b>'): string {
  const escape = (value: string): string =>
    value.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));

  let result = '';
  let cursor = 0;
  for (const [start, end] of ranges) {
    result += escape(text.slice(cursor, start)) + open + escape(text.slice(start, end)) + close;
    cursor = end;
  }
  return result + escape(text.slice(cursor));
}
