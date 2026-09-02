import * as vscode from 'vscode';
import { NoteItem, NoteScope } from '../models/note';
import { NoteTreeItem, SectionId } from '../models/tree-item';
import { NoteService } from '../services/note-service';
import { TagService } from '../services/tag-service';
import { getConfiguration } from '../constants/config';

/** Set while the vault holds no notes, so the view can show a welcome instead of empty folders. */
const EMPTY_CONTEXT_KEY = 'sidenote.isEmpty';

export class NotesTreeProvider implements vscode.TreeDataProvider<NoteTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeTreeData: vscode.Event<void> = this.onDidChangeTreeDataEmitter.event;

  private readonly onDidChangeTagFilterEmitter = new vscode.EventEmitter<string | undefined>();
  /** Fires whenever the active tag filter changes, so context keys can follow it. */
  public readonly onDidChangeTagFilter: vscode.Event<string | undefined> =
    this.onDidChangeTagFilterEmitter.event;

  private activeTagFilter?: string;
  private isEmpty?: boolean;

  constructor(private readonly noteService: NoteService) {}

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
    this.setEmptyContext(notes.length === 0);

    if (this.activeTagFilter) {
      return this.getTagFilterChildren(notes, this.activeTagFilter);
    }

    // With no notes at all the view shows its welcome content instead, so returning
    // two empty folders here would just be two dead ends above it.
    if (notes.length === 0) {
      return [];
    }

    const sections: NoteTreeItem[] = [];
    const hasProject = this.noteService.getWorkspaceRoot() !== undefined;

    if (hasProject) {
      const projectNotes = notes.filter((note) => note.scope === 'workspace');
      sections.push(
        NoteTreeItem.createSectionItem('This Project', 'workspace', 'folder-active', projectNotes.length)
      );
    }

    const globalNotes = notes.filter((note) => note.scope === 'global');
    sections.push(
      NoteTreeItem.createSectionItem('Global', 'global', 'globe', globalNotes.length, !hasProject)
    );

    if (getConfiguration().showTags) {
      const tagCount = TagService.getTagCounts(notes).length;
      if (tagCount > 0) {
        sections.push(NoteTreeItem.createSectionItem('Tags', 'tags', 'tag', tagCount, false));
      }
    }

    return sections;
  }

  /** Keeps the welcome view in sync without an extra scan of its own. */
  private setEmptyContext(isEmpty: boolean): void {
    if (this.isEmpty === isEmpty) {
      return;
    }
    this.isEmpty = isEmpty;
    void vscode.commands.executeCommand('setContext', EMPTY_CONTEXT_KEY, isEmpty);
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
    switch (sectionId) {
      case 'workspace':
        return this.getFolderChildren('', 'workspace');

      case 'global':
        return this.getFolderChildren('', 'global');

      case 'tags': {
        const notes = await this.noteService.getAllNotes();
        return TagService.getTagCounts(notes).map(({ tag, count }) =>
          NoteTreeItem.createTagItem(tag, count)
        );
      }

      default:
        return [];
    }
  }

  private async getFolderChildren(folderPath: string, scope: NoteScope): Promise<NoteTreeItem[]> {
    const notes = await this.noteService.getAllNotes();
    const inScope = notes.filter((note) => note.scope === scope);

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

    return items;
  }
}
