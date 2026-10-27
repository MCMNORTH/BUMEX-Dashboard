import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Markdown, parseBlocks } from '../markdown';

const html = (source: string) => renderToStaticMarkup(createElement(Markdown, { source }));

describe('markdown', () => {
  it('reads headings, lists, check boxes and paragraphs', () => {
    expect(parseBlocks('## Contexte\nUne ligne\nla suite\n\n- un\n- [x] fait\n1. premier').map((b) => b.kind)).toEqual(['h', 'p', 'ul', 'ol']);
    const out = html('# Titre\n- [ ] à faire\n- [x] fait');
    expect(out).toContain('<h3>Titre</h3>');
    expect(out).toContain('<ul class="checks">');
    expect(out).toContain('checked=""');
  });

  it('writes bold, italic, code and links', () => {
    const out = html('**gras** et *italique*, `code` [lien](https://bumex.mr) https://exemple.mr');
    expect(out).toContain('<strong>gras</strong>');
    expect(out).toContain('<em>italique</em>');
    expect(out).toContain('<code>code</code>');
    expect(out).toContain('<a href="https://bumex.mr" target="_blank" rel="noreferrer">lien</a>');
    expect(out).toContain('<a href="https://exemple.mr"');
  });

  it('keeps HTML and unsafe links as text', () => {
    const out = html('<img src=x onerror=alert(1)> [x](javascript:alert(1))');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
    expect(out).not.toContain('href="javascript');
  });
});
