import * as vscode from 'vscode';
import { NoteTreeItem } from '../models/tree-item';
import { NoteService } from '../services/note-service';

export const NOTE_MIME_TYPE = 'application/vnd.code.tree.sidenote';

export class NotesDragAndDropController implements vscode.TreeDragAndDropController<NoteTreeItem> {
  public readonly dropMimeTypes = [NOTE_MIME_TYPE];
  public readonly dragMimeTypes = [NOTE_MIME_TYPE];

  constructor(private readonly noteService: NoteService) {}

  public async handleDrag(
    source: readonly NoteTreeItem[],
    treeDataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const noteItems = source.filter((item) => item.note !== undefined);
    if (noteItems.length > 0) {
      treeDataTransfer.set(
        NOTE_MIME_TYPE,
        new vscode.DataTransferItem(noteItems.map((item) => item.note!))
      );
    }
  }

  public async handleDrop(
    target: NoteTreeItem | undefined,
    treeDataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const transferItem = treeDataTransfer.get(NOTE_MIME_TYPE);
    if (!transferItem) {
      return;
    }

    const draggedNotes = transferItem.value as import('../models/note').NoteItem[];
    if (!draggedNotes || draggedNotes.length === 0) {
      return;
    }

    // Determine target folder and scope
    let targetFolder = '';
    let targetScope: import('../models/note').NoteScope | undefined;

    if (target) {
      if (target.itemType === 'folder' && target.folderPath !== undefined) {
        targetFolder = target.folderPath;
        targetScope = target.scope;
      } else if (target.itemType === 'section') {
        if (target.sectionId === 'workspace') {
          targetFolder = '';
          targetScope = 'workspace';
        } else if (target.sectionId === 'global') {
          targetFolder = '';
          targetScope = 'global';
        } else {
          return; // Cannot drop onto tags or recents
        }
      } else if (target.itemType === 'note' && target.note) {
        targetFolder = target.note.folder;
        targetScope = target.note.scope;
      }
    }

    if (targetScope === undefined && draggedNotes.length > 0) {
      targetScope = draggedNotes[0].scope;
    }

    for (const note of draggedNotes) {
      try {
        await this.noteService.moveNote(note, targetFolder, targetScope);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to move note "${note.title}": ${msg}`);
      }
    }
  }
}
