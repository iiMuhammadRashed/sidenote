import * as path from 'path';

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

export const workspace = {
  workspaceFolders: undefined,
  getConfiguration: () => ({
    get: (_k: string, d: unknown) => d,
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
