import * as vscode from 'vscode';
import { NoteService } from '../services/note-service';
import { NoteScope } from '../models/note';

/** How long typing must settle before the note is written to disk. */
const SAVE_DEBOUNCE_MS = 400;

/** Remembers which scope the panel was last editing, across restarts. */
const LAST_SCOPE_KEY = 'sidenote.quickNote.scope';

/** Filename used for the note this panel edits, one per scope. */
const QUICK_NOTE_FILENAME = 'Quick Note.md';

type InboundMessage =
  | { type: 'ready' }
  | { type: 'edit'; text: string }
  | { type: 'setScope'; scope: NoteScope }
  | { type: 'setMode'; mode: 'write' | 'preview' }
  | { type: 'openInEditor' };

/**
 * A Markdown scratchpad rendered directly in the sidebar.
 *
 * It edits a real `.md` file so the note stays greppable, git-versionable and
 * openable in a normal editor tab — but the file is only created once you type
 * something, so opening a project never leaves anything behind.
 */
export class QuickNoteViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'sidenote.quickNote';

  private view?: vscode.WebviewView;
  private saveTimer?: NodeJS.Timeout;
  private pendingText?: string;
  /** Text this panel last wrote, so the watcher does not echo our own save back at us. */
  private lastWrittenText?: string;
  private mode: 'write' | 'preview' = 'write';

  constructor(
    private readonly noteService: NoteService,
    private readonly memento: vscode.Memento,
    private readonly extensionUri: vscode.Uri
  ) {}

  private get scope(): NoteScope {
    const stored = this.memento.get<NoteScope>(LAST_SCOPE_KEY);
    if (stored === 'workspace' || stored === 'global') {
      return stored;
    }
    return this.noteService.resolveDefaultScope();
  }

  /** The file this panel edits. It may not exist yet; that is the normal starting state. */
  private get noteUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.noteService.getRoot(this.scope), QUICK_NOTE_FILENAME);
  }

  public resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    view.webview.html = this.renderHtml(view.webview);

    view.webview.onDidReceiveMessage((message: InboundMessage) => {
      void this.handleMessage(message);
    });

    view.onDidDispose(() => {
      void this.flush();
      this.view = undefined;
    });
  }

  private async handleMessage(message: InboundMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this.pushStateToWebview();
        return;

      case 'edit':
        this.scheduleSave(message.text);
        return;

      case 'setScope':
        await this.flush();
        await this.memento.update(LAST_SCOPE_KEY, message.scope);
        await this.pushStateToWebview();
        return;

      case 'setMode':
        this.mode = message.mode;
        await this.pushStateToWebview();
        return;

      case 'openInEditor':
        await this.openInEditor();
        return;
    }
  }

  /** Reloads from disk and repaints. Called on scope change and on external file edits. */
  public async refresh(): Promise<void> {
    if (this.view) {
      await this.pushStateToWebview();
    }
  }

  private async pushStateToWebview(): Promise<void> {
    if (!this.view) {
      return;
    }

    const text = await this.readNote();
    this.lastWrittenText = text;

    await this.view.webview.postMessage({
      type: 'state',
      text,
      mode: this.mode,
      scope: this.scope,
      canUseWorkspace: this.noteService.getWorkspaceRoot() !== undefined,
      html: this.mode === 'preview' ? await renderMarkdown(text) : undefined,
    });
  }

  private async readNote(): Promise<string> {
    try {
      return await this.noteService.readNoteContent(this.noteUri);
    } catch {
      return ''; // Not created yet, which is the expected state until the first keystroke.
    }
  }

  private scheduleSave(text: string): void {
    this.pendingText = text;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.save(), SAVE_DEBOUNCE_MS);
  }

  /**
   * Writes any pending edit immediately, for when the panel is going away or the
   * scope is changing. Returns the write so callers can wait for it to land.
   */
  public flush(): Promise<void> {
    if (!this.saveTimer) {
      return Promise.resolve();
    }
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    return this.save();
  }

  private async save(): Promise<void> {
    const text = this.pendingText;
    this.pendingText = undefined;
    if (text === undefined || text === this.lastWrittenText) {
      return;
    }

    // An empty panel means "no note". Writing it would create a file the user never
    // asked for, so hold off until there is something worth saving. `lastWrittenText`
    // is undefined until the first read finishes, which also counts as "no note yet".
    if (text.trim() === '' && !this.lastWrittenText) {
      return;
    }

    const uri = this.noteUri;
    try {
      // Creating the parent here is what makes the notes root appear on first
      // keystroke rather than at activation.
      await vscode.workspace.fs.createDirectory(this.noteService.getRoot(this.scope));
      await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'));
      this.lastWrittenText = text;
      this.noteService.invalidate();
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Sidenote: could not save the quick note — ${detail}`);
    }
  }

  private async openInEditor(): Promise<void> {
    await this.flush();
    try {
      const document = await vscode.workspace.openTextDocument(this.noteUri);
      await vscode.window.showTextDocument(document, { preview: false });
    } catch {
      vscode.window.showInformationMessage('Sidenote: write something first — the note has no file yet.');
    }
  }

  private renderHtml(webview: vscode.Webview): string {
    const nonce = createNonce();
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} https: data:`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0; height: 100vh; display: flex; flex-direction: column;
    font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
    color: var(--vscode-foreground); background: transparent;
  }
  .bar {
    display: flex; align-items: center; gap: 4px;
    padding: 6px 8px; border-bottom: 1px solid var(--vscode-panel-border, transparent);
    flex: 0 0 auto;
  }
  .spacer { flex: 1 1 auto; }
  button {
    font: inherit; color: var(--vscode-foreground); background: transparent;
    border: 1px solid transparent; border-radius: 4px; padding: 3px 8px; cursor: pointer;
  }
  button:hover { background: var(--vscode-toolbar-hoverBackground); }
  button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  button[aria-pressed="true"] {
    background: var(--vscode-inputOption-activeBackground, var(--vscode-toolbar-hoverBackground));
    border-color: var(--vscode-inputOption-activeBorder, transparent);
    color: var(--vscode-inputOption-activeForeground, inherit);
  }
  button[disabled] { opacity: .4; cursor: default; }
  textarea {
    flex: 1 1 auto; width: 100%; resize: none; border: 0; outline: 0; padding: 10px 12px;
    font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size);
    line-height: 1.55; color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background, transparent);
  }
  textarea::placeholder { color: var(--vscode-input-placeholderForeground); }
  #preview { flex: 1 1 auto; overflow: auto; padding: 6px 12px 24px; line-height: 1.6; }
  #preview :is(h1,h2,h3,h4) { margin: .9em 0 .4em; line-height: 1.25; }
  #preview h1 { font-size: 1.5em; } #preview h2 { font-size: 1.25em; } #preview h3 { font-size: 1.1em; }
  #preview code { font-family: var(--vscode-editor-font-family); font-size: .92em;
    background: var(--vscode-textCodeBlock-background); padding: .15em .35em; border-radius: 3px; }
  #preview pre { background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 5px; overflow: auto; }
  #preview pre code { background: none; padding: 0; }
  #preview blockquote { margin: .6em 0; padding-left: .9em;
    border-left: 3px solid var(--vscode-textBlockQuote-border); color: var(--vscode-descriptionForeground); }
  #preview a { color: var(--vscode-textLink-foreground); }
  #preview table { border-collapse: collapse; }
  #preview :is(th,td) { border: 1px solid var(--vscode-panel-border); padding: 4px 8px; }
  #preview img { max-width: 100%; }
  .empty { color: var(--vscode-descriptionForeground); font-style: italic; padding: 10px 12px; }
