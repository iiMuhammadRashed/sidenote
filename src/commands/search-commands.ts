import * as vscode from 'vscode';
import { COMMANDS } from '../constants/commands';
import { NoteService } from '../services/note-service';
import { SearchService } from '../services/search-service';
import { MetadataService } from '../services/metadata-service';
import { TagService } from '../services/tag-service';
import { NotesTreeProvider } from '../views/notes-tree-provider';
import { NoteItem } from '../models/note';
import { getConfiguration } from '../constants/config';

/** Keystroke settle time before a search runs, so typing stays responsive on large vaults. */
const SEARCH_DEBOUNCE_MS = 80;

type ItemAction = 'openToSide' | 'toggleFavorite';

interface NoteQuickPickButton extends vscode.QuickInputButton {
  action: ItemAction;
}

interface NoteQuickPickItem extends vscode.QuickPickItem {
  note: NoteItem;
  buttons: readonly NoteQuickPickButton[];
}

export function registerSearchCommands(
  context: vscode.ExtensionContext,
  noteService: NoteService,
  searchService: SearchService,
  metadataService: MetadataService,
  treeProvider: NotesTreeProvider
): void {
  const openNote = async (note: NoteItem, beside: boolean): Promise<void> => {
    const document = await vscode.workspace.openTextDocument(note.uri);
    await vscode.window.showTextDocument(document, {
      preview: false,
      ...(beside ? { viewColumn: vscode.ViewColumn.Beside } : {}),
    });
    await metadataService.recordRecent(note.id, getConfiguration().recentLimit);
    treeProvider.refresh();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.SEARCH, async () => {
      let candidates = (await noteService.getAllNotes()).filter((note) => !note.isArchived);

      const quickPick = vscode.window.createQuickPick<NoteQuickPickItem>();
      quickPick.placeholder = 'Search notes by title, folder, tag or full text...';
      quickPick.matchOnDescription = true;
      quickPick.matchOnDetail = true;
      quickPick.items = toItems(noteService.sortNotes(candidates));

      let debounceTimer: NodeJS.Timeout | undefined;
      let latestQueryId = 0;

      quickPick.onDidChangeValue((query) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          if (!query.trim()) {
            quickPick.items = toItems(noteService.sortNotes(candidates));
            return;
          }

          const queryId = ++latestQueryId;
          quickPick.busy = true;
          try {
            const results = await searchService.search(query, candidates);
            // A slower earlier search must not overwrite a newer one's results.
            if (queryId !== latestQueryId) {
              return;
            }
            quickPick.items = toItems(
              results.map((result) => result.note),
              new Map(results.filter((r) => r.excerpt).map((r) => [r.note.id, r.excerpt!]))
            );
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Sidenote: search failed — ${message}`);
          } finally {
            if (queryId === latestQueryId) {
              quickPick.busy = false;
            }
          }
        }, SEARCH_DEBOUNCE_MS);
      });

      quickPick.onDidAccept(async () => {
        const selected = quickPick.selectedItems[0];
        if (!selected) {
          return;
        }
        quickPick.hide();
        await openNote(selected.note, false);
      });

      quickPick.onDidTriggerItemButton(async (event) => {
        if (toAction(event.button) === 'openToSide') {
          quickPick.hide();
          await openNote(event.item.note, true);
          return;
        }

        await metadataService.toggleFavorite(event.item.note.id);
        noteService.invalidate();
        treeProvider.refresh();
        candidates = (await noteService.getAllNotes()).filter((note) => !note.isArchived);
        quickPick.items = toItems(noteService.sortNotes(candidates));
      });

      quickPick.onDidHide(() => {
        clearTimeout(debounceTimer);
        quickPick.dispose();
      });

      quickPick.show();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.FILTER_BY_TAG, async (tag?: string) => {
      if (typeof tag === 'string' && tag) {
        treeProvider.setTagFilter(tag);
        return;
      }

      const notes = await noteService.getAllNotes();
      const tagCounts = TagService.getTagCounts(notes.filter((note) => !note.isArchived));

      if (tagCounts.length === 0) {
        vscode.window.showInformationMessage(
          'Sidenote: no tags found yet. Add #hashtags or a YAML `tags:` list to a note.'
        );
        return;
      }

      const selected = await vscode.window.showQuickPick(
        tagCounts.map(({ tag: name, count }) => ({
          label: `#${name}`,
          description: `${count} ${count === 1 ? 'note' : 'notes'}`,
          tag: name,
        })),
        { placeHolder: 'Filter the sidebar by tag' }
      );

      if (selected) {
        treeProvider.setTagFilter(selected.tag);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.CLEAR_TAG_FILTER, () => {
      treeProvider.setTagFilter(undefined);
    })
  );
}

/** Recovers the action tagged onto one of our own quick pick buttons. */
function toAction(button: vscode.QuickInputButton): ItemAction | undefined {
  return (button as Partial<NoteQuickPickButton>).action;
}

function toItems(notes: readonly NoteItem[], excerpts?: ReadonlyMap<string, string>): NoteQuickPickItem[] {
  return notes.map((note) => ({
    label: `${note.isFavorite ? '$(star-full) ' : '$(markdown) '}${note.title}`,
    description: describeNote(note),
    detail: excerpts?.get(note.id),
    note,
    buttons: [
      { action: 'openToSide', iconPath: new vscode.ThemeIcon('split-horizontal'), tooltip: 'Open to the Side' },
      {
        action: 'toggleFavorite',
        iconPath: new vscode.ThemeIcon(note.isFavorite ? 'star-full' : 'star-empty'),
        tooltip: note.isFavorite ? 'Remove from Favorites' : 'Add to Favorites',
      },
    ],
  }));
}

function describeNote(note: NoteItem): string {
  const parts = [note.scope === 'workspace' ? 'Workspace' : 'Global', note.relativePath];
  if (note.tags.length > 0) {
    parts.push(note.tags.map((tag) => `#${tag}`).join(' '));
  }
  return parts.join(' • ');
}
