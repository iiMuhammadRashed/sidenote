import * as vscode from 'vscode';

const STORAGE_KEYS = {
  FAVORITES: 'sidenote.favorites',
  RECENTS: 'sidenote.recents',
  ARCHIVED: 'sidenote.archived',
} as const;

/** A note id paired with the time it was last opened, so recents merge correctly across scopes. */
interface RecentEntry {
  id: string;
  openedAt: number;
}

/** Recents were stored as a plain id array before 1.0; read both shapes. */
type StoredRecents = readonly (RecentEntry | string)[];

function toRecentEntries(stored: StoredRecents): RecentEntry[] {
  return stored.map((entry, index) =>
    typeof entry === 'string'
      ? // Legacy entries have no timestamp; preserve their relative order behind anything timestamped.
        { id: entry, openedAt: -index }
      : entry
  );
}

/**
 * Stores per-note user state (favorites, archive, recents) in VS Code's Memento storage.
 *
 * Workspace-scoped notes live in `workspaceState` so they stay with the project;
 * global notes live in `globalState` so they follow the user across workspaces.
 */
export class MetadataService {
  constructor(
    private readonly workspaceState: vscode.Memento,
    private readonly globalState: vscode.Memento
  ) {}

  private getStorage(id: string): vscode.Memento {
    return id.startsWith('global:') ? this.globalState : this.workspaceState;
  }

  private readIds(storage: vscode.Memento, key: string): string[] {
    return storage.get<string[]>(key, []);
  }

  private readRecents(storage: vscode.Memento): RecentEntry[] {
    return toRecentEntries(storage.get<StoredRecents>(STORAGE_KEYS.RECENTS, []));
  }

  // --- Favorites -----------------------------------------------------------

  public isFavorite(id: string): boolean {
    return this.readIds(this.getStorage(id), STORAGE_KEYS.FAVORITES).includes(id);
  }

  public async toggleFavorite(id: string): Promise<boolean> {
    const storage = this.getStorage(id);
    const favorites = this.readIds(storage, STORAGE_KEYS.FAVORITES);
    const isNowFavorite = !favorites.includes(id);

    await storage.update(
      STORAGE_KEYS.FAVORITES,
      isNowFavorite ? [...favorites, id] : favorites.filter((f) => f !== id)
    );

    return isNowFavorite;
  }

  // --- Archive -------------------------------------------------------------

  public isArchived(id: string): boolean {
    return this.readIds(this.getStorage(id), STORAGE_KEYS.ARCHIVED).includes(id);
  }

  public async toggleArchived(id: string): Promise<boolean> {
    const storage = this.getStorage(id);
    const archived = this.readIds(storage, STORAGE_KEYS.ARCHIVED);
    const isNowArchived = !archived.includes(id);

    await storage.update(
      STORAGE_KEYS.ARCHIVED,
      isNowArchived ? [...archived, id] : archived.filter((a) => a !== id)
    );

    return isNowArchived;
  }

  // --- Recents -------------------------------------------------------------

  /**
   * Returns recently opened note ids, most recent first, merged across both scopes
   * by actual open time rather than by which store they came from.
   */
  public getRecentIds(): string[] {
    const merged = [...this.readRecents(this.workspaceState), ...this.readRecents(this.globalState)];
    return merged.sort((a, b) => b.openedAt - a.openedAt).map((entry) => entry.id);
  }

  public async recordRecent(id: string, limit = 10): Promise<void> {
    const storage = this.getStorage(id);
    const others = this.readRecents(storage).filter((entry) => entry.id !== id);
    const updated = [{ id, openedAt: Date.now() }, ...others]
      .sort((a, b) => b.openedAt - a.openedAt)
      .slice(0, limit);

    await storage.update(STORAGE_KEYS.RECENTS, updated);
  }

  // --- Lifecycle -----------------------------------------------------------

  /** Forgets all stored state for a single note. */
  public async removeNote(id: string): Promise<void> {
    await this.removeMatching(this.getStorage(id), (candidate) => candidate === id);
  }

  /**
   * Forgets stored state for every note under a folder, for use after a folder is deleted.
   * `folderId` is a note-id prefix such as `workspace:Work`.
   */
  public async removeNotesUnder(folderId: string): Promise<void> {
    const prefix = `${folderId}/`;
    await Promise.all([
      this.removeMatching(this.workspaceState, (id) => id.startsWith(prefix)),
      this.removeMatching(this.globalState, (id) => id.startsWith(prefix)),
    ]);
  }