</style>
</head>
<body>
  <div class="bar">
    <button id="scope" title="Switch between this project's note and your global note"></button>
    <div class="spacer"></div>
    <button id="write" aria-pressed="true" title="Write">Write</button>
    <button id="preview-btn" aria-pressed="false" title="Preview">Preview</button>
    <button id="open" title="Open this note in an editor tab">&#8599;</button>
  </div>
  <textarea id="editor" spellcheck="false" placeholder="Write a note&#8230;"></textarea>
  <div id="preview" hidden></div>

<script nonce="${nonce}">
(function () {
  const vscode = acquireVsCodeApi();
  const editor = document.getElementById('editor');
  const preview = document.getElementById('preview');
  const scopeBtn = document.getElementById('scope');
  const writeBtn = document.getElementById('write');
  const previewBtn = document.getElementById('preview-btn');
  const openBtn = document.getElementById('open');

  let scope = 'workspace';
  let canUseWorkspace = true;
  let applying = false;

  editor.addEventListener('input', () => {
    if (!applying) {
      vscode.postMessage({ type: 'edit', text: editor.value });
    }
  });

  scopeBtn.addEventListener('click', () => {
    if (!canUseWorkspace) { return; }
    vscode.postMessage({ type: 'setScope', scope: scope === 'workspace' ? 'global' : 'workspace' });
  });
  writeBtn.addEventListener('click', () => vscode.postMessage({ type: 'setMode', mode: 'write' }));
  previewBtn.addEventListener('click', () => vscode.postMessage({ type: 'setMode', mode: 'preview' }));
  openBtn.addEventListener('click', () => vscode.postMessage({ type: 'openInEditor' }));

  window.addEventListener('message', (event) => {
    const state = event.data;
    if (!state || state.type !== 'state') { return; }

    scope = state.scope;
    canUseWorkspace = state.canUseWorkspace;
    scopeBtn.textContent = scope === 'workspace' ? 'This project' : 'Global';
    scopeBtn.disabled = !canUseWorkspace;

    const isPreview = state.mode === 'preview';
    writeBtn.setAttribute('aria-pressed', String(!isPreview));
    previewBtn.setAttribute('aria-pressed', String(isPreview));
    editor.hidden = isPreview;
    preview.hidden = !isPreview;

    if (isPreview) {
      preview.innerHTML = state.text.trim()
        ? state.html
        : '<p class="empty">Nothing to preview yet.</p>';
    } else if (editor.value !== state.text) {
      // Only overwrite when the text genuinely differs, so the caret survives a repaint.
      const caret = editor.selectionStart;
      applying = true;
      editor.value = state.text;
      editor.setSelectionRange(caret, caret);
      applying = false;
    }
  });

  vscode.postMessage({ type: 'ready' });
}());
</script>
</body>
</html>`;
  }
}

/**
 * Renders Markdown using the built-in Markdown extension, so the result matches
 * VS Code's own preview without pulling in a Markdown library.
 */
async function renderMarkdown(text: string): Promise<string> {
  try {
    const html = await vscode.commands.executeCommand<string>('markdown.api.render', text);
    if (typeof html === 'string') {
      return html;
    }
  } catch {
    // The built-in Markdown extension can be disabled; fall through to plain text.
  }
  return `<pre>${escapeHtml(text)}</pre>`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return nonce;
}
