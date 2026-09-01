import * as vscode from 'vscode';
import { NoteService } from './note-service';

export class WatcherService implements vscode.Disposable {
  private readonly _onDidChangeNotes = new vscode.EventEmitter<void>();
  public readonly onDidChangeNotes: vscode.Event<void> = this._onDidChangeNotes.event;

  private watchers: vscode.FileSystemWatcher[] = [];
  private debounceTimer?: NodeJS.Timeout;
  private readonly debounceDelay = 150;

  constructor(private readonly noteService: NoteService) {
    this.setupWatchers();
  }

  public setupWatchers(): void {
    this.disposeWatchers();

    // 1. Watch workspace notes if workspace exists
    const wsRoot = this.noteService.getWorkspaceRoot();
    if (wsRoot) {
      const wsPattern = new vscode.RelativePattern(wsRoot, '**/*.md');
      const wsWatcher = vscode.workspace.createFileSystemWatcher(wsPattern);
      this.bindWatcher(wsWatcher);
      this.watchers.push(wsWatcher);
    }

    // 2. Watch global notes
    const globalRoot = this.noteService.getGlobalRoot();
    const globalPattern = new vscode.RelativePattern(globalRoot, '**/*.md');
    const globalWatcher = vscode.workspace.createFileSystemWatcher(globalPattern);
    this.bindWatcher(globalWatcher);
    this.watchers.push(globalWatcher);
  }

  private bindWatcher(watcher: vscode.FileSystemWatcher): void {
    watcher.onDidCreate(() => this.triggerChange());
    watcher.onDidChange(() => this.triggerChange());
    watcher.onDidDelete(() => this.triggerChange());
  }

  private triggerChange(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this._onDidChangeNotes.fire();
    }, this.debounceDelay);
  }

  private disposeWatchers(): void {
    for (const w of this.watchers) {
      w.dispose();
    }
    this.watchers = [];
  }

  public dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.disposeWatchers();
    this._onDidChangeNotes.dispose();
  }
}
