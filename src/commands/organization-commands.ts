import * as vscode from 'vscode';
import { COMMANDS } from '../constants/commands';
import { NoteService } from '../services/note-service';
import { NotesTreeProvider } from '../views/notes-tree-provider';
import { NoteItem, NoteScope } from '../models/note';
import { NoteTreeItem } from '../models/tree-item';

export function registerOrganizationCommands(
  context: vscode.ExtensionContext,
  noteService: NoteService,
  treeProvider: NotesTreeProvider
): void {
  // Move Note
  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMANDS.MOVE_NOTE,
      async (arg?: NoteItem | NoteTreeItem) => {
        let note: NoteItem | undefined;
        if (arg instanceof NoteTreeItem && arg.note) {
          note = arg.note;
        } else if (arg && 'uri' in arg) {
          note = arg as NoteItem;
        }

        if (!note) {
          vscode.window.showWarningMessage('Please select a note to move');
          return;
        }

        const notes = await noteService.getAllNotes();
        const wsRoot = noteService.getWorkspaceRoot();

        interface FolderOption extends vscode.QuickPickItem {
          folder: string;
          scope: NoteScope;
          isNew?: boolean;
        }

        const options: FolderOption[] = [];

        // Workspace options
        if (wsRoot) {
          options.push({
            label: '$(root-folder) Workspace Root',
            description: 'Move to top-level workspace notes',
            folder: '',
            scope: 'workspace',
          });

          const wsFolders = new Set<string>();
          for (const n of notes.filter((n) => n.scope === 'workspace' && n.folder)) {
            wsFolders.add(n.folder);
          }
          for (const f of Array.from(wsFolders).sort()) {
            options.push({
              label: `$(folder) [Workspace] ${f}`,
              folder: f,
              scope: 'workspace',
            });
          }
        }

        // Global options
        options.push({
          label: '$(root-folder) Global Root',
          description: 'Move to top-level global notes',
          folder: '',
          scope: 'global',
        });

        const globalFolders = new Set<string>();
        for (const n of notes.filter((n) => n.scope === 'global' && n.folder)) {
          globalFolders.add(n.folder);
        }
        for (const f of Array.from(globalFolders).sort()) {
          options.push({
            label: `$(folder) [Global] ${f}`,
            folder: f,
            scope: 'global',
          });
        }

        // Create new folder option
        options.push({
          label: '$(add) + Create New Folder...',
          description: 'Create a new destination folder',
          folder: '',
          scope: note.scope,
          isNew: true,
        });

        const selected = await vscode.window.showQuickPick(options, {
          placeHolder: `Move "${note.title}" to...`,
        });

        if (!selected) {
          return;
        }

        let destinationFolder = selected.folder;
        const destinationScope = selected.scope;

        if (selected.isNew) {
          const newFolderName = await vscode.window.showInputBox({
            prompt: 'Enter new destination folder name',
            placeHolder: 'e.g. Archives, Work/Project',
            validateInput: (v) => (!v || !v.trim() ? 'Folder name cannot be empty' : null),
          });
          if (!newFolderName) {
            return;
          }
          destinationFolder = newFolderName.trim();
        }

        try {
          await noteService.moveNote(note, destinationFolder, destinationScope);
          treeProvider.refresh();
          vscode.window.showInformationMessage(
            `Moved "${note.title}" to ${destinationScope === 'workspace' ? 'Workspace' : 'Global'}${
              destinationFolder ? '/' + destinationFolder : ' Root'
            }`
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to move note: ${msg}`);
        }
      }
    )
  );
}
