import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useSay } from './say';

// [bumex-one] A description typed as in a word processor (asked on 2026-10-28): bold, italic, a heading, bullet and
// numbered lists, check boxes and links, seen as they will read, with the usual shortcuts (Ctrl/⌘ B, I). What it keeps
// is the light text the ticket page reads (markdown.tsx: ## heading, - list, 1. list, - [ ] box, **bold**, *italic*,
// [link](https://…)), so a description reads the same everywhere. Pasted text comes in plain. Ctrl/⌘ Enter submits.

const SAFE_URL = /^(https?:\/\/|mailto:)/i;
const BOX = '☐ ';
const TICKED = '☑ ';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// the light text's inline marks, as HTML (the text escaped first: whatever HTML it holds stays text)
function inlineHtml(text: string): string {
  return escape(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label: string, url: string) => (SAFE_URL.test(url.replace(/&amp;/g, '&')) ? `<a href="${url}">${label}</a>` : whole))
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>');
}

/** The light text as the editor shows it: one block per line, blank lines kept. */
export function toHtml(source: string): string {
  const out: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
  const flush = () => { if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${i || '<br>'}</li>`).join('')}</${list.tag}>`); list = null; };
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const heading = /^#{1,3}\s+(.+)$/.exec(line);
    const bullet = /^\s*[-*•]\s+(?:\[( |x|X)\]\s+)?(.*)$/.exec(line);
    const number = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet) {
      if (list?.tag !== 'ul') { flush(); list = { tag: 'ul', items: [] }; }
      list.items.push((bullet[1] === undefined ? '' : bullet[1] === ' ' ? BOX : TICKED) + inlineHtml(bullet[2]));
      continue;
    }
    if (number) {
      if (list?.tag !== 'ol') { flush(); list = { tag: 'ol', items: [] }; }
      list.items.push(inlineHtml(number[1]));
      continue;
    }
    flush();
    if (heading) out.push(`<h3>${inlineHtml(heading[1])}</h3>`);
    else out.push(`<div>${line ? inlineHtml(line) : '<br>'}</div>`);
  }
  flush();
  return out.join('');
}

// what the editor holds, back to the light text
function inlineText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/ /g, ' ');
  if (!(node instanceof HTMLElement)) return '';
  const inner = () => [...node.childNodes].map(inlineText).join('');
  const tag = node.tagName.toLowerCase();
  if (tag === 'br') return '\n';
  const text = inner();
  if (!text.trim()) return text;
  if (tag === 'b' || tag === 'strong' || node.style.fontWeight === 'bold' || Number(node.style.fontWeight) >= 600) return `**${text}**`;
  if (tag === 'i' || tag === 'em' || node.style.fontStyle === 'italic') return `*${text}*`;
  if (tag === 'code') return `\`${text}\``;
  if (tag === 'a') { const href = node.getAttribute('href') ?? ''; return SAFE_URL.test(href) ? `[${text}](${href})` : text; }
  return text;
}
const BLOCKS = new Set(['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre']);
const isBlock = (n: Node) => n instanceof HTMLElement && BLOCKS.has(n.tagName.toLowerCase());

export function toText(root: HTMLElement): string {
  const lines: string[] = [];
  let current = '';
  let open = false;
  const push = (line: string) => lines.push(...line.split('\n').map((l) => l.trimEnd()));
  const flush = () => { if (open) push(current); current = ''; open = false; };
  const walk = (parent: Node) => {
    for (const node of [...parent.childNodes]) {
      if (!isBlock(node)) {
        if (node instanceof HTMLElement && node.tagName === 'BR') { if (!open) lines.push(''); flush(); continue; }
        current += inlineText(node);
        open = true;
        continue;
      }
      flush();
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) push(`## ${inlineText(el).trim()}`);
      else if (tag === 'ul' || tag === 'ol') {
        [...el.children].forEach((li, i) => {
          const text = [...li.childNodes].filter((n) => !isBlock(n)).map(inlineText).join('').trim();
          if (tag === 'ol') push(`${i + 1}. ${text}`);
          else if (text.startsWith(BOX.trim())) push(`- [ ] ${text.slice(1).trim()}`);
          else if (text.startsWith(TICKED.trim())) push(`- [x] ${text.slice(1).trim()}`);
          else push(`- ${text}`);
        });
      } else if ([...el.childNodes].some(isBlock)) walk(el);
      else push(inlineText(el));
    }
  };
  walk(root);
  flush();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.join('\n');
}

