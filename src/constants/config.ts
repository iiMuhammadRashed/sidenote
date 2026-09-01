import * as vscode from 'vscode';

export const CONFIG_SECTION = 'sidenote';

export const CONFIG_KEYS = {
  NOTES_PATH: 'notesPath',
  GLOBAL_NOTES_PATH: 'globalNotesPath',
  DEFAULT_SCOPE: 'defaultScope',
  SORT_BY: 'sortBy',
  SHOW_RECENT: 'showRecent',
  RECENT_LIMIT: 'recentLimit',
  SHOW_FAVORITES: 'showFavorites',
  SHOW_TAGS: 'showTags',
  SHOW_ARCHIVE: 'showArchive',
  SHOW_STATUS_BAR_ITEM: 'showStatusBarItem',
  CONFIRM_DELETE: 'confirmDelete',
  DEFAULT_NOTE_TEMPLATE: 'defaultNoteTemplate',
  DAILY_NOTE_TEMPLATE: 'dailyNoteTemplate',
  DAILY_NOTE_FOLDER: 'dailyNoteFolder',
  DATE_FORMAT: 'dateFormat',
} as const;

export type NoteSortOrder =
  | 'modifiedDesc'
  | 'modifiedAsc'
  | 'titleAsc'
  | 'titleDesc'
  | 'createdDesc';

export type NoteDefaultScope = 'workspace' | 'global';

export interface ExtensionConfig {
  notesPath: string;
  globalNotesPath: string;
  defaultScope: NoteDefaultScope;
  sortBy: NoteSortOrder;
  showRecent: boolean;
  recentLimit: number;
  showFavorites: boolean;
  showTags: boolean;
  showArchive: boolean;
  showStatusBarItem: boolean;
  confirmDelete: boolean;
  defaultNoteTemplate: string;
  dailyNoteTemplate: string;
  dailyNoteFolder: string;
  dateFormat: string;
}

export function getConfiguration(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    notesPath: cfg.get<string>(CONFIG_KEYS.NOTES_PATH, '.notes'),
    globalNotesPath: cfg.get<string>(CONFIG_KEYS.GLOBAL_NOTES_PATH, '~/.sidenote'),
    defaultScope: cfg.get<NoteDefaultScope>(CONFIG_KEYS.DEFAULT_SCOPE, 'workspace'),
    sortBy: cfg.get<NoteSortOrder>(CONFIG_KEYS.SORT_BY, 'modifiedDesc'),
    showRecent: cfg.get<boolean>(CONFIG_KEYS.SHOW_RECENT, true),
    recentLimit: cfg.get<number>(CONFIG_KEYS.RECENT_LIMIT, 7),
    showFavorites: cfg.get<boolean>(CONFIG_KEYS.SHOW_FAVORITES, true),
    showTags: cfg.get<boolean>(CONFIG_KEYS.SHOW_TAGS, true),
    showArchive: cfg.get<boolean>(CONFIG_KEYS.SHOW_ARCHIVE, false),
    showStatusBarItem: cfg.get<boolean>(CONFIG_KEYS.SHOW_STATUS_BAR_ITEM, true),
    confirmDelete: cfg.get<boolean>(CONFIG_KEYS.CONFIRM_DELETE, true),
    defaultNoteTemplate: cfg.get<string>(
      CONFIG_KEYS.DEFAULT_NOTE_TEMPLATE,
      '# ${title}\n\n'
    ),
    dailyNoteTemplate: cfg.get<string>(
      CONFIG_KEYS.DAILY_NOTE_TEMPLATE,
      '# ${date}\n\n- [ ] \n'
    ),
    dailyNoteFolder: cfg.get<string>(CONFIG_KEYS.DAILY_NOTE_FOLDER, 'Daily'),
    dateFormat: cfg.get<string>(CONFIG_KEYS.DATE_FORMAT, 'YYYY-MM-DD'),
  };
}
