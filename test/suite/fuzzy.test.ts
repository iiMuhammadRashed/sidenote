import * as assert from 'assert';
import { fuzzyMatch, highlight } from '../../src/utils/fuzzy';

describe('fuzzyMatch', () => {
  const score = (query: string, text: string): number | undefined => fuzzyMatch(query, text)?.score;

  it('matches a subsequence rather than only a substring', () => {
    assert.ok(fuzzyMatch('nsvc', 'note-service'));
    assert.ok(fuzzyMatch('mtg', 'Meeting Notes'));
  });

  it('rejects a query that is not a subsequence', () => {
    assert.strictEqual(fuzzyMatch('zzz', 'Meeting Notes'), undefined);
    assert.strictEqual(fuzzyMatch('gniteem', 'Meeting Notes'), undefined);
  });

  it('rejects a query longer than the text', () => {
    assert.strictEqual(fuzzyMatch('meeting notes today', 'notes'), undefined);
  });

  it('is case insensitive', () => {
    assert.ok(fuzzyMatch('MEET', 'meeting notes'));
  });

  it('ranks a prefix above a match buried mid-word', () => {
    assert.ok(score('arch', 'Architecture')! > score('arch', 'Search Results')!);
  });

  it('ranks word-boundary initials above scattered letters', () => {
    assert.ok(score('mn', 'Meeting Notes')! > score('mn', 'Improvement Plan')!);
  });

  it('ranks consecutive characters above gapped ones', () => {
    assert.ok(score('note', 'note-service')! > score('note', 'no tiny extras')!);
  });

  it('reports the matched spans so they can be highlighted', () => {
    const match = fuzzyMatch('mn', 'Meeting Notes');
    assert.deepStrictEqual(match?.ranges, [
      [0, 1],
      [8, 9],
    ]);
  });

  it('merges adjacent characters into one span', () => {
    assert.deepStrictEqual(fuzzyMatch('meet', 'Meeting')?.ranges, [[0, 4]]);
  });

  it('treats an empty query as a neutral match', () => {
    assert.deepStrictEqual(fuzzyMatch('', 'anything'), { score: 0, ranges: [] });
  });
});

describe('highlight', () => {
  it('wraps the matched spans', () => {
    assert.strictEqual(highlight('Meeting', [[0, 4]]), '<b>Meet</b>ing');
  });

  it('escapes text outside and inside the spans', () => {
    assert.strictEqual(
      highlight('a<b> & c', [[0, 1]]),
      '<b>a</b>&lt;b&gt; &amp; c'
    );
  });

  it('returns escaped text when nothing matched', () => {
    assert.strictEqual(highlight('<x>', []), '&lt;x&gt;');
  });
});