const run = (command: string, value?: string) => document.execCommand(command, false, value);

// a button of the bar: pressed without taking the focus (the text keeps its selection)
function Tool({ label, title, onPress, className = '' }: { label: string; title: string; onPress: () => void; className?: string }) {
  return <button type="button" className={`rt-tool ${className}`} title={title} aria-label={title} onMouseDown={(e) => { e.preventDefault(); onPress(); }}>{label}</button>;
}

export function RichText({ value, onChange, onSubmit, placeholder, autoFocus, label, minHeight = 96 }: {
  value: string; onChange: (text: string) => void; onSubmit?: () => void; placeholder?: string; autoFocus?: boolean; label?: string; minHeight?: number;
}) {
  const say = useSay();
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<string | null>(null);
  const [empty, setEmpty] = useState(!value);

  // the text set from outside (the form reset, the saved description): shown anew; what was typed here stays as is
  useEffect(() => {
    const el = ref.current;
    if (!el || value === last.current) return;
    el.innerHTML = toHtml(value);
    last.current = value;
    setEmpty(!value);
  }, [value]);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);

  const changed = () => {
    const el = ref.current;
    if (!el) return;
    const text = toText(el);
    last.current = text;
    setEmpty(!text && !el.querySelector('li'));
    onChange(text);
  };
  const act = (fn: () => void) => { ref.current?.focus(); fn(); changed(); };
  const heading = () => act(() => run('formatBlock', document.queryCommandValue('formatBlock').toLowerCase() === 'h3' ? 'div' : 'h3'));
  const checklist = () => act(() => {
    if (!document.queryCommandState('insertUnorderedList')) run('insertUnorderedList');
    run('insertText', BOX);
  });
  const link = () => {
    const url = window.prompt(say('Adresse du lien (https://…)', 'Link address (https://…)'), 'https://');
    if (url && SAFE_URL.test(url)) act(() => run('createLink', url));
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSubmit?.(); return; }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === 'b' || e.key === 'i')) { e.preventDefault(); act(() => run(e.key === 'b' ? 'bold' : 'italic')); return; }
    // a check box line goes on as a check box
    if (e.key === 'Enter' && !e.shiftKey) {
      const li = window.getSelection()?.anchorNode?.parentElement?.closest('li');
      if (li && (li.textContent ?? '').startsWith(BOX.trim()) && (li.textContent ?? '').trim().length > 1) window.setTimeout(() => { run('insertText', BOX); changed(); }, 0);
    }
  };

  return (
    <div className="rt">
      <div className="rt-bar" role="toolbar" aria-label={say('Mise en forme', 'Formatting')}>
        <Tool label="B" className="b" title={say('Gras (Ctrl/⌘ B)', 'Bold (Ctrl/⌘ B)')} onPress={() => act(() => run('bold'))} />
        <Tool label="I" className="i" title={say('Italique (Ctrl/⌘ I)', 'Italic (Ctrl/⌘ I)')} onPress={() => act(() => run('italic'))} />
        <Tool label="T" className="h" title={say('Titre', 'Heading')} onPress={heading} />
        <span className="rt-sep" />
        <Tool label="•" title={say('Liste à puces', 'Bullet list')} onPress={() => act(() => run('insertUnorderedList'))} />
        <Tool label="1." title={say('Liste numérotée', 'Numbered list')} onPress={() => act(() => run('insertOrderedList'))} />
        <Tool label="☐" title={say('Liste de cases à cocher', 'Check list')} onPress={checklist} />
        <span className="rt-sep" />
        <Tool label="🔗" title={say('Lien', 'Link')} onPress={link} />
      </div>
      <div ref={ref} className={`rt-area md ${empty ? 'empty' : ''}`} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={label ?? 'Description'}
        data-placeholder={placeholder ?? say('Décrivez ce qu’il faut faire…', 'Describe what to do…')} style={{ minHeight }}
        onInput={changed} onKeyDown={key}
        onPaste={(e) => { e.preventDefault(); run('insertText', e.clipboardData.getData('text/plain')); changed(); }} />
    </div>
  );
}