  private async removeMatching(
    storage: vscode.Memento,
    matches: (id: string) => boolean
  ): Promise<void> {
    await Promise.all([
      storage.update(
        STORAGE_KEYS.FAVORITES,
        this.readIds(storage, STORAGE_KEYS.FAVORITES).filter((id) => !matches(id))
      ),
      storage.update(
        STORAGE_KEYS.ARCHIVED,
        this.readIds(storage, STORAGE_KEYS.ARCHIVED).filter((id) => !matches(id))
      ),
      storage.update(
        STORAGE_KEYS.RECENTS,
        this.readRecents(storage).filter((entry) => !matches(entry.id))
      ),
    ]);
  }

  /** Moves all stored state from one note id to another, across stores if the scope changed. */
  public async updateNoteId(oldId: string, newId: string): Promise<void> {
    if (oldId === newId) {
      return;
    }
    await this.remapIds(new Map([[oldId, newId]]));
  }

  /**
   * Rewrites stored state after a folder is renamed or moved, remapping every
   * contained note id from `oldFolderId` to `newFolderId`.
   */
  public async updateFolderId(oldFolderId: string, newFolderId: string): Promise<void> {
    if (oldFolderId === newFolderId) {
      return;
    }

    const oldPrefix = `${oldFolderId}/`;
    const newPrefix = `${newFolderId}/`;
    const mapping = new Map<string, string>();

    for (const storage of [this.workspaceState, this.globalState]) {
      const affected = [
        ...this.readIds(storage, STORAGE_KEYS.FAVORITES),
        ...this.readIds(storage, STORAGE_KEYS.ARCHIVED),
        ...this.readRecents(storage).map((entry) => entry.id),
      ].filter((id) => id.startsWith(oldPrefix));

      for (const id of affected) {
        mapping.set(id, `${newPrefix}${id.slice(oldPrefix.length)}`);
      }
    }

    await this.remapIds(mapping);
  }

  private async remapIds(mapping: ReadonlyMap<string, string>): Promise<void> {
    if (mapping.size === 0) {
      return;
    }

    // Collect the full desired state per store first, then write once per key,
    // so a note moving between workspace and global storage cannot lose state mid-way.
    const next = new Map<vscode.Memento, { favorites: string[]; archived: string[]; recents: RecentEntry[] }>([
      [
        this.workspaceState,
        {
          favorites: this.readIds(this.workspaceState, STORAGE_KEYS.FAVORITES),
          archived: this.readIds(this.workspaceState, STORAGE_KEYS.ARCHIVED),
          recents: this.readRecents(this.workspaceState),
        },
      ],
      [
        this.globalState,
        {
          favorites: this.readIds(this.globalState, STORAGE_KEYS.FAVORITES),
          archived: this.readIds(this.globalState, STORAGE_KEYS.ARCHIVED),
          recents: this.readRecents(this.globalState),
        },
      ],
    ]);

    for (const [oldId, newId] of mapping) {
      const from = next.get(this.getStorage(oldId))!;
      const to = next.get(this.getStorage(newId))!;

      if (from.favorites.includes(oldId)) {
        from.favorites = from.favorites.filter((id) => id !== oldId);
        to.favorites = [...to.favorites.filter((id) => id !== newId), newId];
      }

      if (from.archived.includes(oldId)) {
        from.archived = from.archived.filter((id) => id !== oldId);
        to.archived = [...to.archived.filter((id) => id !== newId), newId];
      }

      const recent = from.recents.find((entry) => entry.id === oldId);
      if (recent) {
        from.recents = from.recents.filter((entry) => entry.id !== oldId);
        to.recents = [
          { id: newId, openedAt: recent.openedAt },
          ...to.recents.filter((entry) => entry.id !== newId),
        ];
      }
    }

    await Promise.all(
      Array.from(next, ([storage, state]) =>
        Promise.all([
          storage.update(STORAGE_KEYS.FAVORITES, state.favorites),
          storage.update(STORAGE_KEYS.ARCHIVED, state.archived),
          storage.update(STORAGE_KEYS.RECENTS, state.recents),
        ])
      )
    );
  }
}
