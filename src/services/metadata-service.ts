import * as vscode from 'vscode';

const STORAGE_KEYS = {
  FAVORITES: 'sidebarNotes.favorites',
  RECENTS: 'sidebarNotes.recents',
  ARCHIVED: 'sidebarNotes.archived',
};

export class MetadataService {
  constructor(
    private readonly workspaceState: vscode.Memento,
    private readonly globalState: vscode.Memento
  ) {}

  private getStorage(id: string): vscode.Memento {
    // If id starts with global:, store in globalState, otherwise workspaceState
    return id.startsWith('global:') ? this.globalState : this.workspaceState;
  }

  public getFavoriteIds(): string[] {
    const wsFavs = this.workspaceState.get<string[]>(STORAGE_KEYS.FAVORITES, []);
    const globalFavs = this.globalState.get<string[]>(STORAGE_KEYS.FAVORITES, []);
    return [...new Set([...wsFavs, ...globalFavs])];
  }

  public isFavorite(id: string): boolean {
    const storage = this.getStorage(id);
    const favs = storage.get<string[]>(STORAGE_KEYS.FAVORITES, []);
    return favs.includes(id);
  }

  public async toggleFavorite(id: string): Promise<boolean> {
    const storage = this.getStorage(id);
    const favs = storage.get<string[]>(STORAGE_KEYS.FAVORITES, []);
    let isFav: boolean;
    let updated: string[];

    if (favs.includes(id)) {
      updated = favs.filter((f) => f !== id);
      isFav = false;
    } else {
      updated = [...favs, id];
      isFav = true;
    }

    await storage.update(STORAGE_KEYS.FAVORITES, updated);
    return isFav;
  }

  public getArchivedIds(): string[] {
    const wsArchived = this.workspaceState.get<string[]>(STORAGE_KEYS.ARCHIVED, []);
    const globalArchived = this.globalState.get<string[]>(STORAGE_KEYS.ARCHIVED, []);
    return [...new Set([...wsArchived, ...globalArchived])];
  }

  public isArchived(id: string): boolean {
    const storage = this.getStorage(id);
    const archived = storage.get<string[]>(STORAGE_KEYS.ARCHIVED, []);
    return archived.includes(id);
  }

  public async toggleArchived(id: string): Promise<boolean> {
    const storage = this.getStorage(id);
    const archived = storage.get<string[]>(STORAGE_KEYS.ARCHIVED, []);
    let isArch: boolean;
    let updated: string[];

    if (archived.includes(id)) {
      updated = archived.filter((a) => a !== id);
      isArch = false;
    } else {
      updated = [...archived, id];
      isArch = true;
    }

    await storage.update(STORAGE_KEYS.ARCHIVED, updated);
    return isArch;
  }

  public getRecentIds(): string[] {
    const wsRecents = this.workspaceState.get<string[]>(STORAGE_KEYS.RECENTS, []);
    const globalRecents = this.globalState.get<string[]>(STORAGE_KEYS.RECENTS, []);
    return [...new Set([...wsRecents, ...globalRecents])];
  }

  public async recordRecent(id: string, limit = 10): Promise<void> {
    const storage = this.getStorage(id);
    const recents = storage.get<string[]>(STORAGE_KEYS.RECENTS, []);
    const filtered = recents.filter((r) => r !== id);
    const updated = [id, ...filtered].slice(0, limit);
    await storage.update(STORAGE_KEYS.RECENTS, updated);
  }

  public async removeNote(id: string): Promise<void> {
    const storage = this.getStorage(id);
    const favs = storage.get<string[]>(STORAGE_KEYS.FAVORITES, []).filter((f) => f !== id);
    const recents = storage.get<string[]>(STORAGE_KEYS.RECENTS, []).filter((r) => r !== id);
    const archived = storage.get<string[]>(STORAGE_KEYS.ARCHIVED, []).filter((a) => a !== id);

    await Promise.all([
      storage.update(STORAGE_KEYS.FAVORITES, favs),
      storage.update(STORAGE_KEYS.RECENTS, recents),
      storage.update(STORAGE_KEYS.ARCHIVED, archived),
    ]);
  }

  public async updateNoteId(oldId: string, newId: string): Promise<void> {
    const oldStorage = this.getStorage(oldId);
    const newStorage = this.getStorage(newId);

    const oldFavs = oldStorage.get<string[]>(STORAGE_KEYS.FAVORITES, []);
    const oldRecents = oldStorage.get<string[]>(STORAGE_KEYS.RECENTS, []);
    const oldArchived = oldStorage.get<string[]>(STORAGE_KEYS.ARCHIVED, []);

    if (oldFavs.includes(oldId)) {
      await oldStorage.update(
        STORAGE_KEYS.FAVORITES,
        oldFavs.filter((f) => f !== oldId)
      );
      const newFavs = newStorage.get<string[]>(STORAGE_KEYS.FAVORITES, []);
      await newStorage.update(STORAGE_KEYS.FAVORITES, [...newFavs, newId]);
    }

    if (oldRecents.includes(oldId)) {
      await oldStorage.update(
        STORAGE_KEYS.RECENTS,
        oldRecents.filter((r) => r !== oldId)
      );
      const newRecents = newStorage.get<string[]>(STORAGE_KEYS.RECENTS, []);
      await newStorage.update(STORAGE_KEYS.RECENTS, [newId, ...newRecents.filter((r) => r !== newId)]);
    }

    if (oldArchived.includes(oldId)) {
      await oldStorage.update(
        STORAGE_KEYS.ARCHIVED,
        oldArchived.filter((a) => a !== oldId)
      );
      const newArchived = newStorage.get<string[]>(STORAGE_KEYS.ARCHIVED, []);
      await newStorage.update(STORAGE_KEYS.ARCHIVED, [...newArchived, newId]);
    }
  }
}
