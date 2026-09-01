import * as assert from 'assert';
import { renderTemplate } from '../../src/utils/template-utils';

describe('TemplateUtils', () => {
  it('should interpolate ${title}, ${date}, ${time}, ${datetime}', () => {
    const template = '# ${title}\nCreated on ${date} at ${time} (${datetime})';
    const rendered = renderTemplate(template, {
      title: 'Design Doc',
      date: '2026-09-02',
      time: '12:00:00',
      datetime: '2026-09-02 12:00:00',
    });

    assert.strictEqual(
      rendered,
      '# Design Doc\nCreated on 2026-09-02 at 12:00:00 (2026-09-02 12:00:00)'
    );
  });

  it('should interpolate custom variables', () => {
    const template = 'Author: ${author}, Project: ${project}';
    const rendered = renderTemplate(template, {
      title: 'Title',
      author: 'Rashed',
      project: 'SidebarNotes',
    });

    assert.strictEqual(rendered, 'Author: Rashed, Project: SidebarNotes');
  });

  it('should leave unknown variables untouched', () => {
    const template = 'Hello ${unknownVar}';
    const rendered = renderTemplate(template, { title: 'Test' });
    assert.strictEqual(rendered, 'Hello ${unknownVar}');
  });
});
