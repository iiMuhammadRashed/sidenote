import * as vscode from 'vscode';
import { COMMANDS } from '../constants/commands';
import { NoteItem, NoteScope } from '../models/note';
import { NoteTreeItem } from '../models/tree-item';
import { NoteService } from '../services/note-service';
import { NotesTreeProvider } from '../views/notes-tree-provider';
import { getConfiguration } from '../constants/config';
import { stripMarkdownExtension } from '../utils/path-utils';

/** How long transient confirmations stay in the status bar. */
const STATUS_MESSAGE_TIMEOUT_MS = 3000;

/** The shapes a tree or palette invocation can hand a command. */
type CommandTarget = NoteItem | NoteTreeItem | { scope?: NoteScope; folder?: string } | undefined;

export function registerNoteCommands(
  context: vscode.ExtensionContext,
  noteService: NoteService,
  treeProvider: NotesTreeProvider
): void {
  const openNote = async (note: NoteItem, beside = false): Promise<void> => {
    const document = await vscode.workspace.openTextDocument(note.uri);
    await vscode.window.showTextDocument(document, {
      preview: false,
      ...(beside ? { viewColumn: vscode.ViewColumn.Beside } : {}),
    });
    treeProvider.refresh();
  };

  const register = (command: string, handler: (target: CommandTarget) => unknown): void => {
    context.subscriptions.push(
      vscode.commands.registerCommand(command, async (target?: CommandTarget) => {
        try {
          await handler(target);
        } catch (error: unknown) {
          vscode.window.showErrorMessage(`Sidenote: ${toMessage(error)}`);
        }
      })
    );
  };

  register(COMMANDS.NEW_NOTE, async (target) => {
    const { folder, scope } = resolveCreationTarget(target);

    const title = await vscode.window.showInputBox({
      prompt: 'Note title',
      placeHolder: 'e.g. Project Architecture, Meeting Notes, Ideas',
      validateInput: (value) => (value.trim() ? null : 'Note title cannot be empty'),
    });
    if (!title?.trim()) {
      return;
    }

    const note = await noteService.createNote({ title: title.trim(), folder, scope });
    treeProvider.refresh();
    await openNote(note);
  });

  register(COMMANDS.NEW_FOLDER, async (target) => {
    const { folder: parentFolder, scope } = resolveCreationTarget(target);

    const name = await vscode.window.showInputBox({
      prompt: 'Folder name',
      placeHolder: 'e.g. Work, Ideas, Tasks',
      validateInput: (value) => (value.trim() ? null : 'Folder name cannot be empty'),
    });
    if (!name?.trim()) {
      return;
    }

    const folderPath = parentFolder ? `${parentFolder}/${name.trim()}` : name.trim();
    await noteService.createFolder(folderPath, scope);
    treeProvider.refresh();
  });

  register(COMMANDS.OPEN_NOTE, async (target) => {
    const note = toNote(target);
    if (note) {
      await openNote(note);
    }
  });

  register(COMMANDS.OPEN_TO_SIDE, async (target) => {
    const note = toNote(target);
    if (note) {
      await openNote(note, true);
    }
  });

  register(COMMANDS.RENAME, async (target) => {
    const folder = toFolder(target);
    if (folder) {
      const currentName = folder.folderPath.split('/').pop() ?? folder.folderPath;
      const newName = await vscode.window.showInputBox({
        prompt: 'New folder name',
        value: currentName,
        validateInput: (value) => (value.trim() ? null : 'Folder name cannot be empty'),
      });
      if (!newName?.trim() || newName.trim() === currentName) {
        return;
      }
      await noteService.renameFolder(folder.folderPath, newName.trim(), folder.scope);
      treeProvider.refresh();
      return;
    }

    const note = toNote(target);
    if (!note) {
      return;
    }

    const currentName = stripMarkdownExtension(note.filename);
    const newName = await vscode.window.showInputBox({
      prompt: 'New note name',
      value: currentName,
      validateInput: (value) => (value.trim() ? null : 'Note name cannot be empty'),
    });
    if (!newName?.trim() || newName.trim() === currentName) {
      return;
    }

    await noteService.renameNote(note, newName.trim());
    treeProvider.refresh();
  });

  register(COMMANDS.DELETE, async (target) => {
    const folder = toFolder(target);
    if (folder) {
      const confirmed = await confirmDelete(
        `Delete the folder "${folder.folderPath}" and every note inside it?`,
        'Delete Folder'
      );
      if (!confirmed) {
        return;
      }
      const outcome = await noteService.deleteFolder(folder.folderPath, folder.scope);
      treeProvider.refresh();
      warnIfPermanent(outcome.permanent, `Folder "${folder.folderPath}"`);
      return;
    }

    const note = toNote(target);
    if (!note) {
      return;
    }

    const confirmed = await confirmDelete(`Delete "${note.title}"?`, 'Delete Note');
    if (!confirmed) {
      return;
    }

    const outcome = await noteService.deleteNote(note);
    treeProvider.refresh();
    warnIfPermanent(outcome.permanent, `"${note.title}"`);
  });




  register(COMMANDS.COPY_WIKI_LINK, async (target) => {
    const note = toNote(target);
    if (!note) {
      return;
    }
    const link = `[[${note.title}]]`;
    await vscode.env.clipboard.writeText(link);
    setStatusMessage(`Copied ${link}`);
  });



  register(COMMANDS.OPEN_DAILY_NOTE, async () => {
    const note = await noteService.getOrCreateDailyNote();
    treeProvider.refresh();
    await openNote(note);
  });

  register(COMMANDS.REFRESH, () => {
    noteService.invalidate();
    treeProvider.refresh();
  });

  register(COMMANDS.SHOW_PREVIEW, async (target) => {
    const uri = toNote(target)?.uri ?? vscode.window.activeTextEditor?.document.uri;
    if (uri?.fsPath.toLowerCase().endsWith('.md')) {
      await vscode.commands.executeCommand('markdown.showPreviewToSide', uri);
    }
  });

  register(COMMANDS.OPEN_SETTINGS, async () => {
    await vscode.commands.executeCommand('workbench.action.openSettings', 'sidenote');
  });
}

