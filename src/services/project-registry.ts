import * as path from 'path';
import * as vscode from 'vscode';
import { sanitizeFilename } from '../utils/path-utils';

/** Maps each project's absolute path to the vault folder holding its notes. */
const STORAGE_KEY = 'sidenote.projectFolders';

type FolderMap = Record<string, string>;

/**
 * Decides which folder inside the vault holds a given project's notes.
 *
 * The folder is named after the project directory, because that is what a person
 * recognises when they browse the vault. A basename is not unique, though, so the
 * chosen name is remembered per absolute path: moving or renaming a project keeps
 * its notes, and a second `api` checkout gets `api-2` rather than silently sharing.
 */
export class ProjectRegistry {
  /**
   * Names assigned during this session. `folderNameFor` is synchronous but persisting
   * is not, so without this a second call before the write lands could hand out the
   * same name twice.
   */
  private readonly assigned = new Map<string, string>();

  constructor(private readonly globalState: vscode.Memento) {}

  /** Returns the vault folder name for a project path, assigning one on first use. */
  public folderNameFor(projectPath: string): string {
    const map = { ...this.read(), ...Object.fromEntries(this.assigned) };
    const existing = map[projectPath];
    if (existing) {
      return existing;
    }

    const taken = new Set(Object.values(map));
    const base = sanitizeFilename(path.basename(projectPath), 'project');

    let candidate = base;
    for (let suffix = 2; taken.has(candidate); suffix++) {
      candidate = `${base}-${suffix}`;
    }

    this.assigned.set(projectPath, candidate);
    void this.remember(projectPath, candidate);
    return candidate;
  }

  private async remember(projectPath: string, folderName: string): Promise<void> {
    const map = this.read();
    if (map[projectPath] === folderName) {
      return;
    }
    await this.globalState.update(STORAGE_KEY, { ...map, [projectPath]: folderName });
  }

  private read(): FolderMap {
    return this.globalState.get<FolderMap>(STORAGE_KEY, {});
  }
}
