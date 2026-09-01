import * as vscode from 'vscode';
import * as path from 'path';
import { NoteItem, NoteScope } from '../models/note';
import { MetadataService } from './metadata-service';
import { TagService } from './tag-service';
import {
  sanitizeFilename,
  ensureMarkdownExtension,
  resolveHome,
  isPathInside,
  extractTitleFromMarkdown,
  toRelativePath,
  stripMarkdownExtension,
} from '../utils/path-utils';
import { renderTemplate } from '../utils/template-utils';
import { getTodayDateString } from '../utils/date-utils';
import { getConfiguration, NoteSortOrder } from '../constants/config';

export class NoteService {
  constructor(
    private readonly metadataService: MetadataService
  ) {}

  /**
   * Returns the workspace notes directory Uri, or undefined if no workspace is open.
   */
  public getWorkspaceRoot(): vscode.Uri | undefined {
    const wsFolders = vscode.workspace.workspaceFolders;
    if (!wsFolders || wsFolders.length === 0) {
      return undefined;
    }
    const config = getConfiguration();
    const relPath = config.notesPath || '.notes';
    return vscode.Uri.joinPath(wsFolders[0].uri, relPath);
  }

  /**
   * Returns the global notes directory Uri.
   */
  public getGlobalRoot(): vscode.Uri {
    const config = getConfiguration();
    const configuredPath = config.globalNotesPath || '~/.sidebar-notes';
    const resolved = resolveHome(configuredPath);
    return vscode.Uri.file(resolved);
  }

  /**
   * Ensures the notes directories exist on disk.
   */
  public async ensureDirectories(): Promise<void> {
    const globalRoot = this.getGlobalRoot();
    try {
      await vscode.workspace.fs.createDirectory(globalRoot);
    } catch {
      // Directory might already exist
    }

    const wsRoot = this.getWorkspaceRoot();
    if (wsRoot) {
      try {
        await vscode.workspace.fs.createDirectory(wsRoot);
      } catch {
        // Directory might already exist
      }
    }
  }

  /**
   * Reads all markdown notes from workspace and global directories.
   */
  public async getAllNotes(): Promise<NoteItem[]> {
    await this.ensureDirectories();
    const notes: NoteItem[] = [];

    // 1. Read Workspace Notes
    const wsRoot = this.getWorkspaceRoot();
    if (wsRoot) {
      const wsNotes = await this.readNotesFromDirectory(wsRoot, 'workspace', wsRoot.fsPath);
      notes.push(...wsNotes);
    }

    // 2. Read Global Notes
    const globalRoot = this.getGlobalRoot();
    const globalNotes = await this.readNotesFromDirectory(globalRoot, 'global', globalRoot.fsPath);
    notes.push(...globalNotes);

    return notes;
  }

  private async readNotesFromDirectory(
    dirUri: vscode.Uri,
    scope: NoteScope,
    rootDirFsPath: string
  ): Promise<NoteItem[]> {
    const notes: NoteItem[] = [];

    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(dirUri);
    } catch {
      return notes;
    }

    for (const [name, type] of entries) {
      if (name.startsWith('.')) {
        continue; // Ignore hidden files and metadata folders
      }

      const entryUri = vscode.Uri.joinPath(dirUri, name);

      if (type === vscode.FileType.Directory) {
        // Recursively read subfolders
        const subNotes = await this.readNotesFromDirectory(entryUri, scope, rootDirFsPath);
        notes.push(...subNotes);
      } else if (type === vscode.FileType.File && name.toLowerCase().endsWith('.md')) {
        try {
          const stat = await vscode.workspace.fs.stat(entryUri);
          const rawContent = await vscode.workspace.fs.readFile(entryUri);
          const content = Buffer.from(rawContent).toString('utf8');

          const fallbackTitle = stripMarkdownExtension(name);
          const title = extractTitleFromMarkdown(content, fallbackTitle);
          const relativePath = toRelativePath(rootDirFsPath, entryUri.fsPath);
          const folder = path.dirname(relativePath) === '.' ? '' : path.dirname(relativePath).split(path.sep).join('/');
          const id = `${scope}:${relativePath}`;
          const tags = TagService.extractTags(content);
          const isPinned = this.metadataService.isFavorite(id);
          const isArchived = this.metadataService.isArchived(id);

          notes.push({
            id,
            title,
            uri: entryUri,
            relativePath,
            folder,
            filename: name,
            scope,
            ctime: stat.ctime,
            mtime: stat.mtime,
            size: stat.size,
            tags,
            isPinned,
            isArchived,
          });
        } catch {
          // Ignore unreadable files
        }
      }
    }

