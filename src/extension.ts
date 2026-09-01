import * as vscode from 'vscode';
import { MetadataService } from './services/metadata-service';
import { NoteService } from './services/note-service';
import { SearchService } from './services/search-service';
import { WatcherService } from './services/watcher-service';
import { NotesTreeProvider } from './views/notes-tree-provider';
import { NotesDragAndDropController } from './views/notes-drag-drop';
import { NoteLinkProvider } from './providers/link-provider';
import { NoteCompletionProvider } from './providers/completion-provider';
import { registerNoteCommands } from './commands/note-commands';
import { registerSearchCommands } from './commands/search-commands';
import { registerOrganizationCommands } from './commands/organization-commands';
import { COMMANDS } from './constants/commands';
import { getConfiguration, CONFIG_SECTION } from './constants/config';

let statusBarItem: vscode.StatusBarItem | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // 1. Initialize Services
  const metadataService = new MetadataService(context.workspaceState, context.globalState);
  const noteService = new NoteService(metadataService);
  const searchService = new SearchService(noteService);
  const watcherService = new WatcherService(noteService);
  context.subscriptions.push(watcherService);

  // 2. Initialize Views
  const treeProvider = new NotesTreeProvider(noteService, metadataService);
  const dragAndDropController = new NotesDragAndDropController(noteService);

  const treeView = vscode.window.createTreeView('sidebarNotes.explorer', {
    treeDataProvider: treeProvider,
    dragAndDropController,
    showCollapseAll: true,
    canSelectMany: false,
  });
  context.subscriptions.push(treeView);

  // 3. Connect Watcher to TreeView and Search Cache
  context.subscriptions.push(
    watcherService.onDidChangeNotes(() => {
      searchService.clearCache();
      treeProvider.refresh();
    })
  );

  // 4. Register Status Bar Item
  updateStatusBarItem(context);

  // 5. Register Markdown Wiki Link and Auto-completion Providers
  const markdownSelector: vscode.DocumentSelector = { scheme: 'file', language: 'markdown' };
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(markdownSelector, new NoteLinkProvider(noteService))
  );
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      markdownSelector,
      new NoteCompletionProvider(noteService),
      '['
    )
  );

  // 6. Register Command Handlers
  registerNoteCommands(context, noteService, metadataService, treeProvider);
  registerSearchCommands(context, noteService, searchService, metadataService, treeProvider);
  registerOrganizationCommands(context, noteService, treeProvider);

  // 7. Listen for Configuration Changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        updateStatusBarItem(context);
        watcherService.setupWatchers();
        searchService.clearCache();
        treeProvider.refresh();
      }
    })
  );

  // 8. Auto-create notes directory on first load in background
  noteService.ensureDirectories().catch(() => {});
}

function updateStatusBarItem(context: vscode.ExtensionContext): void {
  const config = getConfiguration();

  if (config.showStatusBarItem) {
    if (!statusBarItem) {
      statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
      );
      statusBarItem.command = COMMANDS.NEW_NOTE;
      statusBarItem.text = '$(note) New Note';
      statusBarItem.tooltip = 'Create a new Markdown note (Sidebar Notes)';
      context.subscriptions.push(statusBarItem);
    }
    statusBarItem.show();
  } else if (statusBarItem) {
    statusBarItem.hide();
  }
}

export function deactivate(): void {
  if (statusBarItem) {
    statusBarItem.dispose();
  }
}
