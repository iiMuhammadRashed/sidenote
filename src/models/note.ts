import * as vscode from 'vscode';

export type NoteScope = 'workspace' | 'global';

export interface NoteItem {
  /** Unique ID in the format `${scope}:${relativePath}` */
  id: string;
  /** Display title of the note (from Markdown heading or filename) */
  title: string;
  /** Direct file Uri */
  uri: vscode.Uri;
  /** Relative path inside the notes root (e.g. `Work/Project.md` or `Scratch.md`) */
  relativePath: string;
  /** Parent folder relative to notes root (e.g. `Work` or `""` for root) */
  folder: string;
  /** Filename with extension (e.g. `Project.md`) */
  filename: string;
  /** Scope: workspace or global */
  scope: NoteScope;
  /** Creation time in milliseconds */
  ctime: number;
  /** Last modification time in milliseconds */
  mtime: number;
  /** Size in bytes */
  size: number;
  /** Extracted tags (e.g. ['work', 'todo']) */
  tags: string[];
  /** Is favorite / pinned */
  isPinned: boolean;
  /** Is archived */
  isArchived: boolean;
  /** Search excerpt preview */
  excerpt?: string;
}

export interface FolderItem {
  relativePath: string;
  name: string;
  scope: NoteScope;
  uri: vscode.Uri;
}
