import * as assert from 'assert';
import { TagService } from '../../src/services/tag-service';
import { NoteItem } from '../../src/models/note';
import * as vscode from 'vscode';

describe('TagService', () => {
  describe('extractTags', () => {
    it('should extract inline hashtags', () => {
      const content = 'This is a note with #work and #project-alpha tags. Also #todo_list.';
      const tags = TagService.extractTags(content);
      assert.deepStrictEqual(tags, ['project-alpha', 'todo_list', 'work']);
    });

    it('should extract tags from YAML frontmatter array format', () => {
      const content = `---
title: My Note
tags: [dev, typescript, vscode]
---
# Note Content
`;
      const tags = TagService.extractTags(content);
      assert.deepStrictEqual(tags, ['dev', 'typescript', 'vscode']);
    });

    it('should extract tags from YAML frontmatter list format', () => {
      const content = `---
tags:
  - design
  - architecture
---
Body text
`;
      const tags = TagService.extractTags(content);
      assert.deepStrictEqual(tags, ['architecture', 'design']);
    });

    it('should ignore Markdown headers and not treat them as tags', () => {
      const content = '# Heading 1\n## Heading 2\n### Heading 3\n\nSome normal text #realtag';
      const tags = TagService.extractTags(content);
      assert.deepStrictEqual(tags, ['realtag']);
    });

    it('should ignore hashtags inside code blocks', () => {
      const content = `
# Real Title
Here is a tag: #valid

\`\`\`bash
# This is a bash comment
echo #notatag
\`\`\`

Inline \`#alsoNotATag\` code snippet.
`;
      const tags = TagService.extractTags(content);
      assert.deepStrictEqual(tags, ['valid']);
    });
  });

  describe('groupNotesByTag and getTagCounts', () => {
    const dummyNotes: NoteItem[] = [
      {
        id: '1',
        title: 'Note 1',
        uri: vscode.Uri.file('/note1.md'),
        relativePath: 'note1.md',
        folder: '',
        filename: 'note1.md',
        scope: 'workspace',
        ctime: 100,
        mtime: 100,
        size: 50,
        tags: ['work', 'urgent'],
      },
      {
        id: '2',
        title: 'Note 2',
        uri: vscode.Uri.file('/note2.md'),
        relativePath: 'note2.md',
        folder: '',
        filename: 'note2.md',
        scope: 'workspace',
        ctime: 100,
        mtime: 100,
        size: 50,
        tags: ['work', 'ideas'],
      },
    ];

    it('should group notes by tag', () => {
      const groups = TagService.groupNotesByTag(dummyNotes);
      assert.strictEqual(groups.get('work')?.length, 2);
      assert.strictEqual(groups.get('urgent')?.length, 1);
      assert.strictEqual(groups.get('ideas')?.length, 1);
    });

    it('should get tag counts sorted by count descending', () => {
      const counts = TagService.getTagCounts(dummyNotes);
      assert.deepStrictEqual(counts, [
        { tag: 'work', count: 2 },
        { tag: 'ideas', count: 1 },
        { tag: 'urgent', count: 1 },
      ]);
    });
  });
});
