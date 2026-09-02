import * as vscode from 'vscode';
import * as path from 'path';
import { NoteItem, NoteScope } from '../models/note';
import { MetadataService } from './metadata-service';
import { ProjectRegistry } from './project-registry';
import { TagService } from './tag-service';
import {
  sanitizeFilename,
  sanitizeRelativeFolderPath,
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

/** Guards against an accidental scan of a huge tree (or a symlink loop) locking up the sidebar. */
const MAX_DIRECTORY_DEPTH = 12;

/** Parsed content of one note file, reused while the file on disk is unchanged. */
interface ParsedNoteFile {
  mtime: number;
  size: number;
  title: string;
  tags: string[];
}

export interface DeleteOutcome {
  deleted: boolean;
  /** True when the OS trash was unavailable and the file was removed permanently. */
  permanent: boolean;
}

export class NoteService {
  /** Parsed title/tags per file path, keyed by mtime+size so unchanged files are never re-read. */
  private readonly parsedFiles = new Map<string, ParsedNoteFile>();

  /** In-flight or completed scan of the whole vault; cleared by {@link invalidate}. */
  private pendingScan?: Promise<NoteItem[]>;

  constructor(
    private readonly metadataService: MetadataService,
    private readonly projects: ProjectRegistry
  ) {}

  /**
   * Drops the cached note list. Parsed file contents survive, since they are
   * independently validated against each file's mtime and size.
   */
  public invalidate(): void {
    this.pendingScan = undefined;
  }

  // --- Roots ---------------------------------------------------------------

  /** The vault: one folder in your home directory holding every note Sidenote manages. */
  public getVaultRoot(): vscode.Uri {
    const configured = getConfiguration().vaultPath.trim() || '~/.sidenote';
    return vscode.Uri.file(resolveHome(configured));
  }

  /**
   * Notes for the current project, or undefined when no project is open.
   *
   * These live in the vault by default, not in the project directory. Notes are
   * personal, and a folder inside the repo ends up staged, reviewed, or pushed to a
   * team remote by accident. Teams who genuinely want checked-in project docs can
   * set `sidenote.projectNotesLocation` to `repo`.
   */
  public getWorkspaceRoot(): vscode.Uri | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return undefined;
    }

    const projectUri = folders[0].uri;
    const config = getConfiguration();

    if (config.projectNotesLocation === 'repo') {
      // Only a relative path inside the project is accepted; anything else is a typo
      // we should not act on, so fall back to the default.
      const configured = config.repoNotesPath.trim();
      const isSafe =
        configured !== '' && !path.isAbsolute(configured) && !configured.split(/[/\\]+/).includes('..');
      return vscode.Uri.joinPath(projectUri, isSafe ? configured : '.notes');
    }

    const folderName = this.projects.folderNameFor(projectUri.fsPath);
    return vscode.Uri.joinPath(this.getVaultRoot(), 'projects', folderName);
  }

  /** Notes available in every window, kept beside the per-project folders in the vault. */
  public getGlobalRoot(): vscode.Uri {
    return vscode.Uri.joinPath(this.getVaultRoot(), 'global');
  }

  /** Resolves the root directory for a scope, falling back to global when no workspace is open. */
  public getRoot(scope: NoteScope): vscode.Uri {
    if (scope === 'workspace') {
      const workspaceRoot = this.getWorkspaceRoot();
      if (workspaceRoot) {
        return workspaceRoot;
      }
    }
    return this.getGlobalRoot();
  }

  /** The scope a note lands in when the caller did not pick one. */
  public resolveDefaultScope(): NoteScope {
    return this.getWorkspaceRoot() ? getConfiguration().defaultScope : 'global';
  }

  // --- Reading -------------------------------------------------------------

  /**
   * Returns every note in both scopes. Results are cached until {@link invalidate}
   * is called, so repeated calls from the tree, link and completion providers are cheap.
   */
  public getAllNotes(): Promise<NoteItem[]> {
    if (!this.pendingScan) {
      this.pendingScan = this.scanAllNotes().catch((err) => {
        // A failed scan must not be cached, or the sidebar stays broken until reload.
        this.pendingScan = undefined;
        throw err;
      });
    }
    return this.pendingScan;
  }

  private async scanAllNotes(): Promise<NoteItem[]> {
    const notes: NoteItem[] = [];

    const workspaceRoot = this.getWorkspaceRoot();
    if (workspaceRoot && (await this.isExistingDirectory(workspaceRoot))) {
      notes.push(...(await this.readNotesFromDirectory(workspaceRoot, 'workspace', workspaceRoot.fsPath, 0)));
    }

    const globalRoot = this.getGlobalRoot();
    if (await this.isExistingDirectory(globalRoot)) {
      notes.push(...(await this.readNotesFromDirectory(globalRoot, 'global', globalRoot.fsPath, 0)));
    }

    return notes;
  }

  /**
   * Reports whether a directory exists, without ever calling into a path that is missing.
   *
   * Reading a non-existent directory makes VS Code's own disk provider log
   * `[node.js fs] readdir ... ENOENT` to the extension host console before our catch
   * can run. Since the notes root is absent in most projects, that noise appeared in
   * every window. Listing the parent and looking for the entry avoids the failed call.
   */
  private async isExistingDirectory(dirUri: vscode.Uri): Promise<boolean> {
    const parentPath = path.dirname(dirUri.fsPath);
    if (parentPath === dirUri.fsPath) {
      return false; // Filesystem root; nothing sensible to probe.
    }

    const name = path.basename(dirUri.fsPath);
    try {
      const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(parentPath));
      return entries.some(([entryName, type]) => entryName === name && type === vscode.FileType.Directory);
    } catch {
      return false; // Parent is missing too, so the root cannot exist.
    }
  }

  private async readNotesFromDirectory(
    dirUri: vscode.Uri,
    scope: NoteScope,
    rootDirFsPath: string,
    depth: number
  ): Promise<NoteItem[]> {
    if (depth > MAX_DIRECTORY_DEPTH) {
      return [];
    }

    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(dirUri);
    } catch {
      // Root does not exist yet, or is not readable. Both mean "no notes here".
      return [];
    }

    const notes: NoteItem[] = [];

    for (const [name, type] of entries) {
      if (name.startsWith('.')) {
        continue; // Hidden files and metadata folders are not notes.
      }

      const entryUri = vscode.Uri.joinPath(dirUri, name);

      if (type === vscode.FileType.Directory) {
        notes.push(...(await this.readNotesFromDirectory(entryUri, scope, rootDirFsPath, depth + 1)));
        continue;
      }

      if (type !== vscode.FileType.File || !name.toLowerCase().endsWith('.md')) {
        continue;
      }

      const note = await this.toNoteItem(entryUri, name, scope, rootDirFsPath);
      if (note) {
        notes.push(note);
      }
    }

    return notes;
  }

  private async toNoteItem(
    uri: vscode.Uri,
    filename: string,
    scope: NoteScope,
    rootDirFsPath: string
  ): Promise<NoteItem | undefined> {
    let stat: vscode.FileStat;
    try {
      stat = await vscode.workspace.fs.stat(uri);
    } catch {
      return undefined; // Deleted between listing and stat.
    }

    const parsed = await this.parseFile(uri, filename, stat);
    if (!parsed) {
      return undefined;
    }

    const relativePath = toRelativePath(rootDirFsPath, uri.fsPath);
    const parentDir = path.dirname(relativePath);
    const folder = parentDir === '.' ? '' : parentDir.split(path.sep).join('/');
    const id = `${scope}:${relativePath}`;

    return {
      id,
      title: parsed.title,
      uri,
      relativePath,
      folder,
      filename,
      scope,
      ctime: stat.ctime,
      mtime: stat.mtime,
      size: stat.size,
      tags: parsed.tags,
      isFavorite: this.metadataService.isFavorite(id),
      isArchived: this.metadataService.isArchived(id),
    };
  }

  /** Reads and parses a note's title and tags, reusing the cached parse when the file is unchanged. */
  private async parseFile(
    uri: vscode.Uri,
    filename: string,
    stat: vscode.FileStat
  ): Promise<ParsedNoteFile | undefined> {
    const cached = this.parsedFiles.get(uri.fsPath);
    if (cached && cached.mtime === stat.mtime && cached.size === stat.size) {
      return cached;
    }

    let content: string;
    try {
      content = await this.readNoteContent(uri);
    } catch {
      return undefined; // Unreadable file: skip rather than break the whole scan.
    }

    const parsed: ParsedNoteFile = {
      mtime: stat.mtime,
      size: stat.size,
      title: extractTitleFromMarkdown(content, stripMarkdownExtension(filename)),
      tags: TagService.extractTags(content),
    };

    this.parsedFiles.set(uri.fsPath, parsed);
    return parsed;
  }

  public async readNoteContent(uri: vscode.Uri): Promise<string> {
    const raw = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(raw).toString('utf8');
  }

  // --- Writing -------------------------------------------------------------

  /**
   * Creates a new note file, never overwriting an existing one.
   * `folder` is sanitized, so it can never escape the notes root.
   */
  public async createNote(options: {
    title: string;
    folder?: string;
    scope?: NoteScope;
    content?: string;
  }): Promise<NoteItem> {
    const config = getConfiguration();
    const scope = options.scope ?? this.resolveDefaultScope();
    const root = this.getRoot(scope);
    const folder = sanitizeRelativeFolderPath(options.folder ?? '');

    const targetDir = folder ? vscode.Uri.joinPath(root, folder) : root;
    await vscode.workspace.fs.createDirectory(targetDir);

    const baseName = stripMarkdownExtension(sanitizeFilename(options.title || 'Untitled'));
    const fileUri = await this.findAvailableUri(targetDir, baseName);

    const content =
      options.content ??
      renderTemplate(config.defaultNoteTemplate, { title: options.title || 'Untitled' }, config.dateFormat);

    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'));
    this.invalidate();

    const filename = path.basename(fileUri.fsPath);
    const relativePath = toRelativePath(root.fsPath, fileUri.fsPath);
    const id = `${scope}:${relativePath}`;
    const stat = await vscode.workspace.fs.stat(fileUri);

    await this.metadataService.recordRecent(id, config.recentLimit);

    return {
      id,
      title: extractTitleFromMarkdown(content, stripMarkdownExtension(filename)),
      uri: fileUri,
      relativePath,
      folder,
      filename,
      scope,
      ctime: stat.ctime,
      mtime: stat.mtime,
      size: stat.size,
      tags: TagService.extractTags(content),
      isFavorite: false,
      isArchived: false,
    };
  }

  /** Finds `<base>.md`, or the first free `<base>-<n>.md`, inside a directory. */
  private async findAvailableUri(dirUri: vscode.Uri, baseName: string): Promise<vscode.Uri> {
    for (let counter = 0; ; counter++) {
      const filename = ensureMarkdownExtension(counter === 0 ? baseName : `${baseName}-${counter}`);
      const candidate = vscode.Uri.joinPath(dirUri, filename);
      try {
        await vscode.workspace.fs.stat(candidate);
      } catch {
        return candidate; // stat failed, so nothing is there.
      }
    }
  }

  public async createFolder(folderRelativePath: string, scope?: NoteScope): Promise<vscode.Uri> {
    const root = this.getRoot(scope ?? this.resolveDefaultScope());
    const sanitized = sanitizeRelativeFolderPath(folderRelativePath);

    if (!sanitized) {
      throw new Error('That folder name contains no usable characters.');
    }

    const folderUri = vscode.Uri.joinPath(root, sanitized);
    await vscode.workspace.fs.createDirectory(folderUri);
    this.invalidate();
    return folderUri;
  }

  public async renameNote(note: NoteItem, newTitle: string): Promise<NoteItem> {
    const newFilename = ensureMarkdownExtension(sanitizeFilename(newTitle));
    const parentDir = vscode.Uri.file(path.dirname(note.uri.fsPath));
    const targetUri = vscode.Uri.joinPath(parentDir, newFilename);

    if (note.uri.fsPath === targetUri.fsPath) {
      return note;
    }

    await vscode.workspace.fs.rename(note.uri, targetUri, { overwrite: false });
    this.forgetFile(note.uri);
    this.invalidate();

    const root = this.getRoot(note.scope);
    const relativePath = toRelativePath(root.fsPath, targetUri.fsPath);
    const id = `${note.scope}:${relativePath}`;

    await this.metadataService.updateNoteId(note.id, id);

    const stat = await vscode.workspace.fs.stat(targetUri);
    const content = await this.readNoteContent(targetUri);

    return {
      ...note,
      id,
      title: extractTitleFromMarkdown(content, stripMarkdownExtension(newFilename)),
      uri: targetUri,
      relativePath,
      filename: newFilename,
      mtime: stat.mtime,
    };
  }

  /**
   * Renames a folder in place and remaps the stored state of every note inside it.
   * Returns the folder's new root-relative path.
   */
  public async renameFolder(folderPath: string, newName: string, scope: NoteScope): Promise<string> {
    const root = this.getRoot(scope);
    const sourceUri = vscode.Uri.joinPath(root, folderPath);
    this.assertInsideRoot(root, sourceUri, 'folder');

    const parent = folderPath.includes('/') ? folderPath.slice(0, folderPath.lastIndexOf('/')) : '';
    const sanitizedName = sanitizeFilename(newName, '');
    if (!sanitizedName) {
      throw new Error('That folder name contains no usable characters.');
    }

    const targetPath = parent ? `${parent}/${sanitizedName}` : sanitizedName;
    if (targetPath === folderPath) {
      return folderPath;
    }

    const targetUri = vscode.Uri.joinPath(root, targetPath);
    this.assertInsideRoot(root, targetUri, 'folder');

    await vscode.workspace.fs.rename(sourceUri, targetUri, { overwrite: false });
    this.forgetFilesUnder(sourceUri);
    this.invalidate();

    await this.metadataService.updateFolderId(`${scope}:${folderPath}`, `${scope}:${targetPath}`);
    return targetPath;
  }

  /**
   * Deletes a note, preferring the OS trash. Reports whether the deletion was permanent
   * so the caller can tell the user their note is not recoverable.
   */
  public async deleteNote(note: NoteItem): Promise<DeleteOutcome> {
    const outcome = await this.deleteUri(note.uri, false);
    if (outcome.deleted) {
      this.forgetFile(note.uri);
      this.invalidate();
      await this.metadataService.removeNote(note.id);
    }
    return outcome;
  }

  /** Deletes a folder and everything inside it, preferring the OS trash. */
  public async deleteFolder(folderPath: string, scope: NoteScope): Promise<DeleteOutcome> {
    const root = this.getRoot(scope);
    const folderUri = vscode.Uri.joinPath(root, folderPath);
    this.assertInsideRoot(root, folderUri, 'folder');

    const outcome = await this.deleteUri(folderUri, true);
    if (outcome.deleted) {
      this.forgetFilesUnder(folderUri);
      this.invalidate();
      await this.metadataService.removeNotesUnder(`${scope}:${folderPath}`);
    }
    return outcome;
  }

  private async deleteUri(uri: vscode.Uri, recursive: boolean): Promise<DeleteOutcome> {
    try {
      await vscode.workspace.fs.delete(uri, { recursive, useTrash: true });
      return { deleted: true, permanent: false };
    } catch {
      // No OS trash available (common on remotes and some Linux setups): fall back to
      // a permanent delete, and tell the caller so it can warn the user.
      await vscode.workspace.fs.delete(uri, { recursive, useTrash: false });
      return { deleted: true, permanent: true };
    }
  }

  public async duplicateNote(note: NoteItem): Promise<NoteItem> {
    const content = await this.readNoteContent(note.uri);
    return this.createNote({
      title: `${stripMarkdownExtension(note.filename)} (Copy)`,
      folder: note.folder,
      scope: note.scope,
      content,
    });
  }

  /** Moves a note into another folder, and optionally another scope. */
  public async moveNote(note: NoteItem, targetFolder: string, targetScope?: NoteScope): Promise<NoteItem> {
    const scope = targetScope ?? note.scope;
    const root = this.getRoot(scope);
    const folder = sanitizeRelativeFolderPath(targetFolder);

    const targetDir = folder ? vscode.Uri.joinPath(root, folder) : root;
    const targetUri = vscode.Uri.joinPath(targetDir, note.filename);

    if (note.uri.fsPath === targetUri.fsPath) {
      return note;
    }

    await vscode.workspace.fs.createDirectory(targetDir);
    await vscode.workspace.fs.rename(note.uri, targetUri, { overwrite: false });
    this.forgetFile(note.uri);
    this.invalidate();

    const relativePath = toRelativePath(root.fsPath, targetUri.fsPath);
    const id = `${scope}:${relativePath}`;
    await this.metadataService.updateNoteId(note.id, id);

    return { ...note, id, uri: targetUri, relativePath, folder, scope };
  }

  /**
   * Opens today's daily note, creating it if it does not exist yet.
   * The filename is the sanitized formatted date, matched inside the configured daily folder only.
   */
  public async getOrCreateDailyNote(scope?: NoteScope): Promise<NoteItem> {
    const config = getConfiguration();
    const targetScope = scope ?? this.resolveDefaultScope();
    const dailyFolder = sanitizeRelativeFolderPath(config.dailyNoteFolder);
    const formattedDate = getTodayDateString(config.dateFormat);
    // The date may contain characters (`/`, `:`) that cannot appear in a filename,
    // so match against the same sanitized name that createNote would produce.
    const expectedName = stripMarkdownExtension(sanitizeFilename(formattedDate, 'Untitled'));

    const notes = await this.getAllNotes();
    const existing = notes.find(
      (note) =>
        note.scope === targetScope &&
        note.folder === dailyFolder &&
        stripMarkdownExtension(note.filename) === expectedName
    );

    if (existing) {
      await this.metadataService.recordRecent(existing.id, config.recentLimit);
      return existing;
    }

    return this.createNote({
      title: formattedDate,
      folder: dailyFolder,
      scope: targetScope,
      content: renderTemplate(
        config.dailyNoteTemplate,
        { title: formattedDate, date: formattedDate },
        config.dateFormat
      ),
    });
  }

  // --- Helpers -------------------------------------------------------------

  public sortNotes(notes: readonly NoteItem[], sortBy?: NoteSortOrder): NoteItem[] {
    const order = sortBy ?? getConfiguration().sortBy;
    const byTitle = (a: NoteItem, b: NoteItem) =>
      a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });

    switch (order) {
      case 'modifiedAsc':
        return [...notes].sort((a, b) => a.mtime - b.mtime);
      case 'titleAsc':
        return [...notes].sort(byTitle);
      case 'titleDesc':
        return [...notes].sort((a, b) => byTitle(b, a));
      case 'createdDesc':
        return [...notes].sort((a, b) => b.ctime - a.ctime);
      case 'modifiedDesc':
      default:
        return [...notes].sort((a, b) => b.mtime - a.mtime);
    }
  }

  private assertInsideRoot(root: vscode.Uri, target: vscode.Uri, label: string): void {
    if (!isPathInside(root.fsPath, target.fsPath)) {
      throw new Error(`Refusing to touch a ${label} outside the notes folder.`);
    }
  }

  private forgetFile(uri: vscode.Uri): void {
    this.parsedFiles.delete(uri.fsPath);
  }

  private forgetFilesUnder(dirUri: vscode.Uri): void {
    const prefix = `${dirUri.fsPath}${path.sep}`;
    for (const fsPath of this.parsedFiles.keys()) {
      if (fsPath.startsWith(prefix)) {
        this.parsedFiles.delete(fsPath);
      }
    }
  }
}
