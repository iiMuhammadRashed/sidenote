import * as vscode from 'vscode';
import { COMMANDS } from '../constants/commands';
import { NoteItem, NoteScope } from '../models/note';
import { NoteTreeItem } from '../models/tree-item';
import { NoteService } from '../services/note-service';
import { MetadataService } from '../services/metadata-service';
import { NotesTreeProvider } from '../views/notes-tree-provider';
import { getConfiguration } from '../constants/config';
import { stripMarkdownExtension } from '../utils/path-utils';

export function registerNoteCommands(
  context: vscode.ExtensionContext,
  noteService: NoteService,
  metadataService: MetadataService,
  treeProvider: NotesTreeProvider
): void {
  // 1. New Note
  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMANDS.NEW_NOTE,
      async (arg?: NoteTreeItem | { scope?: NoteScope; folder?: string }) => {
        let initialFolder = '';
        let initialScope: NoteScope | undefined;

        if (arg instanceof NoteTreeItem) {
          if (arg.itemType === 'folder' && arg.folderPath) {
            initialFolder = arg.folderPath;
            initialScope = arg.scope;
          } else if (arg.itemType === 'section') {
            if (arg.sectionId === 'workspace') {
              initialScope = 'workspace';
            } else if (arg.sectionId === 'global') {
              initialScope = 'global';
            }
          }
        } else if (arg && typeof arg === 'object') {
          initialFolder = arg.folder || '';
          initialScope = arg.scope;
        }

        const title = await vscode.window.showInputBox({
          prompt: 'Enter note title',
          placeHolder: 'e.g. Project Architecture, Meeting Notes, Ideas',
          validateInput: (value) => {
            if (!value || !value.trim()) {
              return 'Note title cannot be empty';
            }
            return null;
          },
        });

        if (!title) {
          return;
        }

        try {
          const newNote = await noteService.createNote({
            title: title.trim(),
            folder: initialFolder,
            scope: initialScope,
          });

          treeProvider.refresh();

          // Open the newly created note in the editor
          const doc = await vscode.workspace.openTextDocument(newNote.uri);
          await vscode.window.showTextDocument(doc, { preview: false });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to create note: ${msg}`);
        }
      }
    )
  );

  // 2. New Folder
  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMANDS.NEW_FOLDER,
      async (arg?: NoteTreeItem) => {
        let parentFolder = '';
        let scope: NoteScope | undefined;

        if (arg instanceof NoteTreeItem) {
          if (arg.itemType === 'folder' && arg.folderPath) {
            parentFolder = arg.folderPath;
            scope = arg.scope;
          } else if (arg.itemType === 'section') {
            if (arg.sectionId === 'workspace') {
              scope = 'workspace';
            } else if (arg.sectionId === 'global') {
              scope = 'global';
            }
          }
        }

        const folderName = await vscode.window.showInputBox({
          prompt: 'Enter folder name',
          placeHolder: 'e.g. Work, Ideas, Tasks',
          validateInput: (value) => {
            if (!value || !value.trim()) {
              return 'Folder name cannot be empty';
            }
            return null;
          },
        });

        if (!folderName) {
          return;
        }

        const fullFolderPath = parentFolder ? `${parentFolder}/${folderName.trim()}` : folderName.trim();

        try {
          await noteService.createFolder(fullFolderPath, scope);
          treeProvider.refresh();
          vscode.window.showInformationMessage(`Folder "${folderName}" created`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to create folder: ${msg}`);
        }
      }
    )
  );

  // 3. Open Note
  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMANDS.OPEN_NOTE,
      async (arg?: NoteItem | NoteTreeItem) => {
        const note = extractNote(arg);
        if (!note) {
          return;
        }

        try {
          const doc = await vscode.workspace.openTextDocument(note.uri);
          await vscode.window.showTextDocument(doc, { preview: false });
          await metadataService.recordRecent(note.id, getConfiguration().recentLimit);
          treeProvider.refresh();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Could not open note "${note.title}": ${msg}`);
        }
      }
    )
  );

  // 4. Open to Side
  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMANDS.OPEN_TO_SIDE,
      async (arg?: NoteItem | NoteTreeItem) => {
        const note = extractNote(arg);
        if (!note) {
          return;
        }

        try {
          const doc = await vscode.workspace.openTextDocument(note.uri);
          await vscode.window.showTextDocument(doc, {
            viewColumn: vscode.ViewColumn.Beside,
            preview: false,
          });
          await metadataService.recordRecent(note.id, getConfiguration().recentLimit);
          treeProvider.refresh();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Could not open note: ${msg}`);
        }
      }
    )
  );

  // 5. Rename Note / Folder
  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMANDS.RENAME_NOTE,
      async (arg?: NoteItem | NoteTreeItem) => {
        if (arg instanceof NoteTreeItem && arg.itemType === 'folder' && arg.folderPath) {
          const oldName = arg.folderPath.split('/').pop() || arg.folderPath;
          const newName = await vscode.window.showInputBox({
            prompt: 'Enter new folder name',
            value: oldName,
            validateInput: (v) => (!v || !v.trim() ? 'Folder name cannot be empty' : null),
          });
          if (!newName || newName === oldName) {
            return;
          }
          // Folder rename via move
          const parent = arg.folderPath.includes('/')
            ? arg.folderPath.slice(0, arg.folderPath.lastIndexOf('/'))
            : '';
          const targetPath = parent ? `${parent}/${newName}` : newName;
          const root =
            arg.scope === 'workspace' && noteService.getWorkspaceRoot()
              ? noteService.getWorkspaceRoot()!
              : noteService.getGlobalRoot();
          const oldUri = vscode.Uri.joinPath(root, arg.folderPath);
          const newUri = vscode.Uri.joinPath(root, targetPath);
          await vscode.workspace.fs.rename(oldUri, newUri);
          treeProvider.refresh();
          return;
        }

        const note = extractNote(arg);
        if (!note) {
          return;
        }

        const currentTitle = stripMarkdownExtension(note.filename);
        const newTitle = await vscode.window.showInputBox({
          prompt: 'Enter new note title',
          value: currentTitle,
          validateInput: (value) => (!value || !value.trim() ? 'Title cannot be empty' : null),
        });

        if (!newTitle || newTitle.trim() === currentTitle) {
          return;
        }

        try {
          await noteService.renameNote(note, newTitle.trim());
          treeProvider.refresh();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to rename note: ${msg}`);
        }
      }
    )
  );

  // 6. Delete Note / Folder
  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMANDS.DELETE_NOTE,
      async (arg?: NoteItem | NoteTreeItem) => {
        if (arg instanceof NoteTreeItem && arg.itemType === 'folder' && arg.folderPath && arg.scope) {
          const deleted = await noteService.deleteFolder(arg.folderPath, arg.scope, true);
          if (deleted) {
            treeProvider.refresh();
          }
          return;
        }

        const note = extractNote(arg);
        if (!note) {
          return;
        }

        const deleted = await noteService.deleteNote(note, true);
        if (deleted) {
          treeProvider.refresh();
        }
      }
    )
  );

  // 7. Duplicate Note
  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMANDS.DUPLICATE_NOTE,
      async (arg?: NoteItem | NoteTreeItem) => {
        const note = extractNote(arg);
        if (!note) {
          return;
        }

        try {
          const copy = await noteService.duplicateNote(note);
          treeProvider.refresh();
          const doc = await vscode.workspace.openTextDocument(copy.uri);
          await vscode.window.showTextDocument(doc, { preview: false });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to duplicate note: ${msg}`);
        }
      }
    )
  );

  // 8. Toggle Favorite / Pin
  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMANDS.TOGGLE_FAVORITE,
      async (arg?: NoteItem | NoteTreeItem) => {
        const note = extractNote(arg);
        if (!note) {
          return;
        }

        const isFav = await metadataService.toggleFavorite(note.id);
        treeProvider.refresh();
        vscode.window.setStatusBarMessage(
          isFav ? `⭐ Added "${note.title}" to Favorites` : `Removed "${note.title}" from Favorites`,
          3000
        );
      }
    )
  );

  // 9. Toggle Archive
  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMANDS.TOGGLE_ARCHIVE,
      async (arg?: NoteItem | NoteTreeItem) => {
        const note = extractNote(arg);
        if (!note) {
          return;
        }

        const isArchived = await metadataService.toggleArchived(note.id);
        treeProvider.refresh();
        vscode.window.setStatusBarMessage(
          isArchived ? `📦 Archived "${note.title}"` : `Unarchived "${note.title}"`,
          3000
        );
      }
    )
  );

  // 10. Copy Note Markdown Link
  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMANDS.COPY_NOTE_LINK,
      async (arg?: NoteItem | NoteTreeItem) => {
        const note = extractNote(arg);
        if (!note) {
          return;
        }

        const link = `[[${note.title}]]`;
        await vscode.env.clipboard.writeText(link);
        vscode.window.setStatusBarMessage(`Copied link ${link} to clipboard`, 3000);
      }
    )
  );

  // 11. Copy Note Relative Path
  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMANDS.COPY_NOTE_PATH,
      async (arg?: NoteItem | NoteTreeItem) => {
        const note = extractNote(arg);
        if (note) {
          await vscode.env.clipboard.writeText(note.relativePath);
          vscode.window.setStatusBarMessage(`Copied path: ${note.relativePath}`, 3000);
          return;
        }
        if (arg instanceof NoteTreeItem && arg.folderPath) {
          await vscode.env.clipboard.writeText(arg.folderPath);
          vscode.window.setStatusBarMessage(`Copied path: ${arg.folderPath}`, 3000);
        }
      }
    )
  );

  // 12. Reveal in OS File Manager
  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMANDS.REVEAL_IN_OS,
      async (arg?: NoteItem | NoteTreeItem) => {
        const note = extractNote(arg);
        if (note) {
          await vscode.commands.executeCommand('revealFileInOS', note.uri);
          return;
        }
        if (arg instanceof NoteTreeItem && arg.folderPath && arg.scope) {
          const root =
            arg.scope === 'workspace' && noteService.getWorkspaceRoot()
              ? noteService.getWorkspaceRoot()!
              : noteService.getGlobalRoot();
          const folderUri = vscode.Uri.joinPath(root, arg.folderPath);
          await vscode.commands.executeCommand('revealFileInOS', folderUri);
        }
      }
    )
  );

  // 13. Open Daily Scratchpad
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.OPEN_SCRATCHPAD, async () => {
      try {
        const note = await noteService.getOrCreateScratchpad();
        treeProvider.refresh();
        const doc = await vscode.workspace.openTextDocument(note.uri);
        await vscode.window.showTextDocument(doc, { preview: false });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to open scratchpad: ${msg}`);
      }
    })
  );

  // 14. Refresh
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.REFRESH, () => {
      treeProvider.refresh();
    })
  );

  // 15. Toggle Preview
  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMANDS.TOGGLE_PREVIEW,
      async (arg?: NoteItem | NoteTreeItem) => {
        const note = extractNote(arg);
        const activeEditor = vscode.window.activeTextEditor;
        const uri = note ? note.uri : activeEditor?.document.uri;

        if (uri && uri.fsPath.endsWith('.md')) {
          await vscode.commands.executeCommand('markdown.showPreviewToSide', uri);
        }
      }
    )
  );

  // 16. Open Settings
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.OPEN_SETTINGS, () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'sidebarNotes');
    })
  );
}

function extractNote(arg?: NoteItem | NoteTreeItem): NoteItem | undefined {
  if (!arg) {
    return undefined;
  }
  if ('uri' in arg && 'relativePath' in arg) {
    return arg as NoteItem;
  }
  if (arg instanceof NoteTreeItem && arg.note) {
    return arg.note;
  }
  return undefined;
}
