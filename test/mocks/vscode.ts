/**
 * A minimal stand-in for the `vscode` module so services can be unit tested outside
 * the extension host. `workspace.fs` is backed by the real filesystem, which lets
 * NoteService be exercised against a temporary directory.
 */
import * as path from 'path';
import * as fs from 'fs';

export class Uri {
  public readonly scheme: string;
  public readonly fsPath: string;
  public readonly path: string;

  constructor(scheme: string, fsPath: string) {
    this.scheme = scheme;
    this.fsPath = fsPath;
    this.path = fsPath;
  }

  static file(fsPath: string): Uri {
    return new Uri('file', path.resolve(fsPath));
  }

  static joinPath(base: Uri, ...pathSegments: string[]): Uri {
    return new Uri(base.scheme, path.join(base.fsPath, ...pathSegments));
  }

  static parse(uriString: string): Uri {
    return new Uri('file', uriString);
  }

  toString(): string {
    return `${this.scheme}://${this.fsPath}`;
  }
}

export class ThemeIcon {
  constructor(public readonly id: string, public readonly color?: unknown) {}
}

export class ThemeColor {
  constructor(public readonly id: string) {}
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class TreeItem {
  public label?: string;
  public collapsibleState?: TreeItemCollapsibleState;
  public description?: string;
  public tooltip?: string | unknown;
  public iconPath?: unknown;
  public contextValue?: string;
  public command?: unknown;

  constructor(label: string, collapsibleState?: TreeItemCollapsibleState) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export class MarkdownString {
  private text = '';
  appendMarkdown(val: string) {
    this.text += val;
    return this;
  }
  toString() {
    return this.text;
  }
}

export class EventEmitter<T> {
  private listeners: ((e: T) => unknown)[] = [];
  public event = (listener: (e: T) => unknown) => {
    this.listeners.push(listener);
    return { dispose: () => {} };
  };
  public fire(data: T): void {
    for (const l of this.listeners) {
      l(data);
    }
  }
  public dispose(): void {
    this.listeners = [];
  }
}

export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64,
}

/** Mutable settings the tests can override; `getConfiguration().get` falls back to the default. */
export const testConfiguration = new Map<string, unknown>();

/** Workspace folders the tests can override. */
export const testState: { workspaceFolders: { uri: Uri }[] | undefined } = {
  workspaceFolders: undefined,
};

const fileSystem = {
  async readDirectory(uri: Uri): Promise<[string, FileType][]> {
    const entries = await fs.promises.readdir(uri.fsPath, { withFileTypes: true });
    return entries.map((entry) => [
      entry.name,
      entry.isDirectory() ? FileType.Directory : FileType.File,
    ]);
  },

  async stat(uri: Uri): Promise<{ ctime: number; mtime: number; size: number; type: FileType }> {
    const stats = await fs.promises.stat(uri.fsPath);
    return {
      ctime: stats.birthtimeMs,
      mtime: stats.mtimeMs,
      size: stats.size,
      type: stats.isDirectory() ? FileType.Directory : FileType.File,
    };
  },

  async readFile(uri: Uri): Promise<Uint8Array> {
    return fs.promises.readFile(uri.fsPath);
  },

  async writeFile(uri: Uri, content: Uint8Array): Promise<void> {
    await fs.promises.mkdir(path.dirname(uri.fsPath), { recursive: true });
    await fs.promises.writeFile(uri.fsPath, content);
  },

  async createDirectory(uri: Uri): Promise<void> {
    await fs.promises.mkdir(uri.fsPath, { recursive: true });
  },

  async rename(source: Uri, target: Uri, options?: { overwrite?: boolean }): Promise<void> {
    if (!options?.overwrite && fs.existsSync(target.fsPath)) {
      throw new Error(`File already exists: ${target.fsPath}`);
    }
    await fs.promises.mkdir(path.dirname(target.fsPath), { recursive: true });
    await fs.promises.rename(source.fsPath, target.fsPath);
  },

  async delete(uri: Uri, options?: { recursive?: boolean; useTrash?: boolean }): Promise<void> {
    // The mock has no trash, matching a remote or minimal Linux environment.
    if (options?.useTrash) {
      throw new Error('Trash is not supported');
    }
    await fs.promises.rm(uri.fsPath, { recursive: options?.recursive ?? false, force: false });
  },
};

export const workspace = {
  get workspaceFolders() {
    return testState.workspaceFolders;
  },
  fs: fileSystem,
  getConfiguration: () => ({
    get: (key: string, defaultValue: unknown) =>
      testConfiguration.has(key) ? testConfiguration.get(key) : defaultValue,
  }),
};

export const window = {
  showInformationMessage: () => Promise.resolve(),
  showWarningMessage: () => Promise.resolve(),
  showErrorMessage: () => Promise.resolve(),
  setStatusBarMessage: () => ({ dispose: () => {} }),
};

export const commands = {
  registerCommand: () => ({ dispose: () => {} }),
  executeCommand: () => Promise.resolve(),
};

export class Position {
  constructor(public readonly line: number, public readonly character: number) {}
}

export class Range {
  constructor(public readonly start: Position, public readonly end: Position) {}
}

export class DocumentLink {
  public tooltip?: string;
  constructor(public readonly range: Range, public readonly target?: Uri) {}
}

export enum CompletionItemKind {
  Reference = 17,
}

export class CompletionItem {
  public insertText?: string;
  public detail?: string;
  public documentation?: unknown;
  constructor(public readonly label: string, public readonly kind?: CompletionItemKind) {}
}

export class DataTransferItem {
  constructor(public readonly value: unknown) {}
}

export class DataTransfer {
  private readonly items = new Map<string, DataTransferItem>();
  set(mimeType: string, item: DataTransferItem): void {
    this.items.set(mimeType, item);
  }
  get(mimeType: string): DataTransferItem | undefined {
    return this.items.get(mimeType);
  }
}

/** A stand-in TextDocument backed by an in-memory string. */
export class TextDocument {
  private readonly lines: string[];

  constructor(
    public readonly uri: Uri,
    private readonly content: string,
    public readonly languageId = 'markdown'
  ) {
    this.lines = content.split('\n');
  }

  getText(): string {
    return this.content;
  }

  lineAt(position: Position | number): { text: string } {
    const line = typeof position === 'number' ? position : position.line;
    return { text: this.lines[line] ?? '' };
  }

  positionAt(offset: number): Position {
    const before = this.content.slice(0, offset).split('\n');
    return new Position(before.length - 1, before[before.length - 1].length);
  }
}
