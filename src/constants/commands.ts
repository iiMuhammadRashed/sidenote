export const COMMANDS = {
  NEW_NOTE: 'sidebarNotes.newNote',
  NEW_FOLDER: 'sidebarNotes.newFolder',
  OPEN_NOTE: 'sidebarNotes.openNote',
  OPEN_TO_SIDE: 'sidebarNotes.openToSide',
  RENAME_NOTE: 'sidebarNotes.renameNote',
  DELETE_NOTE: 'sidebarNotes.deleteNote',
  DUPLICATE_NOTE: 'sidebarNotes.duplicateNote',
  TOGGLE_FAVORITE: 'sidebarNotes.toggleFavorite',
  TOGGLE_ARCHIVE: 'sidebarNotes.toggleArchive',
  SEARCH_NOTES: 'sidebarNotes.searchNotes',
  FILTER_BY_TAG: 'sidebarNotes.filterByTag',
  CLEAR_TAG_FILTER: 'sidebarNotes.clearTagFilter',
  MOVE_NOTE: 'sidebarNotes.moveNote',
  COPY_NOTE_LINK: 'sidebarNotes.copyNoteLink',
  COPY_NOTE_PATH: 'sidebarNotes.copyNotePath',
  REVEAL_IN_OS: 'sidebarNotes.revealInOS',
  OPEN_SCRATCHPAD: 'sidebarNotes.openScratchpad',
  REFRESH: 'sidebarNotes.refresh',
  TOGGLE_PREVIEW: 'sidebarNotes.togglePreview',
  OPEN_SETTINGS: 'sidebarNotes.openSettings',
} as const;

export type CommandId = (typeof COMMANDS)[keyof typeof COMMANDS];
