import * as assert from 'assert';
import * as vscode from 'vscode';
import { SearchService } from '../../src/services/search-service';
import { NoteService } from '../../src/services/note-service';
import { NoteItem } from '../../src/models/note';

describe('SearchService', () => {
  const dummyNotes: NoteItem[] = [
    {
      id: 'workspace:Project/Architecture.md',
      title: 'Architecture Overview',
      uri: vscode.Uri.file('/notes/Project/Architecture.md'),
      relativePath: 'Project/Architecture.md',
      folder: 'Project',
      filename: 'Architecture.md',
      scope: 'workspace',
      ctime: 100,
      mtime: 100,
      size: 200,
      tags: ['system', 'backend'],
    },
    {
      id: 'workspace:Meeting-2026-09-02.md',
      title: 'Team Sync Notes',
      uri: vscode.Uri.file('/notes/Meeting-2026-09-02.md'),
      relativePath: 'Meeting-2026-09-02.md',
      folder: '',
      filename: 'Meeting-2026-09-02.md',
      scope: 'workspace',
      ctime: 200,
      mtime: 200,
      size: 150,
      tags: ['meeting', 'team'],
    },
    {
      id: 'global:Ideas.md',
      title: 'Product Ideas',
      uri: vscode.Uri.file('/global/Ideas.md'),
      relativePath: 'Ideas.md',
      folder: '',
      filename: 'Ideas.md',
      scope: 'global',
      ctime: 300,
      mtime: 300,
      size: 100,
      tags: ['brainstorm'],
    },
  ];

  const noteContents: Record<string, string> = {
    '/notes/Project/Architecture.md': '# Architecture Overview\n\nWe use Node.js and TypeScript for the core engine.',
    '/notes/Meeting-2026-09-02.md': '# Team Sync Notes\n\nDiscussed release roadmap and marketplace publishing.',
    '/global/Ideas.md': '# Product Ideas\n\nBuild a revolutionary sidebar extension.',
  };

  const mockNoteService = {
    readNoteContent: async (uri: vscode.Uri) => {
      return noteContents[uri.fsPath] || '';
    },
  } as unknown as NoteService;

  let searchService: SearchService;

  beforeEach(() => {
    searchService = new SearchService(mockNoteService);
  });

  it('should find notes matching exact or prefix title with high score', async () => {
    const results = await searchService.search('Architecture', dummyNotes);
    assert.strictEqual(results.length > 0, true);
    assert.strictEqual(results[0].note.title, 'Architecture Overview');
    assert.strictEqual(results[0].matchType, 'title');
    assert.strictEqual(results[0].score >= 90, true);
  });

  it('should find notes matching tags', async () => {
    const results = await searchService.search('backend', dummyNotes);
    assert.strictEqual(results.length > 0, true);
    assert.strictEqual(results[0].note.title, 'Architecture Overview');
    assert.strictEqual(results[0].matchType, 'tag');
  });

  it('should find notes matching full text in content and provide snippet', async () => {
    const results = await searchService.search('marketplace', dummyNotes);
    assert.strictEqual(results.length > 0, true);
    assert.strictEqual(results[0].note.title, 'Team Sync Notes');
    assert.strictEqual(results[0].matchType, 'content');
    assert.strictEqual(results[0].excerpt?.includes('marketplace'), true);
  });

  it('should filter by scope', async () => {
    const wsResults = await searchService.search('', dummyNotes, { scope: 'workspace' });
    assert.strictEqual(wsResults.length, 2);
    assert.strictEqual(wsResults.every((r) => r.note.scope === 'workspace'), true);

    const globalResults = await searchService.search('', dummyNotes, { scope: 'global' });
    assert.strictEqual(globalResults.length, 1);
    assert.strictEqual(globalResults[0].note.scope, 'global');
  });

  it('should filter by tag', async () => {
    const tagResults = await searchService.search('', dummyNotes, { tag: 'brainstorm' });
    assert.strictEqual(tagResults.length, 1);
    assert.strictEqual(tagResults[0].note.title, 'Product Ideas');
  });
});
