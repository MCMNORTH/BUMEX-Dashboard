import { Fragment, type ReactNode } from 'react';

// [bumex-one] A ticket's description written lightly, read like Jira's (vanguard/one/Ticket.tsx): headings (#, ##,
// ###), lists (-, *, 1.), check boxes (- [ ] / - [x]), **bold**, *italic*, `code`, [links](https://…) and bare
// addresses. React elements only: whatever HTML the text holds stays text.

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  // code first, then links, bold, italic, bare addresses
  const pattern = /(`[^`]+`)|(\[[^\]]+\]\([^)\s]+\))|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(https?:\/\/[^\s)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = pattern.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    const [whole] = m;
    if (m[1]) out.push(<code key={k}>{whole.slice(1, -1)}</code>);
    else if (m[2]) {
      const [, label, url] = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(whole)!;
      out.push(SAFE_URL.test(url) ? <a key={k} href={url} target="_blank" rel="noreferrer">{inline(label, k)}</a> : whole);
    } else if (m[3]) out.push(<strong key={k}>{inline(whole.slice(2, -2), k)}</strong>);
    else if (m[4]) out.push(<em key={k}>{inline(whole.slice(1, -1), k)}</em>);
    else if (m[5]) out.push(<a key={k} href={whole} target="_blank" rel="noreferrer">{whole}</a>);
    last = m.index + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: 'h'; level: 1 | 2 | 3; text: string }
  | { kind: 'ul' | 'ol'; items: { text: string; check: boolean | null }[] }
  | { kind: 'p'; lines: string[] };

export function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const last = blocks[blocks.length - 1];
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const bullet = /^\s*[-*•]\s+(?:\[( |x|X)\]\s+)?(.*)$/.exec(line);
    const number = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) blocks.push({ kind: 'p', lines: [] });
    else if (heading) blocks.push({ kind: 'h', level: heading[1].length as 1 | 2 | 3, text: heading[2] });
    else if (bullet) {
      const item = { text: bullet[2], check: bullet[1] === undefined ? null : bullet[1] !== ' ' };
      if (last?.kind === 'ul') last.items.push(item);
      else blocks.push({ kind: 'ul', items: [item] });
    } else if (number) {
      if (last?.kind === 'ol') last.items.push({ text: number[1], check: null });
      else blocks.push({ kind: 'ol', items: [{ text: number[1], check: null }] });
    } else if (last?.kind === 'p') last.lines.push(line);
    else blocks.push({ kind: 'p', lines: [line] });
  }
  return blocks.filter((b) => b.kind !== 'p' || b.lines.length > 0);
}

export function Markdown({ source }: { source: string }) {
  return (
    <div className="md">
      {parseBlocks(source).map((block, b) => {
        const key = `b${b}`;
        if (block.kind === 'h') {
          const Tag = (['h3', 'h4', 'h5'] as const)[block.level - 1];
          return <Tag key={key}>{inline(block.text, key)}</Tag>;
        }
        if (block.kind === 'ul' || block.kind === 'ol') {
          const List = block.kind;
          return (
            <List key={key} className={block.items.some((i) => i.check !== null) ? 'checks' : undefined}>
              {block.items.map((item, i) => (
                <li key={i}>{item.check !== null && <input type="checkbox" checked={item.check} readOnly tabIndex={-1} aria-label={item.text} />}{inline(item.text, `${key}-${i}`)}</li>
              ))}
            </List>
          );
        }
        if (block.kind !== 'p') return null;
        return <p key={key}>{block.lines.map((line, i) => <Fragment key={i}>{i > 0 && <br />}{inline(line, `${key}-${i}`)}</Fragment>)}</p>;
      })}
    </div>
  );
}
