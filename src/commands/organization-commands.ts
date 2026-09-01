import * as vscode from 'vscode';
import { COMMANDS } from '../constants/commands';
import { NoteService } from '../services/note-service';
import { NotesTreeProvider } from '../views/notes-tree-provider';
import { NoteItem, NoteScope } from '../models/note';
import { NoteTreeItem } from '../models/tree-item';
import { toNote } from './note-commands';

interface FolderQuickPickItem extends vscode.QuickPickItem {
  folder: string;
  scope: NoteScope;
  isNewFolder?: boolean;
}

export function registerOrganizationCommands(
  context: vscode.ExtensionContext,
  noteService: NoteService,
  treeProvider: NotesTreeProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMANDS.MOVE,
      async (target?: NoteItem | NoteTreeItem) => {
        const note = toNote(target);
        if (!note) {
          vscode.window.showWarningMessage('Sidenote: select a note to move first.');
          return;
        }

        const notes = await noteService.getAllNotes();
        const destination = await vscode.window.showQuickPick(
          buildDestinations(notes, note, noteService.getWorkspaceRoot() !== undefined),
          { placeHolder: `Move "${note.title}" to...` }
        );
        if (!destination) {
          return;
        }

        let folder = destination.folder;
        if (destination.isNewFolder) {
          const name = await vscode.window.showInputBox({
            prompt: 'New destination folder',
            placeHolder: 'e.g. Archive, Work/Project',
            validateInput: (value) => (value.trim() ? null : 'Folder name cannot be empty'),
          });
          if (!name?.trim()) {
            return;
          }
          folder = name.trim();
        }

        try {
          const moved = await noteService.moveNote(note, folder, destination.scope);
          treeProvider.refresh();
          vscode.window.setStatusBarMessage(
            `Moved "${moved.title}" to ${describeLocation(moved.scope, moved.folder)}`,
            3000
          );
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`Sidenote: could not move the note — ${message}`);
        }
      }
    )
  );
}

/** Builds the destination list: both roots, every existing folder, and a "create new" escape hatch. */
function buildDestinations(
  notes: readonly NoteItem[],
  note: NoteItem,
  hasWorkspace: boolean
): FolderQuickPickItem[] {
  const destinations: FolderQuickPickItem[] = [];
  const scopes: NoteScope[] = hasWorkspace ? ['workspace', 'global'] : ['global'];

  for (const scope of scopes) {
    const scopeLabel = scope === 'workspace' ? 'Workspace' : 'Global';

    destinations.push({
      label: `$(root-folder) ${scopeLabel} Root`,
      folder: '',
      scope,
    });

    const folders = new Set(
      notes.filter((candidate) => candidate.scope === scope && candidate.folder).map((c) => c.folder)
    );

    for (const folder of Array.from(folders).sort((a, b) => a.localeCompare(b))) {
      destinations.push({
        label: `$(folder) ${folder}`,
        description: scopeLabel,
        folder,
        scope,
      });
    }
  }

  destinations.push({
    label: '$(add) Create new folder...',
    folder: '',
    scope: note.scope,
    isNewFolder: true,
  });

  return destinations;
}

function describeLocation(scope: NoteScope, folder: string): string {
  const scopeLabel = scope === 'workspace' ? 'Workspace' : 'Global';
  return folder ? `${scopeLabel}/${folder}` : `${scopeLabel} root`;
}
