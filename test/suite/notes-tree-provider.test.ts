import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Uri, testConfiguration, testState } from '../mocks/vscode';
import { MockMemento } from '../mocks/memento';
import { ProjectRegistry } from '../../src/services/project-registry';
import { NoteService } from '../../src/services/note-service';
import { NotesTreeProvider } from '../../src/views/notes-tree-provider';
import { NoteTreeItem, SectionId } from '../../src/models/tree-item';

describe('NotesTreeProvider', () => {
  let tempRoot: string;
  let workspaceDir: string;
  let vaultDir: string;
  let service: NoteService;
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
    vaultDir = path.join(tempRoot, 'vault');
    fs.mkdirSync(workspaceDir, { recursive: true });

    testConfiguration.clear();
    testConfiguration.set('vaultPath', vaultDir);
    testState.workspaceFolders = [{ uri: Uri.file(workspaceDir) }];

    service = new NoteService(new ProjectRegistry(new MockMemento()));
    provider = new NotesTreeProvider(service);
  });

  afterEach(() => {
    testConfiguration.clear();
    testState.workspaceFolders = undefined;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  describe('root sections', () => {
    it('shows nothing at all on a fresh install, so the welcome view takes over', async () => {
      assert.deepStrictEqual(await provider.getChildren(), []);
    });

    it('offers exactly three sections once notes exist', async () => {
      await service.createNote({ title: 'Tagged', scope: 'workspace', content: '# Tagged\n\n#work' });
      service.invalidate();

      assert.deepStrictEqual(labelsOf(await provider.getChildren()), ['This Project', 'Global', 'Tags']);
    });

    it('omits the project section when no project is open', async () => {
      await service.createNote({ title: 'Anywhere', scope: 'global' });
      testState.workspaceFolders = undefined;
      service.invalidate();

      assert.deepStrictEqual(labelsOf(await provider.getChildren()), ['Global']);
    });

    it('omits Tags until a note actually has one', async () => {
      await service.createNote({ title: 'Plain', scope: 'workspace' });
      service.invalidate();

      assert.deepStrictEqual(labelsOf(await provider.getChildren()), ['This Project', 'Global']);
    });

    it('lists a note once, not once per section', async () => {
      await service.createNote({ title: 'Auth flow', scope: 'workspace', content: '# Auth flow\n\n#backend' });
      service.invalidate();

      const rows: string[] = [];
      for (const section of await provider.getChildren()) {
        rows.push(...labelsOf(await provider.getChildren(section)));
      }

      assert.strictEqual(rows.filter((row) => row === 'Auth flow').length, 1);
    });

    it('hides Tags when the user has switched the section off', async () => {
      await service.createNote({ title: 'Tagged', scope: 'workspace', content: '# Tagged\n\n#work' });
      testConfiguration.set('showTags', false);
      service.invalidate();

      assert.deepStrictEqual(labelsOf(await provider.getChildren()), ['This Project', 'Global']);
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

    it('leaves an empty scope silent rather than showing a dead end', async () => {
      await service.createNote({ title: 'Only here', scope: 'workspace' });
      service.invalidate();

      assert.deepStrictEqual(await section('global'), [], 'an empty section should add no rows');
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
    const broken = new NotesTreeProvider({
      getAllNotes: () => Promise.reject(new Error('disk on fire')),
    } as unknown as NoteService);

    const children = await broken.getChildren();
    assert.match(String(children[0].label), /disk on fire/);
  });
});
