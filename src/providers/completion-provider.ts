import * as vscode from 'vscode';
import { NoteService } from '../services/note-service';
import { stripMarkdownExtension } from '../utils/path-utils';

export class NoteCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly noteService: NoteService) {}

  public async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[] | undefined> {
    const linePrefix = document.lineAt(position).text.slice(0, position.character);

    // Only trigger if line ends with [[
    if (!linePrefix.endsWith('[[')) {
      return undefined;
    }

    const notes = await this.noteService.getAllNotes();
    const items: vscode.CompletionItem[] = [];

    for (const note of notes) {
      const baseName = stripMarkdownExtension(note.filename);
      const label = note.title !== baseName ? `${note.title} (${baseName})` : note.title;

      const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Reference);
      item.insertText = `${note.title}]]`;
      item.detail = `${note.scope === 'workspace' ? '[Workspace]' : '[Global]'} ${note.relativePath}`;
      item.documentation = new vscode.MarkdownString(
        `Link to **${note.title}**\n\n- Path: \`${note.relativePath}\`\n- Tags: ${note.tags.map((t) => '#' + t).join(' ')}`
      );

      items.push(item);
    }

    return items;
  }
}
