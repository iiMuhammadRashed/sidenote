import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Uri, testConfiguration, testState } from '../mocks/vscode';
import { MockMemento } from '../mocks/memento';
import { MetadataService } from '../../src/services/metadata-service';
import { ProjectRegistry } from '../../src/services/project-registry';
import { NoteService } from '../../src/services/note-service';
import { QuickNoteViewProvider } from '../../src/views/quick-note-view';

/** Captures what the provider posts back to the webview. */
class FakeWebviewView {
  public readonly posted: Record<string, unknown>[] = [];
  private handler?: (message: unknown) => void;

  public readonly webview = {
    options: {},
    cspSource: 'vscode-resource:',
    html: '',
    onDidReceiveMessage: (handler: (message: unknown) => void) => {
      this.handler = handler;
      return { dispose() {} };
    },
    postMessage: async (message: Record<string, unknown>) => {
      this.posted.push(message);
      return true;
    },
  };

  public onDidDispose = () => ({ dispose() {} });

  public send(message: unknown): void {
    this.handler?.(message);
  }

  public get lastState(): Record<string, unknown> | undefined {
    return [...this.posted].reverse().find((m) => m.type === 'state');
  }
}

type PostedState = Record<string, unknown>;

/**
 * Waits for the provider to post a state matching the predicate.
 * Polling a condition beats a fixed number of ticks, whose timing depends on how
 * long the filesystem takes and made these tests flaky.
 */
async function waitForState(
  view: FakeWebviewView,
  predicate: (state: PostedState) => boolean = () => true
): Promise<PostedState> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const state = view.lastState;
    if (state && predicate(state)) {
      return state;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for state; posted: ${JSON.stringify(view.posted)}`);
}

describe('QuickNoteViewProvider', () => {
  let tempRoot: string;
  let workspaceDir: string;
  let vaultDir: string;
  let provider: QuickNoteViewProvider;
  let view: FakeWebviewView;
  let noteService: NoteService;

  const projectRoot = (): string => path.join(vaultDir, 'projects', path.basename(workspaceDir));
  const quickNotePath = (): string => path.join(projectRoot(), 'Quick Note.md');

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sidenote-qn-'));
    workspaceDir = path.join(tempRoot, 'workspace');
    vaultDir = path.join(tempRoot, 'vault');
    fs.mkdirSync(workspaceDir, { recursive: true });

    testConfiguration.clear();
    testConfiguration.set('vaultPath', vaultDir);
    testState.workspaceFolders = [{ uri: Uri.file(workspaceDir) }];

    noteService = new NoteService(new MetadataService(new MockMemento(), new MockMemento()), new ProjectRegistry(new MockMemento()));
    provider = new QuickNoteViewProvider(noteService, new MockMemento(), Uri.file(tempRoot) as never);
    view = new FakeWebviewView();
    provider.resolveWebviewView(view as never);
  });

  afterEach(() => {
    testConfiguration.clear();
    testState.workspaceFolders = undefined;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('shows an empty note when no file exists yet', async () => {
    view.send({ type: 'ready' });
    const state = await waitForState(view);

    assert.strictEqual(state.text, '');
    assert.strictEqual(state.scope, 'workspace');
  });

  it('creates nothing while the panel is merely open', async () => {
    view.send({ type: 'ready' });
    await waitForState(view);

    assert.strictEqual(fs.existsSync(projectRoot()), false);
    assert.strictEqual(fs.existsSync(vaultDir), false);
  });

  it('does not write a file for an edit that leaves the note empty', async () => {
    view.send({ type: 'ready' });
    await waitForState(view);

    view.send({ type: 'edit', text: '   \n  ' });
    await provider.flush();

    assert.strictEqual(fs.existsSync(projectRoot()), false);
  });

  it('writes the note, creating the notes folder, on the first real keystroke', async () => {
    view.send({ type: 'ready' });
    await waitForState(view);

    view.send({ type: 'edit', text: '# Hello\n' });
    await provider.flush();

    assert.strictEqual(fs.readFileSync(quickNotePath(), 'utf8'), '# Hello\n');
  });

  it('lets the note be cleared once it exists', async () => {
    view.send({ type: 'ready' });
    await waitForState(view);
    view.send({ type: 'edit', text: 'draft' });
    await provider.flush();

    view.send({ type: 'edit', text: '' });
    await provider.flush();

    assert.strictEqual(fs.readFileSync(quickNotePath(), 'utf8'), '');
  });

  it('reads back an existing note written outside the panel', async () => {
    fs.mkdirSync(path.dirname(quickNotePath()), { recursive: true });
    fs.writeFileSync(quickNotePath(), '# From disk');

    view.send({ type: 'ready' });
    const state = await waitForState(view);

    assert.strictEqual(state.text, '# From disk');
  });

  it('keeps the project note and the global note separate', async () => {
    view.send({ type: 'ready' });
    await waitForState(view);
    view.send({ type: 'edit', text: 'project' });
    await provider.flush();

    view.send({ type: 'setScope', scope: 'global' });
    await waitForState(view, (s) => s.scope === 'global');
    assert.strictEqual(view.lastState?.text, '', 'the global note starts empty');

    view.send({ type: 'edit', text: 'global' });
    await provider.flush();

    assert.strictEqual(fs.readFileSync(path.join(vaultDir, 'global', 'Quick Note.md'), 'utf8'), 'global');
    assert.strictEqual(fs.readFileSync(quickNotePath(), 'utf8'), 'project');
  });

  it('reports whether a workspace scope is even available', async () => {
    testState.workspaceFolders = undefined;
    view.send({ type: 'ready' });
    const state = await waitForState(view);

    assert.strictEqual(state.canUseWorkspace, false);
  });

  it('sends rendered html only in preview mode', async () => {
    view.send({ type: 'ready' });
    assert.strictEqual((await waitForState(view)).html, undefined);

    view.send({ type: 'setMode', mode: 'preview' });
    const state = await waitForState(view, (s) => s.mode === 'preview');

    assert.strictEqual(typeof state.html, 'string');
  });

  it('escapes the note when the built-in Markdown renderer is unavailable', async () => {
    view.send({ type: 'ready' });
    await waitForState(view);
    view.send({ type: 'edit', text: '<img src=x onerror=alert(1)>' });
    await provider.flush();

    view.send({ type: 'setMode', mode: 'preview' });
    const state = await waitForState(view, (s) => s.mode === 'preview');

    const html = String(state.html);
    assert.ok(!html.includes('<img'), `unescaped markup reached the webview: ${html}`);
    assert.ok(html.includes('&lt;img'), html);
  });
});
