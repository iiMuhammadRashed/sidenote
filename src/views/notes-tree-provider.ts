import * as vscode from 'vscode';
import { NoteItem, NoteScope } from '../models/note';
import { NoteTreeItem, SectionId } from '../models/tree-item';
import { NoteService } from '../services/note-service';
import { MetadataService } from '../services/metadata-service';
import { TagService } from '../services/tag-service';
import { getConfiguration } from '../constants/config';
import { COMMANDS } from '../constants/commands';

export class NotesTreeProvider implements vscode.TreeDataProvider<NoteTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeTreeData: vscode.Event<void> = this.onDidChangeTreeDataEmitter.event;

  private readonly onDidChangeTagFilterEmitter = new vscode.EventEmitter<string | undefined>();
  /** Fires whenever the active tag filter changes, so context keys can follow it. */
  public readonly onDidChangeTagFilter: vscode.Event<string | undefined> =
    this.onDidChangeTagFilterEmitter.event;

  private activeTagFilter?: string;

  constructor(
    private readonly noteService: NoteService,
    private readonly metadataService: MetadataService
  ) {}

  public refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  public setTagFilter(tag?: string): void {
    const normalized = tag?.toLowerCase();
    if (normalized === this.activeTagFilter) {
      return;
    }
    this.activeTagFilter = normalized;
    this.onDidChangeTagFilterEmitter.fire(normalized);
    this.refresh();
  }

  public getActiveTagFilter(): string | undefined {
    return this.activeTagFilter;
  }

  public getTreeItem(element: NoteTreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: NoteTreeItem): Promise<NoteTreeItem[]> {
    try {
      if (!element) {
        return await this.getRootChildren();
      }
      if (element.itemType === 'section' && element.sectionId) {
        return await this.getSectionChildren(element.sectionId);
      }
      if (element.itemType === 'folder' && element.folderPath !== undefined && element.scope) {
        return await this.getFolderChildren(element.folderPath, element.scope);
      }
      return [];
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return [NoteTreeItem.createEmptyItem(`Could not read notes: ${message}`)];
    }
  }

  private async getRootChildren(): Promise<NoteTreeItem[]> {
    const notes = await this.noteService.getAllNotes();
    const config = getConfiguration();

    if (this.activeTagFilter) {
      return this.getTagFilterChildren(notes, this.activeTagFilter);
    }

    const visible = notes.filter((note) => !note.isArchived);
    const sections: NoteTreeItem[] = [];

    if (config.showFavorites) {
      const favorites = visible.filter((note) => note.isFavorite);
      if (favorites.length > 0) {
        sections.push(NoteTreeItem.createSectionItem('Favorites', 'favorites', 'star-full', favorites.length));
      }
    }

    if (config.showRecent) {
      const recentCount = this.getRecentNotes(visible, config.recentLimit).length;
      if (recentCount > 0) {
        sections.push(NoteTreeItem.createSectionItem('Recent', 'recent', 'history', recentCount));
      }
    }

    const hasWorkspace = this.noteService.getWorkspaceRoot() !== undefined;
    if (hasWorkspace) {
      const workspaceNotes = visible.filter((note) => note.scope === 'workspace');
      sections.push(
        NoteTreeItem.createSectionItem('Workspace Notes', 'workspace', 'folder-active', workspaceNotes.length)
      );
    }

    const globalNotes = visible.filter((note) => note.scope === 'global');
    sections.push(
      NoteTreeItem.createSectionItem('Global Notes', 'global', 'globe', globalNotes.length, !hasWorkspace)
    );

    if (config.showTags) {
      const tagCount = TagService.getTagCounts(visible).length;
      if (tagCount > 0) {
        sections.push(NoteTreeItem.createSectionItem('Tags', 'tags', 'tag', tagCount, false));
      }
    }

    if (config.showArchive) {
      const archived = notes.filter((note) => note.isArchived);
      if (archived.length > 0) {
        sections.push(NoteTreeItem.createSectionItem('Archive', 'archive', 'archive', archived.length, false));
      }
    }

    return sections;
  }

  private getTagFilterChildren(notes: readonly NoteItem[], tag: string): NoteTreeItem[] {
    const matches = this.noteService.sortNotes(notes.filter((note) => note.tags.includes(tag)));
    const banner = NoteTreeItem.createFilterBanner(tag);

    if (matches.length === 0) {
      return [banner, NoteTreeItem.createEmptyItem(`No notes tagged #${tag}`)];
    }

    return [banner, ...matches.map((note) => NoteTreeItem.createNoteItem(note, true))];
  }

  private async getSectionChildren(sectionId: SectionId): Promise<NoteTreeItem[]> {
    const notes = await this.noteService.getAllNotes();
    const visible = notes.filter((note) => !note.isArchived);

    switch (sectionId) {
      case 'favorites':
        return this.noteService
          .sortNotes(visible.filter((note) => note.isFavorite))
          .map((note) => NoteTreeItem.createNoteItem(note, true));

      case 'recent':
        return this.getRecentNotes(visible, getConfiguration().recentLimit).map((note) =>
          NoteTreeItem.createNoteItem(note, true)
        );

      case 'workspace':
        return this.getFolderChildren('', 'workspace');

      case 'global':
        return this.getFolderChildren('', 'global');

      case 'tags':
        return TagService.getTagCounts(visible).map(({ tag, count }) =>
          NoteTreeItem.createTagItem(tag, count)
        );

      case 'archive':
        return this.noteService
          .sortNotes(notes.filter((note) => note.isArchived))
          .map((note) => NoteTreeItem.createNoteItem(note, true));

      default:
        return [];
    }
  }

  private async getFolderChildren(folderPath: string, scope: NoteScope): Promise<NoteTreeItem[]> {
    const notes = await this.noteService.getAllNotes();
    const inScope = notes.filter((note) => note.scope === scope && !note.isArchived);

    const prefix = folderPath ? `${folderPath}/` : '';
    const subfolderPaths = new Set<string>();
    const directNotes: NoteItem[] = [];

    for (const note of inScope) {
      if (note.folder === folderPath) {
        directNotes.push(note);
      } else if (note.folder.startsWith(prefix)) {
        const nextSegment = note.folder.slice(prefix.length).split('/')[0];
        subfolderPaths.add(`${prefix}${nextSegment}`);
      }
    }

    const items = Array.from(subfolderPaths)
      .sort((a, b) => a.localeCompare(b))
      .map((path) => {
        const count = inScope.filter(
          (note) => note.folder === path || note.folder.startsWith(`${path}/`)
        ).length;
        return NoteTreeItem.createFolderItem(path.split('/').pop() ?? path, path, scope, count);
      });

    items.push(
      ...this.noteService.sortNotes(directNotes).map((note) => NoteTreeItem.createNoteItem(note, false))
    );

    if (items.length === 0 && folderPath === '') {
      return [
        NoteTreeItem.createEmptyItem('No notes yet — click to create one', {
          command: COMMANDS.NEW_NOTE,
          title: 'Create Note',
          arguments: [{ scope }],
        }),
      ];
    }

    return items;
  }

  /** Recent notes in true most-recent-first order, limited and filtered to notes that still exist. */
  private getRecentNotes(notes: readonly NoteItem[], limit: number): NoteItem[] {
    const recentIds = this.metadataService.getRecentIds();
    const byId = new Map(notes.map((note) => [note.id, note]));

    const recent: NoteItem[] = [];
    for (const id of recentIds) {
      const note = byId.get(id);
      if (note) {
        recent.push(note);
      }
      if (recent.length === limit) {
        break;
      }
    }
    return recent;
  }
}
