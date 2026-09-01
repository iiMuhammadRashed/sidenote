export const COMMANDS = {
  NEW_NOTE: 'sidenote.newNote',
  NEW_FOLDER: 'sidenote.newFolder',
  OPEN_NOTE: 'sidenote.open',
  OPEN_TO_SIDE: 'sidenote.openToSide',
  RENAME: 'sidenote.rename',
  DELETE: 'sidenote.delete',
  DUPLICATE: 'sidenote.duplicate',
  TOGGLE_FAVORITE: 'sidenote.toggleFavorite',
  TOGGLE_ARCHIVE: 'sidenote.toggleArchive',
  SEARCH: 'sidenote.search',
  FILTER_BY_TAG: 'sidenote.filterByTag',
  CLEAR_TAG_FILTER: 'sidenote.clearTagFilter',
  MOVE: 'sidenote.move',
  COPY_WIKI_LINK: 'sidenote.copyWikiLink',
  COPY_PATH: 'sidenote.copyPath',
  REVEAL_IN_FILE_EXPLORER: 'sidenote.revealInFileExplorer',
  OPEN_DAILY_NOTE: 'sidenote.openDailyNote',
  REFRESH: 'sidenote.refresh',
  SHOW_PREVIEW: 'sidenote.showPreview',
  OPEN_SETTINGS: 'sidenote.openSettings',
} as const;

export type CommandId = (typeof COMMANDS)[keyof typeof COMMANDS];
