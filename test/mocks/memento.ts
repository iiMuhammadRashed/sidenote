import * as vscode from 'vscode';

/** An in-memory Memento, standing in for VS Code's workspace and global state stores. */
export class MockMemento implements vscode.Memento {
  private readonly storage = new Map<string, unknown>();

  public keys(): readonly string[] {
    return Array.from(this.storage.keys());
  }

  public get<T>(key: string): T | undefined;
  public get<T>(key: string, defaultValue: T): T;
  public get<T>(key: string, defaultValue?: T): T | undefined {
    return this.storage.has(key) ? (this.storage.get(key) as T) : defaultValue;
  }

  public update(key: string, value: unknown): Thenable<void> {
    this.storage.set(key, value);
    return Promise.resolve();
  }

  public setKeysForSync(): void {}
}
