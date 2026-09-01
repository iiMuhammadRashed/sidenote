import * as assert from 'assert';
import * as path from 'path';
import {
  sanitizeFilename,
  ensureMarkdownExtension,
  stripMarkdownExtension,
  isPathInside,
  extractTitleFromMarkdown,
  toRelativePath,
} from '../../src/utils/path-utils';

describe('PathUtils', () => {
  describe('sanitizeFilename', () => {
    it('should sanitize invalid characters', () => {
      assert.strictEqual(sanitizeFilename('my:invalid/file?name*.md'), 'my-invalid-file-name-.md');
      assert.strictEqual(sanitizeFilename('hello <world> | test'), 'hello -world- - test');
    });

    it('should return fallback for empty or whitespace-only names', () => {
      assert.strictEqual(sanitizeFilename(''), 'Untitled');
      assert.strictEqual(sanitizeFilename('   '), 'Untitled');
      assert.strictEqual(sanitizeFilename('...', 'DefaultNote'), 'DefaultNote');
    });

    it('should trim leading and trailing spaces and dots', () => {
      assert.strictEqual(sanitizeFilename(' .my-note. '), 'my-note');
    });
  });

  describe('ensureMarkdownExtension and stripMarkdownExtension', () => {
    it('should add .md extension if missing', () => {
      assert.strictEqual(ensureMarkdownExtension('note'), 'note.md');
      assert.strictEqual(ensureMarkdownExtension('note.md'), 'note.md');
      assert.strictEqual(ensureMarkdownExtension('note.MD'), 'note.MD');
    });

    it('should strip .md extension cleanly', () => {
      assert.strictEqual(stripMarkdownExtension('note.md'), 'note');
      assert.strictEqual(stripMarkdownExtension('note.MD'), 'note');
      assert.strictEqual(stripMarkdownExtension('my.note.file.md'), 'my.note.file');
      assert.strictEqual(stripMarkdownExtension('note.txt'), 'note.txt');
    });
  });

  describe('isPathInside', () => {
    it('should return true for valid child paths', () => {
      const parent = path.resolve('/notes');
      assert.strictEqual(isPathInside(parent, path.resolve('/notes/subfolder/file.md')), true);
      assert.strictEqual(isPathInside(parent, path.resolve('/notes/file.md')), true);
    });

    it('should return false for traversal attempts outside parent directory', () => {
      const parent = path.resolve('/notes');
      assert.strictEqual(isPathInside(parent, path.resolve('/notes/../etc/passwd')), false);
      assert.strictEqual(isPathInside(parent, path.resolve('/other/folder/file.md')), false);
      assert.strictEqual(isPathInside(parent, path.resolve('/notes_other')), false);
    });
  });

  describe('extractTitleFromMarkdown', () => {
    it('should extract title from first H1 heading', () => {
      const md = '# My Custom Title\n\nSome content here';
      assert.strictEqual(extractTitleFromMarkdown(md, 'Fallback'), 'My Custom Title');
    });

    it('should ignore H2 or deeper headings and return fallback if no H1', () => {
      const md = '## Subheading\n\nSome content';
      assert.strictEqual(extractTitleFromMarkdown(md, 'Fallback'), 'Fallback');
    });

    it('should return fallback for empty markdown', () => {
      assert.strictEqual(extractTitleFromMarkdown('', 'Fallback'), 'Fallback');
    });
  });

  describe('toRelativePath', () => {
    it('should convert path to normalized forward-slash relative path', () => {
      const root = path.resolve('/workspace/notes');
      const target = path.resolve('/workspace/notes/Work/Project.md');
      assert.strictEqual(toRelativePath(root, target), 'Work/Project.md');
    });
  });
});
