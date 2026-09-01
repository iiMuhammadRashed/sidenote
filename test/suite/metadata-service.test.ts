import * as assert from 'assert';
import { MockMemento } from '../mocks/memento';
import { MetadataService } from '../../src/services/metadata-service';

describe('MetadataService', () => {
  let workspaceState: MockMemento;
  let globalState: MockMemento;
  let service: MetadataService;

  beforeEach(() => {
    workspaceState = new MockMemento();
    globalState = new MockMemento();
    service = new MetadataService(workspaceState, globalState);
  });

  describe('favorites', () => {
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

    it('stores workspace favorites and global favorites in separate mementos', async () => {
      await service.toggleFavorite('workspace:note1.md');
      await service.toggleFavorite('global:note2.md');

      assert.deepStrictEqual(workspaceState.get('sidenote.favorites'), ['workspace:note1.md']);
      assert.deepStrictEqual(globalState.get('sidenote.favorites'), ['global:note2.md']);
      assert.strictEqual(service.isFavorite('workspace:note1.md'), true);
      assert.strictEqual(service.isFavorite('global:note2.md'), true);
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

    it('interleaves workspace and global recents by when they were opened', async () => {
      // Seeded directly so the timestamps are unambiguous; Date.now() has only ms resolution.
      await workspaceState.update('sidenote.recents', [
        { id: 'workspace:old.md', openedAt: 100 },
        { id: 'workspace:newest.md', openedAt: 300 },
      ]);
      await globalState.update('sidenote.recents', [{ id: 'global:middle.md', openedAt: 200 }]);

      assert.deepStrictEqual(service.getRecentIds(), [
        'workspace:newest.md',
        'global:middle.md',
        'workspace:old.md',
      ]);
    });

    it('reads recents written by pre-1.0 versions as a plain id array', async () => {
      await workspaceState.update('sidenote.recents', ['workspace:a.md', 'workspace:b.md']);

      assert.deepStrictEqual(service.getRecentIds(), ['workspace:a.md', 'workspace:b.md']);
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

    it('carries state across mementos when a note changes scope', async () => {
      await service.toggleFavorite('workspace:note.md');
      await service.recordRecent('workspace:note.md');

      await service.updateNoteId('workspace:note.md', 'global:note.md');

      assert.strictEqual(service.isFavorite('global:note.md'), true);
      assert.deepStrictEqual(workspaceState.get('sidenote.favorites'), []);
      assert.deepStrictEqual(globalState.get('sidenote.favorites'), ['global:note.md']);
      assert.deepStrictEqual(service.getRecentIds(), ['global:note.md']);
    });

    it('should clean up metadata on note deletion', async () => {
      await service.toggleFavorite('workspace:delete-me.md');
      await service.recordRecent('workspace:delete-me.md');

      await service.removeNote('workspace:delete-me.md');

      assert.strictEqual(service.isFavorite('workspace:delete-me.md'), false);
      assert.strictEqual(service.getRecentIds().includes('workspace:delete-me.md'), false);
    });
  });

  describe('folder operations', () => {
    it('remaps every contained note id when a folder is renamed', async () => {
      await service.toggleFavorite('workspace:Work/a.md');
      await service.toggleArchived('workspace:Work/nested/b.md');
      await service.toggleFavorite('workspace:Other/c.md');

      await service.updateFolderId('workspace:Work', 'workspace:Projects');

      assert.strictEqual(service.isFavorite('workspace:Projects/a.md'), true);
      assert.strictEqual(service.isArchived('workspace:Projects/nested/b.md'), true);
      assert.strictEqual(service.isFavorite('workspace:Work/a.md'), false);
      assert.strictEqual(service.isFavorite('workspace:Other/c.md'), true, 'sibling folders are untouched');
    });

    it('forgets every note under a deleted folder', async () => {
      await service.toggleFavorite('workspace:Temp/a.md');
      await service.recordRecent('workspace:Temp/nested/b.md');
      await service.toggleFavorite('workspace:Keep/c.md');

      await service.removeNotesUnder('workspace:Temp');

      assert.strictEqual(service.isFavorite('workspace:Temp/a.md'), false);
      assert.deepStrictEqual(service.getRecentIds(), []);
      assert.strictEqual(service.isFavorite('workspace:Keep/c.md'), true);
    });
  });
});