    return notes;
  }

  /**
   * Reads raw string content of a note.
   */
  public async readNoteContent(uri: vscode.Uri): Promise<string> {
    const raw = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(raw).toString('utf8');
  }

  /**
   * Creates a new note file.
   */
  public async createNote(options: {
    title: string;
    folder?: string;
    scope?: NoteScope;
    content?: string;
  }): Promise<NoteItem> {
    const config = getConfiguration();
    const scope = options.scope || (this.getWorkspaceRoot() ? config.defaultScope : 'global');
    const root = scope === 'workspace' && this.getWorkspaceRoot() ? this.getWorkspaceRoot()! : this.getGlobalRoot();

    const sanitizedTitle = sanitizeFilename(options.title || 'Untitled');
    const filename = ensureMarkdownExtension(sanitizedTitle);
    const folder = options.folder ? options.folder.trim().replace(/^\/+|\/+$/g, '') : '';

    let targetDir = root;
    if (folder) {
      targetDir = vscode.Uri.joinPath(root, folder);
      await vscode.workspace.fs.createDirectory(targetDir);
    }

    let fileUri = vscode.Uri.joinPath(targetDir, filename);

    // Prevent overwriting existing note with same name by appending number
    let counter = 1;
    let nameConflict = true;
    while (nameConflict) {
      try {
        await vscode.workspace.fs.stat(fileUri);
        // File exists, generate new name
        const base = stripMarkdownExtension(filename);
        fileUri = vscode.Uri.joinPath(targetDir, `${base}-${counter}.md`);
        counter++;
      } catch {
        // File does not exist, safe to proceed
        nameConflict = false;
      }
    }

    const initialContent =
      options.content !== undefined
        ? options.content
        : renderTemplate(
            config.defaultNoteTemplate,
            { title: options.title || 'Untitled' },
            config.dateFormat
          );

    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(initialContent, 'utf8'));

    const stat = await vscode.workspace.fs.stat(fileUri);
    const relativePath = toRelativePath(root.fsPath, fileUri.fsPath);
    const id = `${scope}:${relativePath}`;
    const tags = TagService.extractTags(initialContent);

    const noteItem: NoteItem = {
      id,
      title: extractTitleFromMarkdown(initialContent, stripMarkdownExtension(path.basename(fileUri.fsPath))),
      uri: fileUri,
      relativePath,
      folder,
      filename: path.basename(fileUri.fsPath),
      scope,
      ctime: stat.ctime,
      mtime: stat.mtime,
      size: stat.size,
      tags,
      isPinned: false,
      isArchived: false,
    };

    await this.metadataService.recordRecent(id, config.recentLimit);
    return noteItem;
  }

  /**
   * Creates a new folder inside notes root.
   */
  public async createFolder(folderRelativePath: string, scope?: NoteScope): Promise<vscode.Uri> {
    const config = getConfiguration();
    const actualScope = scope || (this.getWorkspaceRoot() ? config.defaultScope : 'global');
    const root =
      actualScope === 'workspace' && this.getWorkspaceRoot()
        ? this.getWorkspaceRoot()!
        : this.getGlobalRoot();

    const sanitized = folderRelativePath
      .split(/[/\\]+/)
      .map((segment) => sanitizeFilename(segment))
      .filter(Boolean)
      .join('/');

    const folderUri = vscode.Uri.joinPath(root, sanitized);
    await vscode.workspace.fs.createDirectory(folderUri);
    return folderUri;
  }

  /**
   * Renames a note file.
   */
  public async renameNote(note: NoteItem, newTitle: string): Promise<NoteItem> {
    const sanitized = sanitizeFilename(newTitle);
    const newFilename = ensureMarkdownExtension(sanitized);
    const targetUri = vscode.Uri.joinPath(vscode.Uri.file(path.dirname(note.uri.fsPath)), newFilename);

    if (note.uri.fsPath === targetUri.fsPath) {
      return note;
    }

    await vscode.workspace.fs.rename(note.uri, targetUri, { overwrite: false });

    const root = note.scope === 'workspace' && this.getWorkspaceRoot() ? this.getWorkspaceRoot()! : this.getGlobalRoot();
    const newRelativePath = toRelativePath(root.fsPath, targetUri.fsPath);
    const newId = `${note.scope}:${newRelativePath}`;

    await this.metadataService.updateNoteId(note.id, newId);

    const stat = await vscode.workspace.fs.stat(targetUri);
    const content = await this.readNoteContent(targetUri);

    return {
      ...note,
      id: newId,
      title: extractTitleFromMarkdown(content, stripMarkdownExtension(newFilename)),
      uri: targetUri,
      relativePath: newRelativePath,
      filename: newFilename,
      mtime: stat.mtime,
    };
  }

  /**
   * Deletes a note file.
   */
  public async deleteNote(note: NoteItem, confirm = true): Promise<boolean> {
    if (confirm) {
      const config = getConfiguration();
      if (config.confirmDelete) {
        const choice = await vscode.window.showWarningMessage(
          `Are you sure you want to delete "${note.title}"?`,
          { modal: true },
          'Delete Note'
        );
        if (choice !== 'Delete Note') {
          return false;
        }
      }
    }

    try {
      await vscode.workspace.fs.delete(note.uri, { useTrash: true });
    } catch {
      await vscode.workspace.fs.delete(note.uri, { useTrash: false });
    }

    await this.metadataService.removeNote(note.id);
    return true;
  }

  /**
   * Deletes a folder and all its contents.
   */
  public async deleteFolder(folderPath: string, scope: NoteScope, confirm = true): Promise<boolean> {
    const root = scope === 'workspace' && this.getWorkspaceRoot() ? this.getWorkspaceRoot()! : this.getGlobalRoot();
    const folderUri = vscode.Uri.joinPath(root, folderPath);

    if (!isPathInside(root.fsPath, folderUri.fsPath)) {
      throw new Error('Access denied: folder is outside notes root');
    }

    if (confirm) {
      const config = getConfiguration();
      if (config.confirmDelete) {
        const choice = await vscode.window.showWarningMessage(
          `Are you sure you want to delete folder "${folderPath}" and all notes inside?`,
          { modal: true },
          'Delete Folder'
        );
        if (choice !== 'Delete Folder') {
          return false;
        }
      }
    }

    try {
      await vscode.workspace.fs.delete(folderUri, { recursive: true, useTrash: true });
    } catch {
      await vscode.workspace.fs.delete(folderUri, { recursive: true, useTrash: false });
    }

    return true;
  }

  /**
   * Duplicates an existing note.
   */
  public async duplicateNote(note: NoteItem): Promise<NoteItem> {
    const content = await this.readNoteContent(note.uri);
    const baseName = stripMarkdownExtension(note.filename);
    const newTitle = `${baseName} (Copy)`;

    return this.createNote({
      title: newTitle,
      folder: note.folder,
      scope: note.scope,
      content,
    });
  }

  /**
   * Moves a note to another folder or changes its scope.
   */
  public async moveNote(
    note: NoteItem,
    targetFolder: string,
    targetScope?: NoteScope
  ): Promise<NoteItem> {
    const scope = targetScope || note.scope;
    const targetRoot =
      scope === 'workspace' && this.getWorkspaceRoot()
        ? this.getWorkspaceRoot()!
        : this.getGlobalRoot();

    const normalizedFolder = targetFolder.trim().replace(/^\/+|\/+$/g, '');
    const targetDir = normalizedFolder
      ? vscode.Uri.joinPath(targetRoot, normalizedFolder)
      : targetRoot;

    await vscode.workspace.fs.createDirectory(targetDir);

    const targetUri = vscode.Uri.joinPath(targetDir, note.filename);
    if (note.uri.fsPath === targetUri.fsPath) {
      return note;
    }

    await vscode.workspace.fs.rename(note.uri, targetUri, { overwrite: false });

    const newRelativePath = toRelativePath(targetRoot.fsPath, targetUri.fsPath);
    const newId = `${scope}:${newRelativePath}`;

    await this.metadataService.updateNoteId(note.id, newId);

    return {
      ...note,
      id: newId,
      uri: targetUri,
      relativePath: newRelativePath,
      folder: normalizedFolder,
      scope,
    };
  }

  /**
   * Gets or creates today's scratchpad note (e.g. `2026-09-02.md`).
   */
  public async getOrCreateScratchpad(scope?: NoteScope): Promise<NoteItem> {
    const config = getConfiguration();
    const today = getTodayDateString(config.dateFormat);
    const notes = await this.getAllNotes();

    const existing = notes.find((n) => {
      const matchScope = !scope || n.scope === scope;
      return matchScope && stripMarkdownExtension(n.filename) === today;
    });

    if (existing) {
      await this.metadataService.recordRecent(existing.id, config.recentLimit);
      return existing;
    }

    const scratchpadContent = renderTemplate(
      config.scratchpadTemplate,
      { title: `Daily Scratchpad - ${today}`, date: today },
      config.dateFormat
    );

    return this.createNote({
      title: today,
      folder: 'daily',
      scope: scope || (this.getWorkspaceRoot() ? config.defaultScope : 'global'),
      content: scratchpadContent,
    });
  }

  /**
   * Sorts note items according to the given sort order.
   */
  public sortNotes(notes: NoteItem[], sortBy?: NoteSortOrder): NoteItem[] {
    const sort = sortBy || getConfiguration().sortBy;
    const sorted = [...notes];

    switch (sort) {
      case 'modifiedDesc':
        return sorted.sort((a, b) => b.mtime - a.mtime);
      case 'modifiedAsc':
        return sorted.sort((a, b) => a.mtime - b.mtime);
      case 'titleAsc':
        return sorted.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
      case 'titleDesc':
        return sorted.sort((a, b) => b.title.localeCompare(a.title, undefined, { numeric: true }));
      case 'createdDesc':
        return sorted.sort((a, b) => b.ctime - a.ctime);
      default:
        return sorted.sort((a, b) => b.mtime - a.mtime);
    }
  }
}