// --- Target coercion -------------------------------------------------------

/** Narrows a command argument to a note, whether it arrived as a tree item or a raw note. */
export function toNote(target: CommandTarget): NoteItem | undefined {
  if (!target) {
    return undefined;
  }
  if (target instanceof NoteTreeItem) {
    return target.note;
  }
  return 'uri' in target && 'relativePath' in target ? target : undefined;
}

/** Narrows a command argument to a folder tree item with both of its required fields present. */
function toFolder(target: CommandTarget): { folderPath: string; scope: NoteScope } | undefined {
  if (
    target instanceof NoteTreeItem &&
    target.itemType === 'folder' &&
    target.folderPath &&
    target.scope
  ) {
    return { folderPath: target.folderPath, scope: target.scope };
  }
  return undefined;
}

/** Works out where a new note or folder should go, based on what the user right-clicked. */
function resolveCreationTarget(target: CommandTarget): { folder: string; scope?: NoteScope } {
  if (target instanceof NoteTreeItem) {
    if (target.itemType === 'folder' && target.folderPath) {
      return { folder: target.folderPath, scope: target.scope };
    }
    if (target.sectionId === 'workspace' || target.sectionId === 'global') {
      return { folder: '', scope: target.sectionId };
    }
    return { folder: '' };
  }

  if (target && !('uri' in target)) {
    return { folder: target.folder ?? '', scope: target.scope };
  }

  return { folder: '' };
}

// --- User feedback ---------------------------------------------------------

async function confirmDelete(question: string, confirmLabel: string): Promise<boolean> {
  if (!getConfiguration().confirmDelete) {
    return true;
  }
  const choice = await vscode.window.showWarningMessage(question, { modal: true }, confirmLabel);
  return choice === confirmLabel;
}

/**
 * The OS trash is not always available (remote workspaces, some Linux setups).
 * When we had to delete permanently, say so rather than letting the user assume it is recoverable.
 */
function warnIfPermanent(permanent: boolean, subject: string): void {
  if (permanent) {
    vscode.window.showWarningMessage(
      `${subject} was deleted permanently — the system trash was not available.`
    );
  }
}

function setStatusMessage(message: string): void {
  vscode.window.setStatusBarMessage(message, STATUS_MESSAGE_TIMEOUT_MS);
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
