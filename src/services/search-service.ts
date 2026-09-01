import { NoteItem, NoteScope } from '../models/note';
import { NoteService } from './note-service';

export interface SearchResult {
  note: NoteItem;
  score: number;
  matchType: 'title' | 'tag' | 'path' | 'content';
  excerpt?: string;
  matchedLine?: number;
}

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

  public invalidateNote(id: string): void {
    this.contentCache.delete(id);
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
      const titleLower = note.title.toLowerCase();
      const pathLower = note.relativePath.toLowerCase();

      // Check title match
      if (titleLower === trimmed) {
        results.push({
          note,
          score: 100,
          matchType: 'title',
        });
        continue;
      }

      if (titleLower.startsWith(trimmed)) {
        results.push({
          note,
          score: 90,
          matchType: 'title',
        });
        continue;
      }

      const allTokensInTitle = queryTokens.every((t) => titleLower.includes(t));
      if (allTokensInTitle) {
        results.push({
          note,
          score: 80,
          matchType: 'title',
        });
        continue;
      }

      // Check tag match
      const matchingTag = note.tags.find((t) => t.includes(trimmed) || queryTokens.some((tok) => t.includes(tok)));
      if (matchingTag) {
        results.push({
          note,
          score: 70,
          matchType: 'tag',
          excerpt: `Tag: #${matchingTag}`,
        });
        continue;
      }

      // Check path match
      if (pathLower.includes(trimmed)) {
        results.push({
          note,
          score: 50,
          matchType: 'path',
          excerpt: `Folder: ${note.folder || 'Root'}`,
        });
        continue;
      }

      // Check content match (with cache)
      const content = await this.getNoteContent(note);
      const contentMatch = this.searchInContent(content, queryTokens);
      if (contentMatch) {
        results.push({
          note,
          score: 30,
          matchType: 'content',
          excerpt: contentMatch.snippet,
          matchedLine: contentMatch.line,
        });
      }
    }

    return results.sort((a, b) => b.score - a.score);
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
