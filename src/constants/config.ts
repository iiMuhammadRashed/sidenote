import * as vscode from 'vscode';

export const CONFIG_SECTION = 'sidenote';

export const CONFIG_KEYS = {
  VAULT_PATH: 'vaultPath',
  PROJECT_NOTES_LOCATION: 'projectNotesLocation',
  REPO_NOTES_PATH: 'repoNotesPath',
  DEFAULT_SCOPE: 'defaultScope',
  SORT_BY: 'sortBy',
  SHOW_TAGS: 'showTags',
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

/** Where a project's notes are kept: privately in the vault, or inside the repo. */
export type ProjectNotesLocation = 'vault' | 'repo';

export interface ExtensionConfig {
  vaultPath: string;
  projectNotesLocation: ProjectNotesLocation;
  repoNotesPath: string;
  defaultScope: NoteDefaultScope;
  sortBy: NoteSortOrder;
  showTags: boolean;
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
    vaultPath: cfg.get<string>(CONFIG_KEYS.VAULT_PATH, '~/.sidenote'),
    projectNotesLocation: cfg.get<ProjectNotesLocation>(CONFIG_KEYS.PROJECT_NOTES_LOCATION, 'vault'),
    repoNotesPath: cfg.get<string>(CONFIG_KEYS.REPO_NOTES_PATH, '.notes'),
    defaultScope: cfg.get<NoteDefaultScope>(CONFIG_KEYS.DEFAULT_SCOPE, 'workspace'),
    sortBy: cfg.get<NoteSortOrder>(CONFIG_KEYS.SORT_BY, 'modifiedDesc'),
    showTags: cfg.get<boolean>(CONFIG_KEYS.SHOW_TAGS, true),
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
