import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Uri, testConfiguration, testState } from '../mocks/vscode';
import { MockMemento } from '../mocks/memento';
import { MetadataService } from '../../src/services/metadata-service';
import { ProjectRegistry } from '../../src/services/project-registry';
import { NoteService } from '../../src/services/note-service';

describe('NoteService', () => {
  let tempRoot: string;
  let workspaceDir: string;
  let vaultDir: string;
  let service: NoteService;
  let metadata: MetadataService;

  /** Where this project's notes land: inside the vault, never inside the project. */
  const notesRoot = (): string => path.join(vaultDir, 'projects', path.basename(workspaceDir));
  const globalRoot = (): string => path.join(vaultDir, 'global');
  const readNote = (relativePath: string): string =>
    fs.readFileSync(path.join(notesRoot(), relativePath), 'utf8');

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sidenote-test-'));
    workspaceDir = path.join(tempRoot, 'workspace');
    vaultDir = path.join(tempRoot, 'vault');
    fs.mkdirSync(workspaceDir, { recursive: true });

    testConfiguration.clear();
    testConfiguration.set('vaultPath', vaultDir);
    testState.workspaceFolders = [{ uri: Uri.file(workspaceDir) }];

    metadata = new MetadataService(new MockMemento(), new MockMemento());
    service = new NoteService(metadata, new ProjectRegistry(new MockMemento()));
  });

  afterEach(() => {
    testConfiguration.clear();
    testState.workspaceFolders = undefined;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  describe('roots', () => {
    it('keeps project notes in the vault, never inside the project', () => {
      const root = service.getWorkspaceRoot()!.fsPath;

      assert.strictEqual(root, notesRoot());
      assert.ok(!root.startsWith(workspaceDir), `${root} is inside the project`);
    });

    it('names the vault folder after the project directory', () => {
      assert.strictEqual(path.basename(service.getWorkspaceRoot()!.fsPath), 'workspace');
    });

    it('gives two projects with the same name separate folders', () => {
      const registry = new ProjectRegistry(new MockMemento());
      const first = registry.folderNameFor('/a/api');
      const second = registry.folderNameFor('/b/api');

      assert.strictEqual(first, 'api');
      assert.strictEqual(second, 'api-2');
    });

    it('keeps a project\'s notes when its directory is renamed back and forth', () => {
      const registry = new ProjectRegistry(new MockMemento());
      const original = registry.folderNameFor('/work/api');

      assert.strictEqual(registry.folderNameFor('/work/api'), original, 'same path, same folder');
    });

    it('stores notes inside the project only when asked to', () => {
      testConfiguration.set('projectNotesLocation', 'repo');
      assert.strictEqual(service.getWorkspaceRoot()?.fsPath, path.join(workspaceDir, '.notes'));

      testConfiguration.set('repoNotesPath', 'docs/notes');
      assert.strictEqual(service.getWorkspaceRoot()?.fsPath, path.join(workspaceDir, 'docs', 'notes'));
    });

    it('refuses a repo notes path that escapes the project', () => {
      testConfiguration.set('projectNotesLocation', 'repo');
      testConfiguration.set('repoNotesPath', '../outside');

      assert.strictEqual(service.getWorkspaceRoot()?.fsPath, path.join(workspaceDir, '.notes'));
    });

    it('resolves the workspace scope to the global root when no workspace is open', () => {
      testState.workspaceFolders = undefined;
      assert.strictEqual(service.getRoot('workspace').fsPath, path.resolve(globalRoot()));
    });
  });

  describe('creates nothing on its own', () => {
    it('never touches the filesystem while only reading notes', async () => {
      const before = fs.readdirSync(workspaceDir);

      await service.getAllNotes();

      assert.deepStrictEqual(fs.readdirSync(workspaceDir), before, 'scanning created something');
      assert.strictEqual(fs.existsSync(notesRoot()), false);
      assert.strictEqual(fs.existsSync(vaultDir), false, 'the vault must not be created either');
    });

    it('returns no notes when neither root exists, without erroring', async () => {
      assert.deepStrictEqual(await service.getAllNotes(), []);
    });

    it('reads a nested repo notes path whose parent is also missing', async () => {
      testConfiguration.set('projectNotesLocation', 'repo');
      testConfiguration.set('repoNotesPath', 'docs/notes');
      assert.deepStrictEqual(await service.getAllNotes(), []);

      const nested = path.join(workspaceDir, 'docs', 'notes');
      fs.mkdirSync(nested, { recursive: true });
      fs.writeFileSync(path.join(nested, 'Deep.md'), '# Deep');
      service.invalidate();

      assert.deepStrictEqual((await service.getAllNotes()).map((n) => n.title), ['Deep']);
    });
  });

  describe('createNote', () => {
    it('does not create the notes directory until a note is written', async () => {
      assert.strictEqual(fs.existsSync(notesRoot()), false);
      await service.createNote({ title: 'First', scope: 'workspace' });
      assert.strictEqual(fs.existsSync(notesRoot()), true);
    });

    it('renders the default template into the new note', async () => {
      const note = await service.createNote({ title: 'Design Doc', scope: 'workspace' });
      assert.strictEqual(note.filename, 'Design Doc.md');
      assert.strictEqual(readNote('Design Doc.md'), '# Design Doc\n\n');
      assert.strictEqual(note.title, 'Design Doc');
    });

    it('never overwrites an existing note, suffixing the filename instead', async () => {
      await service.createNote({ title: 'Notes', scope: 'workspace', content: 'original' });
      const second = await service.createNote({ title: 'Notes', scope: 'workspace', content: 'second' });

      assert.strictEqual(second.filename, 'Notes-1.md');
      assert.strictEqual(readNote('Notes.md'), 'original');
      assert.strictEqual(readNote('Notes-1.md'), 'second');
    });

    it('refuses to let a folder argument escape the notes root', async () => {
      const note = await service.createNote({
        title: 'Escapee',
        folder: '../../etc',
        scope: 'workspace',
      });

      assert.strictEqual(note.folder, 'etc');
      assert.ok(note.uri.fsPath.startsWith(notesRoot()), `${note.uri.fsPath} escaped the notes root`);
    });

    it('sanitizes a title containing path separators into one filename', async () => {
      const note = await service.createNote({ title: 'a/b:c', scope: 'workspace' });
      assert.strictEqual(note.filename, 'a-b-c.md');
      assert.strictEqual(note.folder, '');
    });
  });

  describe('getAllNotes', () => {
    it('finds notes in nested folders and skips hidden and non-markdown files', async () => {
      fs.mkdirSync(path.join(notesRoot(), 'Work'), { recursive: true });
      fs.writeFileSync(path.join(notesRoot(), 'Work', 'Plan.md'), '# Plan\n\n#roadmap');
      fs.writeFileSync(path.join(notesRoot(), 'readme.txt'), 'not a note');
      fs.writeFileSync(path.join(notesRoot(), '.hidden.md'), '# Hidden');

      const notes = await service.getAllNotes();

      assert.deepStrictEqual(
        notes.map((note) => note.relativePath),
        ['Work/Plan.md']
      );
      assert.strictEqual(notes[0].folder, 'Work');
      assert.strictEqual(notes[0].title, 'Plan');
      assert.deepStrictEqual(notes[0].tags, ['roadmap']);
    });

    it('separates workspace and global notes by scope', async () => {
      await service.createNote({ title: 'Local', scope: 'workspace' });
      await service.createNote({ title: 'Everywhere', scope: 'global' });

      const notes = await service.getAllNotes();
      const byScope = Object.fromEntries(notes.map((note) => [note.title, note.scope]));

      assert.deepStrictEqual(byScope, { Local: 'workspace', Everywhere: 'global' });
    });

    it('serves a cached result until invalidated', async () => {
      await service.createNote({ title: 'One', scope: 'workspace' });
      await service.getAllNotes(); // Prime the cache; createNote invalidates it.

      fs.writeFileSync(path.join(notesRoot(), 'Two.md'), '# Two');
      assert.strictEqual((await service.getAllNotes()).length, 1, 'expected the cached scan');

      service.invalidate();
      assert.strictEqual((await service.getAllNotes()).length, 2);
    });

    it('reflects edited content after the cache is invalidated', async () => {
      const note = await service.createNote({ title: 'Draft', scope: 'workspace' });
      fs.writeFileSync(note.uri.fsPath, '# Renamed Heading\n\n#done');
      service.invalidate();

      const [reloaded] = await service.getAllNotes();
      assert.strictEqual(reloaded.title, 'Renamed Heading');
      assert.deepStrictEqual(reloaded.tags, ['done']);
    });
  });

  describe('renameNote', () => {
    it('renames the file and carries favorite state to the new id', async () => {
      const note = await service.createNote({ title: 'Old Name', scope: 'workspace' });
      await metadata.toggleFavorite(note.id);

      const renamed = await service.renameNote(note, 'New Name');

      assert.strictEqual(renamed.filename, 'New Name.md');
      assert.strictEqual(fs.existsSync(note.uri.fsPath), false);
      assert.strictEqual(metadata.isFavorite(renamed.id), true);
      assert.strictEqual(metadata.isFavorite(note.id), false);
    });
  });

  describe('renameFolder', () => {
    it('moves the folder and remaps the ids of the notes inside it', async () => {
      const note = await service.createNote({ title: 'Task', folder: 'Work', scope: 'workspace' });
      await metadata.toggleFavorite(note.id);

      const newPath = await service.renameFolder('Work', 'Projects', 'workspace');

      assert.strictEqual(newPath, 'Projects');
      assert.strictEqual(fs.existsSync(path.join(notesRoot(), 'Projects', 'Task.md')), true);
      assert.strictEqual(metadata.isFavorite('workspace:Projects/Task.md'), true);
      assert.strictEqual(metadata.isFavorite('workspace:Work/Task.md'), false);
    });
  });

  describe('moveNote', () => {
    it('moves a note between scopes and updates its id', async () => {
      const note = await service.createNote({ title: 'Portable', scope: 'workspace' });
      await metadata.recordRecent(note.id);

      const moved = await service.moveNote(note, 'Inbox', 'global');

      assert.strictEqual(moved.scope, 'global');
      assert.strictEqual(moved.id, 'global:Inbox/Portable.md');
      assert.strictEqual(fs.existsSync(path.join(globalRoot(), 'Inbox', 'Portable.md')), true);
      assert.deepStrictEqual(metadata.getRecentIds(), ['global:Inbox/Portable.md']);
    });

    it('sanitizes a traversal attempt in the destination folder', async () => {
      const note = await service.createNote({ title: 'Stay', scope: 'workspace' });
      const moved = await service.moveNote(note, '../../escape');

      assert.strictEqual(moved.folder, 'escape');
      assert.ok(moved.uri.fsPath.startsWith(notesRoot()));
    });
  });

  describe('delete', () => {
    it('reports a permanent delete when the trash is unavailable', async () => {
      const note = await service.createNote({ title: 'Doomed', scope: 'workspace' });
      await metadata.toggleFavorite(note.id);

      const outcome = await service.deleteNote(note);

      assert.deepStrictEqual(outcome, { deleted: true, permanent: true });
      assert.strictEqual(fs.existsSync(note.uri.fsPath), false);
      assert.strictEqual(metadata.isFavorite(note.id), false);
    });

    it('deletes a folder and forgets the stored state of every note inside', async () => {
      const note = await service.createNote({ title: 'Inside', folder: 'Temp', scope: 'workspace' });
      await metadata.toggleFavorite(note.id);

      await service.deleteFolder('Temp', 'workspace');

      assert.strictEqual(fs.existsSync(path.join(notesRoot(), 'Temp')), false);
      assert.strictEqual(metadata.isFavorite(note.id), false);
    });

    it('refuses to delete a folder outside the notes root', async () => {
      await service.createNote({ title: 'Anchor', scope: 'workspace' });
      const victim = path.join(tempRoot, 'victim');
      fs.mkdirSync(victim);

      await assert.rejects(() => service.deleteFolder('../../victim', 'workspace'), /outside the notes folder/);
      assert.strictEqual(fs.existsSync(victim), true);
    });
  });

  describe('getOrCreateDailyNote', () => {
    it('creates today\'s note in the configured folder', async () => {
      testConfiguration.set('dailyNoteFolder', 'Journal');
      testConfiguration.set('dateFormat', 'YYYY-MM-DD');

      const note = await service.getOrCreateDailyNote('workspace');

      assert.strictEqual(note.folder, 'Journal');
      assert.match(note.filename, /^\d{4}-\d{2}-\d{2}\.md$/);
    });

    it('returns the same note on a second call instead of creating a duplicate', async () => {
      const first = await service.getOrCreateDailyNote('workspace');
      service.invalidate();
      const second = await service.getOrCreateDailyNote('workspace');

      assert.strictEqual(second.id, first.id);
      assert.strictEqual((await service.getAllNotes()).length, 1);
    });

    it('does not duplicate when the date format contains characters illegal in a filename', async () => {
      testConfiguration.set('dateFormat', 'YYYY/MM/DD');

      const first = await service.getOrCreateDailyNote('workspace');
      service.invalidate();
      const second = await service.getOrCreateDailyNote('workspace');

      assert.strictEqual(second.id, first.id);
      assert.strictEqual((await service.getAllNotes()).length, 1);
    });
  });

  describe('sortNotes', () => {
    it('orders by title without mutating the input array', async () => {
      await service.createNote({ title: 'Beta', scope: 'workspace' });
      await service.createNote({ title: 'alpha', scope: 'workspace' });
      service.invalidate();

      const notes = await service.getAllNotes();
      const original = notes.map((note) => note.title);
      const sorted = service.sortNotes(notes, 'titleAsc').map((note) => note.title);

      assert.deepStrictEqual(sorted, ['alpha', 'Beta']);
      assert.deepStrictEqual(
        notes.map((note) => note.title),
        original
      );
    });
  });
});
