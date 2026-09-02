import * as vscode from 'vscode';
import { MetadataService } from './services/metadata-service';
import { NoteService } from './services/note-service';
import { ProjectRegistry } from './services/project-registry';
import { SearchService } from './services/search-service';
import { WatcherService } from './services/watcher-service';
import { NotesTreeProvider } from './views/notes-tree-provider';
import { NotesDragAndDropController } from './views/notes-drag-drop';
import { QuickNoteViewProvider } from './views/quick-note-view';
import { NoteLinkProvider } from './providers/link-provider';
import { NoteCompletionProvider } from './providers/completion-provider';
import { registerNoteCommands } from './commands/note-commands';
import { registerSearchCommands } from './commands/search-commands';
import { registerOrganizationCommands } from './commands/organization-commands';
import { COMMANDS } from './constants/commands';
import { getConfiguration, CONFIG_SECTION } from './constants/config';

export const VIEW_ID = 'sidenote.explorer';

/** Context key that reveals the "Clear Tag Filter" action only while a filter is active. */
const TAG_FILTER_CONTEXT_KEY = 'sidenote.hasTagFilter';

export function activate(context: vscode.ExtensionContext): void {
  const metadataService = new MetadataService(context.workspaceState, context.globalState);
  const noteService = new NoteService(metadataService, new ProjectRegistry(context.globalState));
  const searchService = new SearchService(noteService);
  const watcherService = new WatcherService(noteService);
  context.subscriptions.push(watcherService);

  const treeProvider = new NotesTreeProvider(noteService, metadataService);
  context.subscriptions.push(
    vscode.window.createTreeView(VIEW_ID, {
      treeDataProvider: treeProvider,
      dragAndDropController: new NotesDragAndDropController(noteService),
      showCollapseAll: true,
      canSelectMany: false,
    })
  );

  // The scratchpad panel above the tree: a real .md file, edited without leaving the sidebar.
  const quickNote = new QuickNoteViewProvider(noteService, context.workspaceState, context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(QuickNoteViewProvider.viewId, quickNote, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  context.subscriptions.push(
    treeProvider.onDidChangeTagFilter((tag) =>
      vscode.commands.executeCommand('setContext', TAG_FILTER_CONTEXT_KEY, tag !== undefined)
    )
  );

  // Anything touching the notes folders invalidates every layer of cache at once.
  context.subscriptions.push(
    watcherService.onDidChangeNotes(() => {
      noteService.invalidate();
      searchService.clearCache();
      treeProvider.refresh();
      void quickNote.refresh();
    })
  );

  const statusBar = new QuickNoteStatusBarItem();
  context.subscriptions.push(statusBar);
  statusBar.sync();

  const markdownSelector: vscode.DocumentSelector = { scheme: 'file', language: 'markdown' };
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(markdownSelector, new NoteLinkProvider(noteService)),
    vscode.languages.registerCompletionItemProvider(
      markdownSelector,
      new NoteCompletionProvider(noteService),
      '['
    )
  );

  registerNoteCommands(context, noteService, metadataService, treeProvider);
  registerSearchCommands(context, noteService, searchService, metadataService, treeProvider);
  registerOrganizationCommands(context, noteService, treeProvider);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration(CONFIG_SECTION)) {
        return;
      }
      statusBar.sync();
      watcherService.setupWatchers();
      noteService.invalidate();
      searchService.clearCache();
      treeProvider.refresh();
      void quickNote.refresh();
    })
  );

  // A new workspace folder means a different notes root.
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      watcherService.setupWatchers();
      noteService.invalidate();
      searchService.clearCache();
      treeProvider.refresh();
    })
  );
}

export function deactivate(): void {
  // All disposables are owned by the extension context.
}

/** The optional status bar shortcut for capturing a note without opening the sidebar. */
class QuickNoteStatusBarItem implements vscode.Disposable {
  private item?: vscode.StatusBarItem;

  /** Creates, shows or hides the item to match the current configuration. */
  public sync(): void {
    if (!getConfiguration().showStatusBarItem) {
      this.item?.hide();
      return;
    }

    if (!this.item) {
      this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
      this.item.command = COMMANDS.NEW_NOTE;
      this.item.text = '$(note) New Note';
      this.item.tooltip = 'Create a new Markdown note (Sidenote)';
    }

    this.item.show();
  }

  public dispose(): void {
    this.item?.dispose();
    this.item = undefined;
  }
}
