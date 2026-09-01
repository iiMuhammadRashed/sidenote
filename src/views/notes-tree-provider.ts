import * as vscode from 'vscode';
import { NoteItem, NoteScope } from '../models/note';
import { NoteTreeItem } from '../models/tree-item';
import { NoteService } from '../services/note-service';
import { MetadataService } from '../services/metadata-service';
import { TagService } from '../services/tag-service';
import { getConfiguration } from '../constants/config';
import { COMMANDS } from '../constants/commands';

export class NotesTreeProvider implements vscode.TreeDataProvider<NoteTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<NoteTreeItem | undefined | null | void>();
  public readonly onDidChangeTreeData: vscode.Event<NoteTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private activeTagFilter?: string;
  private cachedNotes: NoteItem[] = [];

  constructor(
    private readonly noteService: NoteService,
    private readonly metadataService: MetadataService
  ) {}

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public setTagFilter(tag?: string): void {
    this.activeTagFilter = tag;
    this.refresh();
  }

  public getActiveTagFilter(): string | undefined {
    return this.activeTagFilter;
  }

  public getTreeItem(element: NoteTreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: NoteTreeItem): Promise<NoteTreeItem[]> {
    if (!element) {
      return this.getRootChildren();
    }

    switch (element.itemType) {
      case 'section':
        return this.getSectionChildren(element.sectionId!);
      case 'folder':
        return this.getFolderChildren(element.folderPath!, element.scope!);
      default:
        return [];
    }
  }

  private async getRootChildren(): Promise<NoteTreeItem[]> {
    this.cachedNotes = await this.noteService.getAllNotes();
    const config = getConfiguration();

    // 1. If tag filter is active, show only filtered notes
    if (this.activeTagFilter) {
      const banner = NoteTreeItem.createFilterBanner(this.activeTagFilter);
      const filtered = this.cachedNotes.filter((n) =>
        n.tags.includes(this.activeTagFilter!.toLowerCase())
      );
      const sorted = this.noteService.sortNotes(filtered);
      const noteItems = sorted.map((n) => NoteTreeItem.createNoteItem(n, true));
      return [banner, ...(noteItems.length > 0 ? noteItems : [NoteTreeItem.createEmptyItem('No notes found with this tag')])];
    }

    const nonArchivedNotes = this.cachedNotes.filter((n) => !n.isArchived);
    const result: NoteTreeItem[] = [];

    // 2. Favorites Section
    if (config.showFavorites) {
      const favNotes = nonArchivedNotes.filter((n) => n.isPinned);
      if (favNotes.length > 0) {
        result.push(
          NoteTreeItem.createSectionItem(
            'Favorites',
            'favorites',
            'star-full',
            favNotes.length,
            true
          )
        );
      }
    }

    // 3. Recent Notes Section
    if (config.showRecent) {
      const recentIds = this.metadataService.getRecentIds();
      const recentNotes = nonArchivedNotes
        .filter((n) => recentIds.includes(n.id))
        .sort((a, b) => recentIds.indexOf(a.id) - recentIds.indexOf(b.id))
        .slice(0, config.recentLimit);

      if (recentNotes.length > 0) {
        result.push(
          NoteTreeItem.createSectionItem(
            'Recent Notes',
            'recent',
            'history',
            recentNotes.length,
            true
          )
        );
      }
    }

    // 4. Workspace Notes Section (if workspace folder is open)
    const wsRoot = this.noteService.getWorkspaceRoot();
    if (wsRoot) {
      const wsNotes = nonArchivedNotes.filter((n) => n.scope === 'workspace');
      result.push(
        NoteTreeItem.createSectionItem(
          'Workspace Notes',
          'workspace',
          'folder-active',
          wsNotes.length,
          true
        )
      );
    }

    // 5. Global Notes Section
    const globalNotes = nonArchivedNotes.filter((n) => n.scope === 'global');
    result.push(
      NoteTreeItem.createSectionItem(
        'Global Notes',
        'global',
        'globe',
        globalNotes.length,
        wsRoot ? false : true // Expand global by default if no workspace
      )
    );

    // 6. Tags Section
    if (config.showTags) {
      const tagCounts = TagService.getTagCounts(nonArchivedNotes);
      if (tagCounts.length > 0) {
        result.push(
          NoteTreeItem.createSectionItem(
            'Tags',
            'tags',
            'tag',
            tagCounts.length,
            false
          )
        );
      }
    }

    // 7. Archive Section
    if (config.showArchive) {
      const archivedNotes = this.cachedNotes.filter((n) => n.isArchived);
      if (archivedNotes.length > 0) {
        result.push(
          NoteTreeItem.createSectionItem(
            'Archive',
            'archive',
            'archive',
            archivedNotes.length,
            false
          )
        );
      }
    }

    if (result.length === 0) {
      return [
        NoteTreeItem.createEmptyItem('No notes yet. Click to create one!', {
          command: COMMANDS.NEW_NOTE,
          title: 'Create Note',
        }),
      ];
    }

    return result;
  }

  private async getSectionChildren(sectionId: string): Promise<NoteTreeItem[]> {
    const nonArchivedNotes = this.cachedNotes.filter((n) => !n.isArchived);

    switch (sectionId) {
      case 'favorites': {
        const favs = nonArchivedNotes.filter((n) => n.isPinned);
        const sorted = this.noteService.sortNotes(favs);
        return sorted.map((n) => NoteTreeItem.createNoteItem(n, true));
      }

      case 'recent': {
        const recentIds = this.metadataService.getRecentIds();
        const recentNotes = nonArchivedNotes
          .filter((n) => recentIds.includes(n.id))
          .sort((a, b) => recentIds.indexOf(a.id) - recentIds.indexOf(b.id))
          .slice(0, getConfiguration().recentLimit);
        return recentNotes.map((n) => NoteTreeItem.createNoteItem(n, true));
      }

      case 'workspace': {
        return this.getFolderChildren('', 'workspace');
      }

      case 'global': {
        return this.getFolderChildren('', 'global');
      }

      case 'tags': {
        const tagCounts = TagService.getTagCounts(nonArchivedNotes);
        return tagCounts.map(({ tag, count }) => NoteTreeItem.createTagItem(tag, count));
      }

      case 'archive': {
        const archived = this.cachedNotes.filter((n) => n.isArchived);
        const sorted = this.noteService.sortNotes(archived);
        return sorted.map((n) => NoteTreeItem.createNoteItem(n, true));
      }

      default:
        return [];
    }
  }

  private async getFolderChildren(folderPath: string, scope: NoteScope): Promise<NoteTreeItem[]> {
    const scopeNotes = this.cachedNotes.filter(
      (n) => n.scope === scope && !n.isArchived
    );

    // Find direct subfolders
    const subfolderNames = new Set<string>();
    const directNotes: NoteItem[] = [];

    const prefix = folderPath ? `${folderPath}/` : '';

    for (const note of scopeNotes) {
      if (folderPath === '') {
        if (!note.folder) {
          directNotes.push(note);
        } else {
          const topFolder = note.folder.split('/')[0];
          subfolderNames.add(topFolder);
        }
      } else {
        if (note.folder === folderPath) {
          directNotes.push(note);
        } else if (note.folder.startsWith(prefix)) {
          const remainder = note.folder.slice(prefix.length);
          const nextSegment = remainder.split('/')[0];
          subfolderNames.add(`${prefix}${nextSegment}`);
        }
      }
    }

    const items: NoteTreeItem[] = [];

    // Sort and add subfolder items
    const sortedSubfolders = Array.from(subfolderNames).sort((a, b) => a.localeCompare(b));
    for (const fPath of sortedSubfolders) {
      const folderName = fPath.split('/').pop() || fPath;
      const count = scopeNotes.filter((n) => n.folder === fPath || n.folder.startsWith(`${fPath}/`)).length;
      items.push(NoteTreeItem.createFolderItem(folderName, fPath, scope, count));
    }

    // Sort and add direct notes
    const sortedNotes = this.noteService.sortNotes(directNotes);
    for (const note of sortedNotes) {
      items.push(NoteTreeItem.createNoteItem(note, false));
    }

    if (items.length === 0 && folderPath === '') {
      return [
        NoteTreeItem.createEmptyItem('Empty (Click to create a note)', {
          command: COMMANDS.NEW_NOTE,
          title: 'Create Note',
          arguments: [{ scope }],
        }),
      ];
    }

    return items;
  }
}
