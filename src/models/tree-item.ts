import * as vscode from 'vscode';
import { NoteItem, NoteScope } from './note';
import { getRelativeTimeString } from '../utils/date-utils';

export type TreeItemType =
  | 'section'
  | 'folder'
  | 'note'
  | 'tag'
  | 'tagHeader'
  | 'filterBanner'
  | 'empty';

export class NoteTreeItem extends vscode.TreeItem {
  public readonly itemType: TreeItemType;
  public readonly note?: NoteItem;
  public readonly folderPath?: string;
  public readonly scope?: NoteScope;
  public readonly tag?: string;
  public readonly sectionId?: string;

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    options: {
      itemType: TreeItemType;
      note?: NoteItem;
      folderPath?: string;
      scope?: NoteScope;
      tag?: string;
      sectionId?: string;
      description?: string;
      tooltip?: string | vscode.MarkdownString;
      iconPath?: vscode.ThemeIcon | vscode.Uri | { light: vscode.Uri; dark: vscode.Uri };
      contextValue?: string;
      command?: vscode.Command;
    }
  ) {
    super(label, collapsibleState);
    this.itemType = options.itemType;
    this.note = options.note;
    this.folderPath = options.folderPath;
    this.scope = options.scope;
    this.tag = options.tag;
    this.sectionId = options.sectionId;

    if (options.description !== undefined) {
      this.description = options.description;
    }
    if (options.tooltip !== undefined) {
      this.tooltip = options.tooltip;
    }
    if (options.iconPath !== undefined) {
      this.iconPath = options.iconPath;
    }
    if (options.contextValue !== undefined) {
      this.contextValue = options.contextValue;
    }
    if (options.command !== undefined) {
      this.command = options.command;
    }
  }

  static createNoteItem(note: NoteItem, showScopeBadge = false): NoteTreeItem {
    const icon = note.isPinned
      ? new vscode.ThemeIcon('pinned', new vscode.ThemeColor('charts.yellow'))
      : note.isArchived
      ? new vscode.ThemeIcon('archive')
      : new vscode.ThemeIcon('markdown');

    const descParts: string[] = [];
    if (showScopeBadge) {
      descParts.push(note.scope === 'workspace' ? '[WS]' : '[Global]');
    }
    descParts.push(getRelativeTimeString(note.mtime));

    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`### 📝 ${note.title}\n\n`);
    tooltip.appendMarkdown(`- **File:** \`${note.relativePath}\`\n`);
    tooltip.appendMarkdown(`- **Scope:** ${note.scope === 'workspace' ? 'Workspace' : 'Global'}\n`);
    tooltip.appendMarkdown(`- **Modified:** ${new Date(note.mtime).toLocaleString()}\n`);
    if (note.tags.length > 0) {
      tooltip.appendMarkdown(`- **Tags:** ${note.tags.map((t) => '`#' + t + '`').join(' ')}\n`);
    }
    if (note.isPinned) {
      tooltip.appendMarkdown(`- ⭐ **Pinned / Favorite**\n`);
    }
    if (note.isArchived) {
      tooltip.appendMarkdown(`- 📦 **Archived**\n`);
    }

    return new NoteTreeItem(note.title, vscode.TreeItemCollapsibleState.None, {
      itemType: 'note',
      note,
      scope: note.scope,
      description: descParts.join(' • '),
      tooltip,
      iconPath: icon,
      contextValue: 'note',
      command: {
        command: 'sidebarNotes.openNote',
        title: 'Open Note',
        arguments: [note],
      },
    });
  }

  static createFolderItem(
    folderName: string,
    folderPath: string,
    scope: NoteScope,
    noteCount: number
  ): NoteTreeItem {
    return new NoteTreeItem(folderName, vscode.TreeItemCollapsibleState.Collapsed, {
      itemType: 'folder',
      folderPath,
      scope,
      description: noteCount > 0 ? `${noteCount}` : '',
      tooltip: `${folderPath} (${noteCount} notes)`,
      iconPath: new vscode.ThemeIcon('folder'),
      contextValue: 'folder',
    });
  }

  static createSectionItem(
    title: string,
    sectionId: string,
    icon: string,
    count?: number,
    defaultExpanded = true
  ): NoteTreeItem {
    return new NoteTreeItem(
      title,
      defaultExpanded
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed,
      {
        itemType: 'section',
        sectionId,
        description: count !== undefined && count > 0 ? `${count}` : '',
        iconPath: new vscode.ThemeIcon(icon),
        contextValue: `section_${sectionId}`,
      }
    );
  }

  static createTagItem(tag: string, count: number): NoteTreeItem {
    return new NoteTreeItem(`#${tag}`, vscode.TreeItemCollapsibleState.None, {
      itemType: 'tag',
      tag,
      description: `${count}`,
      tooltip: `Filter notes by #${tag}`,
      iconPath: new vscode.ThemeIcon('tag'),
      contextValue: 'tag',
      command: {
        command: 'sidebarNotes.filterByTag',
        title: 'Filter by Tag',
        arguments: [tag],
      },
    });
  }

  static createFilterBanner(tag: string): NoteTreeItem {
    return new NoteTreeItem(
      `Filtered by #${tag} (Click to clear)`,
      vscode.TreeItemCollapsibleState.None,
      {
        itemType: 'filterBanner',
        tooltip: 'Click to clear tag filter and show all notes',
        iconPath: new vscode.ThemeIcon('clear-all', new vscode.ThemeColor('errorForeground')),
        contextValue: 'filterBanner',
        command: {
          command: 'sidebarNotes.clearTagFilter',
          title: 'Clear Tag Filter',
        },
      }
    );
  }

  static createEmptyItem(message: string, command?: vscode.Command): NoteTreeItem {
    return new NoteTreeItem(message, vscode.TreeItemCollapsibleState.None, {
      itemType: 'empty',
      iconPath: new vscode.ThemeIcon('info'),
      contextValue: 'empty',
      command,
    });
  }
}
