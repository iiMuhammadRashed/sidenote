import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Uri, testConfiguration, testState } from '../mocks/vscode';
import { MockMemento } from '../mocks/memento';
import { MetadataService } from '../../src/services/metadata-service';
import { NoteService } from '../../src/services/note-service';
import { NotesTreeProvider } from '../../src/views/notes-tree-provider';
import { NoteTreeItem, SectionId } from '../../src/models/tree-item';

describe('NotesTreeProvider', () => {
  let tempRoot: string;
  let workspaceDir: string;
  let service: NoteService;
  let metadata: MetadataService;
  let provider: NotesTreeProvider;

  const labelsOf = (items: readonly NoteTreeItem[]): string[] => items.map((item) => String(item.label));

  const section = async (id: SectionId): Promise<NoteTreeItem[]> => {
    const roots = await provider.getChildren();
    const match = roots.find((item) => item.sectionId === id);
    assert.ok(match, `expected a "${id}" section, got ${labelsOf(roots).join(', ')}`);
    return provider.getChildren(match);
  };

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sidenote-tree-'));
    workspaceDir = path.join(tempRoot, 'workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });

    testConfiguration.clear();
    testConfiguration.set('globalNotesPath', path.join(tempRoot, 'global'));
    testState.workspaceFolders = [{ uri: Uri.file(workspaceDir) }];

    metadata = new MetadataService(new MockMemento(), new MockMemento());
    service = new NoteService(metadata);
    provider = new NotesTreeProvider(service, metadata);
  });

  afterEach(() => {
    testConfiguration.clear();
    testState.workspaceFolders = undefined;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  describe('root sections', () => {
    it('always offers both scope sections when a workspace is open', async () => {
      const roots = await provider.getChildren();
      assert.deepStrictEqual(labelsOf(roots), ['Workspace Notes', 'Global Notes']);
    });

    it('omits the workspace section when no workspace is open', async () => {
      testState.workspaceFolders = undefined;
      service.invalidate();

      const roots = await provider.getChildren();
      assert.deepStrictEqual(labelsOf(roots), ['Global Notes']);
    });

    it('adds the Favorites section only once a note is favorited', async () => {
      const note = await service.createNote({ title: 'Pinned', scope: 'workspace' });
      assert.strictEqual((await provider.getChildren()).some((i) => i.sectionId === 'favorites'), false);

      await metadata.toggleFavorite(note.id);
      service.invalidate();

      assert.deepStrictEqual(labelsOf(await section('favorites')), ['Pinned']);
    });

    it('hides sections the user has switched off', async () => {
      await service.createNote({ title: 'Tagged', scope: 'workspace', content: '# Tagged\n\n#work' });
      await service.getOrCreateDailyNote('workspace');
      testConfiguration.set('showTags', false);
      testConfiguration.set('showRecent', false);
      service.invalidate();

      const sectionIds = (await provider.getChildren()).map((item) => item.sectionId);
      assert.strictEqual(sectionIds.includes('tags'), false);
      assert.strictEqual(sectionIds.includes('recent'), false);
    });

    it('shows archived notes in their own section only when enabled', async () => {
      const note = await service.createNote({ title: 'Stale', scope: 'workspace' });
      await metadata.toggleArchived(note.id);
      service.invalidate();

      assert.strictEqual((await provider.getChildren()).some((i) => i.sectionId === 'archive'), false);

      testConfiguration.set('showArchive', true);
      assert.deepStrictEqual(labelsOf(await section('archive')), ['Stale']);
    });

    it('keeps archived notes out of the scope sections', async () => {
      const kept = await service.createNote({ title: 'Kept', scope: 'workspace' });
      const archived = await service.createNote({ title: 'Archived', scope: 'workspace' });
      await metadata.toggleArchived(archived.id);
      service.invalidate();

      assert.deepStrictEqual(labelsOf(await section('workspace')), [kept.title]);
    });
  });

  describe('folder hierarchy', () => {
    it('lists direct subfolders before notes, with a recursive note count', async () => {
      await service.createNote({ title: 'Loose', scope: 'workspace' });
      await service.createNote({ title: 'Deep', folder: 'Work/2026', scope: 'workspace' });
      service.invalidate();

      const children = await section('workspace');
      assert.deepStrictEqual(labelsOf(children), ['Work', 'Loose']);
      assert.strictEqual(children[0].description, '1');
      assert.strictEqual(children[0].itemType, 'folder');
    });

    it('expands a nested folder to its own children', async () => {
      await service.createNote({ title: 'Deep', folder: 'Work/2026', scope: 'workspace' });
      service.invalidate();

      const [work] = await section('workspace');
      const inner = await provider.getChildren(work);

      assert.deepStrictEqual(labelsOf(inner), ['2026']);
      assert.deepStrictEqual(labelsOf(await provider.getChildren(inner[0])), ['Deep']);
    });

    it('offers a create-a-note affordance when a scope is empty', async () => {
      const [empty] = await section('workspace');
      assert.strictEqual(empty.itemType, 'empty');
      assert.ok(empty.command, 'the empty item should be clickable');
    });
  });

  describe('recent notes', () => {
    it('lists recents newest first and honours the configured limit', async () => {
      const first = await service.createNote({ title: 'First', scope: 'workspace' });
      const second = await service.createNote({ title: 'Second', scope: 'workspace' });
      await metadata.recordRecent(first.id);
      await metadata.recordRecent(second.id);
      testConfiguration.set('recentLimit', 1);
      service.invalidate();

      assert.deepStrictEqual(labelsOf(await section('recent')), ['Second']);
    });

    it('drops recents whose file no longer exists', async () => {
      const note = await service.createNote({ title: 'Ghost', scope: 'workspace' });
      await metadata.recordRecent(note.id);
      fs.rmSync(note.uri.fsPath);
      service.invalidate();

      const sectionIds = (await provider.getChildren()).map((item) => item.sectionId);
      assert.strictEqual(sectionIds.includes('recent'), false);
    });
  });

  describe('tag filtering', () => {
    it('replaces the tree with matching notes and a clearable banner', async () => {
      await service.createNote({ title: 'Tagged', scope: 'workspace', content: '# Tagged\n\n#work' });
      await service.createNote({ title: 'Plain', scope: 'workspace' });
      service.invalidate();

      provider.setTagFilter('work');
      const children = await provider.getChildren();

      assert.strictEqual(children[0].itemType, 'filterBanner');
      assert.deepStrictEqual(labelsOf(children.slice(1)), ['Tagged']);
    });

    it('reports an empty result rather than an empty tree', async () => {
      await service.createNote({ title: 'Plain', scope: 'workspace' });
      service.invalidate();

      provider.setTagFilter('missing');
      const children = await provider.getChildren();

      assert.strictEqual(children[1].itemType, 'empty');
    });

    it('announces filter changes so the clear action can be revealed', () => {
      const seen: (string | undefined)[] = [];
      provider.onDidChangeTagFilter((tag) => seen.push(tag));

      provider.setTagFilter('Work');
      provider.setTagFilter('work'); // Same tag after normalization: no second event.
      provider.setTagFilter(undefined);

      assert.deepStrictEqual(seen, ['work', undefined]);
      assert.strictEqual(provider.getActiveTagFilter(), undefined);
    });
  });

  it('surfaces a read failure as a tree item instead of throwing', async () => {
    testState.workspaceFolders = [{ uri: Uri.file(workspaceDir) }];
    const broken = new NotesTreeProvider(
      { getAllNotes: () => Promise.reject(new Error('disk on fire')) } as unknown as NoteService,
      metadata
    );

    const children = await broken.getChildren();
    assert.match(String(children[0].label), /disk on fire/);
  });
});
