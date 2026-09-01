import * as vscode from 'vscode';
import { COMMANDS } from '../constants/commands';
import { NoteService } from '../services/note-service';
import { SearchService } from '../services/search-service';
import { MetadataService } from '../services/metadata-service';
import { TagService } from '../services/tag-service';
import { NotesTreeProvider } from '../views/notes-tree-provider';
import { NoteItem } from '../models/note';
import { getConfiguration } from '../constants/config';

interface NoteQuickPickItem extends vscode.QuickPickItem {
  note: NoteItem;
}

export function registerSearchCommands(
  context: vscode.ExtensionContext,
  noteService: NoteService,
  searchService: SearchService,
  metadataService: MetadataService,
  treeProvider: NotesTreeProvider
): void {
  // 1. Search Notes QuickPick
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.SEARCH_NOTES, async () => {
      const allNotes = await noteService.getAllNotes();
      const nonArchived = allNotes.filter((n) => !n.isArchived);

      const quickPick = vscode.window.createQuickPick<NoteQuickPickItem>();
      quickPick.placeholder = 'Search notes by title, folder, tag (#tag), or full text...';
      quickPick.matchOnDescription = true;
      quickPick.matchOnDetail = true;

      const toQuickPickItems = (notes: NoteItem[], excerpts?: Map<string, string>): NoteQuickPickItem[] => {
        return notes.map((note) => {
          const scopeBadge = note.scope === 'workspace' ? '[WS]' : '[Global]';
          const folderDesc = note.folder ? `${note.folder}/` : '';
          const tagDesc = note.tags.length > 0 ? note.tags.map((t) => '#' + t).join(' ') : '';
          const snippet = excerpts?.get(note.id);

          return {
            label: `${note.isPinned ? '$(pinned) ' : '$(markdown) '}${note.title}`,
            description: `${scopeBadge} ${folderDesc}${note.filename} ${tagDesc ? ' • ' + tagDesc : ''}`,
            detail: snippet || undefined,
            note,
            buttons: [
              {
                iconPath: new vscode.ThemeIcon('split-horizontal'),
                tooltip: 'Open to Side',
              },
              {
                iconPath: note.isPinned ? new vscode.ThemeIcon('pinned') : new vscode.ThemeIcon('star-empty'),
                tooltip: note.isPinned ? 'Unpin Note' : 'Pin Note',
              },
            ],
          };
        });
      };

      // Initial list
      const sorted = noteService.sortNotes(nonArchived);
      quickPick.items = toQuickPickItems(sorted);

      let debounceTimeout: NodeJS.Timeout | undefined;

      quickPick.onDidChangeValue((query) => {
        if (debounceTimeout) {
          clearTimeout(debounceTimeout);
        }

        debounceTimeout = setTimeout(async () => {
          if (!query.trim()) {
            quickPick.items = toQuickPickItems(sorted);
            return;
          }

          quickPick.busy = true;
          try {
            const results = await searchService.search(query, nonArchived);
            const excerpts = new Map<string, string>();
            for (const r of results) {
              if (r.excerpt) {
                excerpts.set(r.note.id, r.excerpt);
              }
            }
            quickPick.items = toQuickPickItems(
              results.map((r) => r.note),
              excerpts
            );
          } finally {
            quickPick.busy = false;
          }
        }, 80);
      });

      // Handle item selection
      quickPick.onDidAccept(async () => {
        const selected = quickPick.selectedItems[0];
        if (selected) {
          quickPick.hide();
          const doc = await vscode.workspace.openTextDocument(selected.note.uri);
          await vscode.window.showTextDocument(doc, { preview: false });
          await metadataService.recordRecent(selected.note.id, getConfiguration().recentLimit);
          treeProvider.refresh();
        }
      });

      // Handle button clicks (e.g. open to side, toggle pin)
      quickPick.onDidTriggerItemButton(async (e) => {
        const note = e.item.note;
        if (e.button.tooltip === 'Open to Side') {
          quickPick.hide();
          const doc = await vscode.workspace.openTextDocument(note.uri);
          await vscode.window.showTextDocument(doc, {
            viewColumn: vscode.ViewColumn.Beside,
            preview: false,
          });
          await metadataService.recordRecent(note.id, getConfiguration().recentLimit);
          treeProvider.refresh();
        } else {
          await metadataService.toggleFavorite(note.id);
          treeProvider.refresh();
          // Re-render items
          const refreshedNotes = await noteService.getAllNotes();
          quickPick.items = toQuickPickItems(refreshedNotes.filter((n) => !n.isArchived));
        }
      });

      quickPick.onDidHide(() => {
        if (debounceTimeout) {
          clearTimeout(debounceTimeout);
        }
        quickPick.dispose();
      });

      quickPick.show();
    })
  );

  // 2. Filter Notes by Tag
  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMANDS.FILTER_BY_TAG,
      async (tagArg?: string) => {
        if (tagArg && typeof tagArg === 'string') {
          treeProvider.setTagFilter(tagArg);
          return;
        }

        const notes = await noteService.getAllNotes();
        const tagCounts = TagService.getTagCounts(notes.filter((n) => !n.isArchived));

        if (tagCounts.length === 0) {
          vscode.window.showInformationMessage('No tagged notes found. Add #hashtags or YAML tags to your notes.');
          return;
        }

        const items = tagCounts.map(({ tag, count }) => ({
          label: `#${tag}`,
          description: `${count} ${count === 1 ? 'note' : 'notes'}`,
          tag,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a tag to filter the sidebar',
        });

        if (selected) {
          treeProvider.setTagFilter(selected.tag);
        }
      }
    )
  );

  // 3. Clear Tag Filter
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.CLEAR_TAG_FILTER, () => {
      treeProvider.setTagFilter(undefined);
    })
  );
}
