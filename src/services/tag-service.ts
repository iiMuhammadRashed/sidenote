import { NoteItem } from '../models/note';

export class TagService {
  /**
   * Extracts tags from Markdown content (both YAML frontmatter and inline hashtags).
   */
  public static extractTags(content: string): string[] {
    if (!content) {
      return [];
    }

    const tags = new Set<string>();

    // 1. Extract from YAML frontmatter if present
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (frontmatterMatch && frontmatterMatch[1]) {
      const fmContent = frontmatterMatch[1];
      // Check for tags: [tag1, tag2] or tags: tag1, tag2
      const tagsArrayMatch = fmContent.match(/^tags:\s*\[(.*?)\]/m);
      if (tagsArrayMatch && tagsArrayMatch[1]) {
        tagsArrayMatch[1]
          .split(',')
          .map((t) => t.trim().replace(/^['"]|['"]$/g, '').toLowerCase())
          .filter((t) => t.length > 0)
          .forEach((t) => tags.add(t));
      } else {
        // Check for tags:\n - tag1\n - tag2
        const listMatch = fmContent.match(/^tags:\s*\r?\n((?:\s*-\s*.+\r?\n?)+)/m);
        if (listMatch && listMatch[1]) {
          const lines = listMatch[1].split(/\r?\n/);
          for (const line of lines) {
            const itemMatch = line.match(/^\s*-\s*(.+)$/);
            if (itemMatch && itemMatch[1]) {
              const tag = itemMatch[1].trim().replace(/^['"]|['"]$/g, '').toLowerCase();
              if (tag) {
                tags.add(tag);
              }
            }
          }
        } else {
          // Check for single line tags: tag1, tag2
          const singleLineMatch = fmContent.match(/^tags:\s*([^[{\r\n]+)$/m);
          if (singleLineMatch && singleLineMatch[1]) {
            singleLineMatch[1]
              .split(/[,\s]+/)
              .map((t) => t.trim().replace(/^['"]|['"]$/g, '').toLowerCase())
              .filter((t) => t.length > 0)
              .forEach((t) => tags.add(t));
          }
        }
      }
    }

    // 2. Extract inline hashtags from body (ignoring code blocks)
    // Remove fenced code blocks first: ```...```
    let body = content.replace(/^---\r?\n[\s\S]*?\r?\n---/, '');
    body = body.replace(/```[\s\S]*?```/g, '');
    body = body.replace(/`[^`\n]+`/g, '');

    // Match hashtags: #tag-name or #tag_name or #tag123
    // Ensure it's preceded by whitespace, newline, or start of line
    // Must NOT be followed by space (which is a markdown heading # Heading)
    // Must NOT match hex colors (#fff, #123456)
    const hashtagRegex = /(?:^|\s)#([a-zA-Z][a-zA-Z0-9_-]*)/g;
    let match: RegExpExecArray | null;
    while ((match = hashtagRegex.exec(body)) !== null) {
      const tag = match[1]?.toLowerCase();
      if (tag && !/^[0-9a-f]{3,6}$/i.test(tag)) {
        tags.add(tag);
      }
    }

    return Array.from(tags).sort();
  }

  /**
   * Groups a list of notes by their tags.
   */
  public static groupNotesByTag(notes: NoteItem[]): Map<string, NoteItem[]> {
    const tagMap = new Map<string, NoteItem[]>();

    for (const note of notes) {
      for (const tag of note.tags) {
        const list = tagMap.get(tag) || [];
        list.push(note);
        tagMap.set(tag, list);
      }
    }

    return tagMap;
  }

  /**
   * Returns a sorted list of unique tags with note counts.
   */
  public static getTagCounts(notes: NoteItem[]): { tag: string; count: number }[] {
    const tagMap = this.groupNotesByTag(notes);
    const result: { tag: string; count: number }[] = [];

    for (const [tag, taggedNotes] of tagMap.entries()) {
      result.push({ tag, count: taggedNotes.length });
    }

    return result.sort((a, b) => {
      // Sort by count descending, then alphabetically
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.tag.localeCompare(b.tag);
    });
  }
}
