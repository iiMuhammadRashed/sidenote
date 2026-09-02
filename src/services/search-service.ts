import { NoteItem, NoteScope } from '../models/note';
import { NoteService } from './note-service';
import { fuzzyMatch } from '../utils/fuzzy';

export interface SearchResult {
  note: NoteItem;
  score: number;
  matchType: 'title' | 'tag' | 'path' | 'content';
  excerpt?: string;
  /** 1-based line the content match was found on, so the note can open right there. */
  matchedLine?: number;
}

/** How much better a title hit ranks than the same text found in the body. */
const TITLE_WEIGHT = 4;
const TAG_WEIGHT = 3;
const PATH_WEIGHT = 2;
const CONTENT_BASE_SCORE = 12;

interface CachedNoteContent {
  mtime: number;
  content: string;
}

export class SearchService {
  private contentCache = new Map<string, CachedNoteContent>();

  constructor(private readonly noteService: NoteService) {}

  public clearCache(): void {
    this.contentCache.clear();
  }

  /**
   * Searches notes by query with ranking and snippet generation.
   */
  public async search(
    query: string,
    notes: NoteItem[],
    options?: { scope?: NoteScope; tag?: string }
  ): Promise<SearchResult[]> {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed && !options?.tag && !options?.scope) {
      return notes.map((n) => ({
        note: n,
        score: 1,
        matchType: 'title',
      }));
    }

    const filteredNotes = notes.filter((n) => {
      if (options?.scope && n.scope !== options.scope) {
        return false;
      }
      if (options?.tag && !n.tags.includes(options.tag.toLowerCase())) {
        return false;
      }
      return true;
    });

    if (!trimmed) {
      return filteredNotes.map((n) => ({
        note: n,
        score: 1,
        matchType: 'tag',
      }));
    }

    const results: SearchResult[] = [];
    const queryTokens = trimmed.split(/\s+/).filter(Boolean);

    for (const note of filteredNotes) {
      const best = this.bestMetadataMatch(note, trimmed);
      if (best) {
        results.push(best);
        continue;
      }

      // Only read the file when the cheap fields missed, which keeps typing responsive.
      const content = await this.getNoteContent(note);
      const contentMatch = this.searchInContent(content, queryTokens);
      if (contentMatch) {
        results.push({
          note,
          score: CONTENT_BASE_SCORE,
          matchType: 'content',
          excerpt: contentMatch.snippet,
          matchedLine: contentMatch.line,
        });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Best fuzzy hit across a note's title, tags and path. Fuzzy matching means `nsvc`
   * finds `note-service`, which is how people actually recall a filename.
   */
  private bestMetadataMatch(note: NoteItem, query: string): SearchResult | undefined {
    const titleMatch = fuzzyMatch(query, note.title);
    let best: SearchResult | undefined = titleMatch
      ? { note, score: titleMatch.score * TITLE_WEIGHT, matchType: 'title' }
      : undefined;

    for (const tag of note.tags) {
      const tagMatch = fuzzyMatch(query, tag);
      const score = tagMatch ? tagMatch.score * TAG_WEIGHT : -1;
      if (tagMatch && (!best || score > best.score)) {
        best = { note, score, matchType: 'tag', excerpt: `#${tag}` };
      }
    }

    const pathMatch = fuzzyMatch(query, note.relativePath);
    if (pathMatch) {
      const score = pathMatch.score * PATH_WEIGHT;
      if (!best || score > best.score) {
        best = { note, score, matchType: 'path', excerpt: note.folder || 'Root' };
      }
    }

    return best;
  }

  private async getNoteContent(note: NoteItem): Promise<string> {
    const cached = this.contentCache.get(note.id);
    if (cached && cached.mtime === note.mtime) {
      return cached.content;
    }

    try {
      const content = await this.noteService.readNoteContent(note.uri);
      this.contentCache.set(note.id, { mtime: note.mtime, content });
      return content;
    } catch {
      return '';
    }
  }

  private searchInContent(
    content: string,
    queryTokens: string[]
  ): { snippet: string; line: number } | null {
    if (!content) {
      return null;
    }

    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      const lineLower = lineText.toLowerCase();

      if (queryTokens.every((t) => lineLower.includes(t))) {
        const snippet = lineText.trim().slice(0, 120);
        return { snippet: snippet || '(empty line)', line: i + 1 };
      }
    }

    return null;
  }
}
