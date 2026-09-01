import * as assert from 'assert';
import * as vscode from 'vscode';
import { MetadataService } from '../../src/services/metadata-service';

class MockMemento implements vscode.Memento {
  private storage = new Map<string, unknown>();

  public keys(): readonly string[] {
    return Array.from(this.storage.keys());
  }

  public get<T>(key: string): T | undefined;
  public get<T>(key: string, defaultValue: T): T;
  public get<T>(key: string, defaultValue?: T): T | undefined {
    if (this.storage.has(key)) {
      return this.storage.get(key) as T;
    }
    return defaultValue;
  }

  public update(key: string, value: unknown): Thenable<void> {
    this.storage.set(key, value);
    return Promise.resolve();
  }

  public setKeysForSync(): void {}
}

describe('MetadataService', () => {
  let wsState: MockMemento;
  let globalState: MockMemento;
  let service: MetadataService;

  beforeEach(() => {
    wsState = new MockMemento();
    globalState = new MockMemento();
    service = new MetadataService(wsState, globalState);
  });

  describe('favorites / pins', () => {
    it('should toggle favorites for workspace and global notes', async () => {
      assert.strictEqual(service.isFavorite('workspace:note1.md'), false);
      const isFav1 = await service.toggleFavorite('workspace:note1.md');
      assert.strictEqual(isFav1, true);
      assert.strictEqual(service.isFavorite('workspace:note1.md'), true);

      // Toggle off
      const isFav2 = await service.toggleFavorite('workspace:note1.md');
      assert.strictEqual(isFav2, false);
      assert.strictEqual(service.isFavorite('workspace:note1.md'), false);
    });

    it('should combine favorite IDs from workspace and global storage', async () => {
      await service.toggleFavorite('workspace:note1.md');
      await service.toggleFavorite('global:note2.md');

      const allFavs = service.getFavoriteIds();
      assert.deepStrictEqual(allFavs.sort(), ['global:note2.md', 'workspace:note1.md']);
    });
  });

  describe('archive', () => {
    it('should toggle archive state', async () => {
      assert.strictEqual(service.isArchived('workspace:old.md'), false);
      await service.toggleArchived('workspace:old.md');
      assert.strictEqual(service.isArchived('workspace:old.md'), true);
      await service.toggleArchived('workspace:old.md');
      assert.strictEqual(service.isArchived('workspace:old.md'), false);
    });
  });

  describe('recents', () => {
    it('should record recent notes and enforce limit', async () => {
      await service.recordRecent('workspace:note1.md', 3);
      await service.recordRecent('workspace:note2.md', 3);
      await service.recordRecent('workspace:note3.md', 3);
      await service.recordRecent('workspace:note4.md', 3);

      const recents = service.getRecentIds();
      assert.strictEqual(recents.length, 3);
      assert.strictEqual(recents[0], 'workspace:note4.md');
    });

    it('should move re-accessed note to front of recents', async () => {
      await service.recordRecent('workspace:note1.md');
      await service.recordRecent('workspace:note2.md');
      await service.recordRecent('workspace:note1.md');

      const recents = service.getRecentIds();
      assert.deepStrictEqual(recents, ['workspace:note1.md', 'workspace:note2.md']);
    });
  });

  describe('updateNoteId and removeNote', () => {
    it('should migrate metadata on note rename', async () => {
      await service.toggleFavorite('workspace:old.md');
      await service.recordRecent('workspace:old.md');

      await service.updateNoteId('workspace:old.md', 'workspace:new.md');

      assert.strictEqual(service.isFavorite('workspace:old.md'), false);
      assert.strictEqual(service.isFavorite('workspace:new.md'), true);
      assert.strictEqual(service.getRecentIds().includes('workspace:new.md'), true);
    });

    it('should clean up metadata on note deletion', async () => {
      await service.toggleFavorite('workspace:delete-me.md');
      await service.recordRecent('workspace:delete-me.md');

      await service.removeNote('workspace:delete-me.md');

      assert.strictEqual(service.isFavorite('workspace:delete-me.md'), false);
      assert.strictEqual(service.getRecentIds().includes('workspace:delete-me.md'), false);
    });
  });
});
