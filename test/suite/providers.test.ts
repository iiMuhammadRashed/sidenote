import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Uri, Position, TextDocument, DataTransfer, testConfiguration, testState } from '../mocks/vscode';
import { MockMemento } from '../mocks/memento';
import { MetadataService } from '../../src/services/metadata-service';
import { NoteService } from '../../src/services/note-service';
import { NoteLinkProvider } from '../../src/providers/link-provider';
import { NoteCompletionProvider } from '../../src/providers/completion-provider';
import { NotesDragAndDropController, NOTE_MIME_TYPE } from '../../src/views/notes-drag-drop';
import { NoteTreeItem } from '../../src/models/tree-item';
import { NoteItem } from '../../src/models/note';

/** The provider signatures take a CancellationToken that none of them read. */
const noToken = {} as never;

describe('Markdown providers', () => {
  let tempRoot: string;
  let workspaceDir: string;
  let service: NoteService;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sidenote-providers-'));
    workspaceDir = path.join(tempRoot, 'workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });

    testConfiguration.clear();
    testConfiguration.set('globalNotesPath', path.join(tempRoot, 'global'));
    testState.workspaceFolders = [{ uri: Uri.file(workspaceDir) }];

    service = new NoteService(new MetadataService(new MockMemento(), new MockMemento()));
  });

  afterEach(() => {
    testConfiguration.clear();
    testState.workspaceFolders = undefined;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  describe('NoteLinkProvider', () => {
    const documentWith = (text: string, languageId = 'markdown') =>
      new TextDocument(Uri.file(path.join(workspaceDir, 'doc.md')), text, languageId) as never;

    it('links [[Wiki Links]] to the matching note file', async () => {
      const note = await service.createNote({ title: 'Design Doc', scope: 'workspace' });
      service.invalidate();

      const links = await new NoteLinkProvider(service).provideDocumentLinks(
        documentWith('See [[Design Doc]] for details.'),
        noToken
      );

      assert.strictEqual(links.length, 1);
      assert.strictEqual(links[0].target?.fsPath, note.uri.fsPath);
    });

    it('matches on the filename and is case insensitive', async () => {
      await service.createNote({ title: 'Design Doc', scope: 'workspace' });
      service.invalidate();

      const links = await new NoteLinkProvider(service).provideDocumentLinks(
        documentWith('[[design doc]] and [[Design Doc|a label]]'),
        noToken
      );

      assert.strictEqual(links.length, 2);
    });

    it('leaves links to unknown notes alone', async () => {
      const links = await new NoteLinkProvider(service).provideDocumentLinks(
        documentWith('[[Nothing Here]]'),
        noToken
      );

      assert.deepStrictEqual(links, []);
    });

    it('ignores documents that are not Markdown', async () => {
      await service.createNote({ title: 'Design Doc', scope: 'workspace' });
      service.invalidate();

      const links = await new NoteLinkProvider(service).provideDocumentLinks(
        documentWith('[[Design Doc]]', 'plaintext'),
        noToken
      );

      assert.deepStrictEqual(links, []);
    });
  });

  describe('NoteCompletionProvider', () => {
    const completeAfter = async (lineText: string) => {
      const document = new TextDocument(Uri.file(path.join(workspaceDir, 'doc.md')), lineText) as never;
      return new NoteCompletionProvider(service).provideCompletionItems(
        document,
        new Position(0, lineText.length) as never,
        noToken,
        {} as never
      );
    };

    it('suggests notes once the user has typed [[', async () => {
      await service.createNote({ title: 'Design Doc', scope: 'workspace' });
      service.invalidate();

      const items = await completeAfter('Link to [[');

      assert.strictEqual(items?.length, 1);
      assert.strictEqual(items[0].insertText, 'Design Doc]]');
    });

    it('stays silent anywhere else in the line', async () => {
      await service.createNote({ title: 'Design Doc', scope: 'workspace' });
      service.invalidate();

      assert.strictEqual(await completeAfter('just prose'), undefined);
    });
  });

  describe('NotesDragAndDropController', () => {
    const treeItemFor = (note: NoteItem) => NoteTreeItem.createNoteItem(note);

    it('moves a dragged note into the folder it was dropped on', async () => {
      const note = await service.createNote({ title: 'Draggable', scope: 'workspace' });
      await service.createNote({ title: 'Anchor', folder: 'Work', scope: 'workspace' });
      service.invalidate();

      const controller = new NotesDragAndDropController(service);
      const transfer = new DataTransfer();
      await controller.handleDrag([treeItemFor(note)], transfer as never, noToken);

      const folderItem = NoteTreeItem.createFolderItem('Work', 'Work', 'workspace', 1);
      await controller.handleDrop(folderItem, transfer as never, noToken);

      assert.strictEqual(
        fs.existsSync(path.join(workspaceDir, '.notes', 'Work', 'Draggable.md')),
        true
      );
    });

    it('moves a note to the other scope when dropped on that section', async () => {
      const note = await service.createNote({ title: 'Shared', scope: 'workspace' });
      service.invalidate();

      const controller = new NotesDragAndDropController(service);
      const transfer = new DataTransfer();
      await controller.handleDrag([treeItemFor(note)], transfer as never, noToken);
      await controller.handleDrop(
        NoteTreeItem.createSectionItem('Global Notes', 'global', 'globe'),
        transfer as never,
        noToken
      );

      assert.strictEqual(fs.existsSync(path.join(tempRoot, 'global', 'Shared.md')), true);
    });

    it('ignores a drop onto a section that is not a real location', async () => {
      const note = await service.createNote({ title: 'Stationary', scope: 'workspace' });
      service.invalidate();

      const controller = new NotesDragAndDropController(service);
      const transfer = new DataTransfer();
      await controller.handleDrag([treeItemFor(note)], transfer as never, noToken);
      await controller.handleDrop(
        NoteTreeItem.createSectionItem('Tags', 'tags', 'tag'),
        transfer as never,
        noToken
      );

      assert.strictEqual(fs.existsSync(note.uri.fsPath), true);
    });

    it('does nothing when the transfer holds no notes', async () => {
      const controller = new NotesDragAndDropController(service);
      await controller.handleDrop(undefined, new DataTransfer() as never, noToken);
      assert.ok(true, 'an empty drop must not throw');
    });

    it('carries no payload when nothing draggable was selected', async () => {
      const controller = new NotesDragAndDropController(service);
      const transfer = new DataTransfer();

      await controller.handleDrag(
        [NoteTreeItem.createSectionItem('Tags', 'tags', 'tag')],
        transfer as never,
        noToken
      );

      assert.strictEqual(transfer.get(NOTE_MIME_TYPE), undefined);
    });
  });
});
