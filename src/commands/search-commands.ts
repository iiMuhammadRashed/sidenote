import * as vscode from 'vscode';
import { COMMANDS } from '../constants/commands';
import { NoteService } from '../services/note-service';
import { SearchService } from '../services/search-service';
import { TagService } from '../services/tag-service';
import { NotesTreeProvider } from '../views/notes-tree-provider';
import { NoteItem } from '../models/note';

/** Keystroke settle time before a search runs, so typing stays responsive on large vaults. */
const SEARCH_DEBOUNCE_MS = 80;

type ItemAction = 'openToSide';

interface NoteQuickPickButton extends vscode.QuickInputButton {
  action: ItemAction;
}

interface NoteQuickPickItem extends vscode.QuickPickItem {
  note: NoteItem;
  /** Line to jump to when this result came from the note's body. */
  line?: number;
  buttons: readonly NoteQuickPickButton[];
}

export function registerSearchCommands(
  context: vscode.ExtensionContext,
  noteService: NoteService,
  searchService: SearchService,
  treeProvider: NotesTreeProvider
): void {
  const openNote = async (note: NoteItem, beside: boolean, line?: number): Promise<void> => {
    const document = await vscode.workspace.openTextDocument(note.uri);
    // Land on the matched line so a content hit does not make the user search twice.
    const target = line === undefined ? undefined : new vscode.Range(line - 1, 0, line - 1, 0);
    await vscode.window.showTextDocument(document, {
      preview: false,
      ...(target ? { selection: target } : {}),
      ...(beside ? { viewColumn: vscode.ViewColumn.Beside } : {}),
    });
    treeProvider.refresh();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.SEARCH, async () => {
      const candidates = await noteService.getAllNotes();

      const quickPick = vscode.window.createQuickPick<NoteQuickPickItem>();
      quickPick.placeholder = 'Search notes by title, folder, tag or full text...';
      // Results arrive already ranked by our own fuzzy scorer, and each item sets
      // alwaysShow so the quick pick's own label filter cannot drop a body match.
      quickPick.matchOnDescription = false;
      quickPick.matchOnDetail = false;
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
            quickPick.items = results.map((result) =>
              toItem(result.note, result.excerpt, result.matchedLine)
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
        await openNote(selected.note, false, selected.line);
      });

      quickPick.onDidTriggerItemButton(async (event) => {
        if (toAction(event.button) === 'openToSide') {
          quickPick.hide();
          await openNote(event.item.note, true, event.item.line);
        }
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
      const tagCounts = TagService.getTagCounts(notes);

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

function toItems(notes: readonly NoteItem[]): NoteQuickPickItem[] {
  return notes.map((note) => toItem(note));
}

function toItem(note: NoteItem, excerpt?: string, line?: number): NoteQuickPickItem {
  return {
    label: `$(markdown) ${note.title}`,
    description: describeNote(note),
    detail: line === undefined ? excerpt : `$(arrow-right) line ${line}: ${excerpt ?? ''}`.trim(),
    // The quick pick filters by label; our results are already scored and may match on
    // body text that never appears in the label, so opt each one out of that filter.
    alwaysShow: true,
    note,
    line,
    buttons: [
      { action: 'openToSide', iconPath: new vscode.ThemeIcon('split-horizontal'), tooltip: 'Open to the Side' },
    ],
  };
}

function describeNote(note: NoteItem): string {
  // The flat result list has no section headers, so each row states where it lives.
  const parts = [note.scope === 'workspace' ? 'Project' : 'Global', note.relativePath];
  if (note.tags.length > 0) {
    parts.push(note.tags.map((tag) => `#${tag}`).join(' '));
  }
  return parts.join(' • ');
}
