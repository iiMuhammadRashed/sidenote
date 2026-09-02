export const COMMANDS = {
  NEW_NOTE: 'sidenote.newNote',
  NEW_FOLDER: 'sidenote.newFolder',
  OPEN_NOTE: 'sidenote.open',
  OPEN_TO_SIDE: 'sidenote.openToSide',
  RENAME: 'sidenote.rename',
  DELETE: 'sidenote.delete',
  SEARCH: 'sidenote.search',
  FILTER_BY_TAG: 'sidenote.filterByTag',
  CLEAR_TAG_FILTER: 'sidenote.clearTagFilter',
  COPY_WIKI_LINK: 'sidenote.copyWikiLink',
  OPEN_DAILY_NOTE: 'sidenote.openDailyNote',
  REFRESH: 'sidenote.refresh',
  SHOW_PREVIEW: 'sidenote.showPreview',
  OPEN_SETTINGS: 'sidenote.openSettings',
} as const;

export type CommandId = (typeof COMMANDS)[keyof typeof COMMANDS];
