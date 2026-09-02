import * as vscode from 'vscode';
import { NoteService } from './note-service';
import { getConfiguration } from '../constants/config';

/** Coalescing window, so a burst of writes produces one notification. */
const DEBOUNCE_MS = 150;

export class WatcherService implements vscode.Disposable {
  private readonly onDidChangeNotesEmitter = new vscode.EventEmitter<readonly vscode.Uri[]>();
  /** Fires with the note files that changed since the last notification. */
  public readonly onDidChangeNotes: vscode.Event<readonly vscode.Uri[]> =
    this.onDidChangeNotesEmitter.event;

  private watchers: vscode.FileSystemWatcher[] = [];
  private debounceTimer?: NodeJS.Timeout;
  private changed = new Set<string>();

  constructor(private readonly noteService: NoteService) {
    this.setupWatchers();
  }

  public setupWatchers(): void {
    this.disposeWatchers();

    // One watcher for the whole vault. Project and global notes are both inside it,
    // so watching each separately meant two overlapping recursive watchers on a
    // home-directory subtree.
    this.watch(this.noteService.getVaultRoot());

    // The repo folder is only a separate location when the user opted into it.
    if (getConfiguration().projectNotesLocation === 'repo') {
      const projectRoot = this.noteService.getWorkspaceRoot();
      if (projectRoot) {
        this.watch(projectRoot);
      }
    }
  }

  private watch(root: vscode.Uri): void {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '**/*.md'));
    watcher.onDidCreate((uri) => this.record(uri));
    watcher.onDidChange((uri) => this.record(uri));
    watcher.onDidDelete((uri) => this.record(uri));
    this.watchers.push(watcher);
  }

  private record(uri: vscode.Uri): void {
    this.changed.add(uri.fsPath);
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      const uris = Array.from(this.changed, (fsPath) => vscode.Uri.file(fsPath));
      this.changed.clear();
      this.onDidChangeNotesEmitter.fire(uris);
    }, DEBOUNCE_MS);
  }

  private disposeWatchers(): void {
    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    this.watchers = [];
  }

  public dispose(): void {
    clearTimeout(this.debounceTimer);
    this.disposeWatchers();
    this.onDidChangeNotesEmitter.dispose();
  }
}
