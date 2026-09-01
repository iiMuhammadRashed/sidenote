import * as vscode from 'vscode';
import { NoteService } from '../services/note-service';
import { stripMarkdownExtension } from '../utils/path-utils';

export class NoteLinkProvider implements vscode.DocumentLinkProvider {
  constructor(private readonly noteService: NoteService) {}

  public async provideDocumentLinks(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<vscode.DocumentLink[]> {
    if (document.languageId !== 'markdown') {
      return [];
    }

    const text = document.getText();
    const links: vscode.DocumentLink[] = [];
    const notes = await this.noteService.getAllNotes();

    // Regex to match [[Note Title]] or [[Note Title|Custom Label]]
    const wikiLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    let match: RegExpExecArray | null;

    while ((match = wikiLinkRegex.exec(text)) !== null) {
      const targetNoteName = match[1].trim();
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);
      const range = new vscode.Range(startPos, endPos);

      // Find matching note by title, relative path, or filename
      const targetLower = targetNoteName.toLowerCase();
      const matchedNote = notes.find((n) => {
        return (
          n.title.toLowerCase() === targetLower ||
          stripMarkdownExtension(n.filename).toLowerCase() === targetLower ||
          n.relativePath.toLowerCase() === targetLower ||
          stripMarkdownExtension(n.relativePath).toLowerCase() === targetLower
        );
      });

      if (matchedNote) {
        const link = new vscode.DocumentLink(range, matchedNote.uri);
        link.tooltip = `Open note: ${matchedNote.title} (${matchedNote.relativePath})`;
        links.push(link);
      }
    }

    return links;
  }
}
