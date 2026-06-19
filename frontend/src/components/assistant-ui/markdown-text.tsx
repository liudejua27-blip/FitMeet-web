import { MessagePartPrimitive } from '@assistant-ui/react';
import { Check, Copy } from 'lucide-react';
import { forwardRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';

import { cn } from '../../lib/utils';

type MarkdownTextPartProps = {
  role: 'assistant' | 'user' | 'system';
};

type MarkdownBlock =
  | { type: 'code'; language?: string; content: string }
  | { type: 'heading'; level: 1 | 2 | 3; content: string }
  | { type: 'hr' }
  | { type: 'quote'; lines: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'list'; ordered: boolean; items: MarkdownListItem[] }
  | { type: 'paragraph'; lines: string[] };

type MarkdownListItem = {
  content: string;
  checked?: boolean;
};

export function MarkdownTextPart({ role }: MarkdownTextPartProps) {
  if (role !== 'assistant') {
    return (
      <MessagePartPrimitive.Text
        smooth={false}
        component={PlainTextPart}
      />
    );
  }

  return (
    <MessagePartPrimitive.Text
      smooth
      component={SmoothMarkdownTextPart}
    />
  );
}

export function MarkdownText({ text }: { text: string }) {
  const blocks = parseMarkdownBlocks(text);
  if (blocks.length === 0) return null;

  return (
    <div className="space-y-2.5" data-testid="assistant-ui-markdown">
      {blocks.map((block, index) => (
        <MarkdownBlockRenderer block={block} key={`${block.type}-${index}`} />
      ))}
    </div>
  );
}

const PlainTextPart = forwardRef<HTMLSpanElement, ComponentPropsWithoutRef<'span'>>(
  function PlainTextPart({ children, className, ...props }, ref) {
    return (
      <span
        {...props}
        ref={ref}
        className={cn('whitespace-pre-wrap', className)}
      >
        {children}
      </span>
    );
  },
);

const SmoothMarkdownTextPart = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
  function SmoothMarkdownTextPart({ children, ...props }, ref) {
    return (
      <div {...props} ref={ref}>
        <MarkdownText text={textFromChildren(children)} />
      </div>
    );
  },
);

function textFromChildren(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(textFromChildren).join('');
  return '';
}

function MarkdownBlockRenderer({ block }: { block: MarkdownBlock }) {
  if (block.type === 'code') {
    return <CodeBlock code={block.content} language={block.language} />;
  }

  if (block.type === 'heading') {
    const className = cn(
      'font-semibold tracking-normal text-[#0d0d0d]',
      block.level === 1 && 'mt-1 text-[1.15rem] leading-7',
      block.level === 2 && 'mt-1 text-[1.05rem] leading-7',
      block.level === 3 && 'text-[0.98rem] leading-6',
    );
    if (block.level === 1) return <h2 className={className}>{renderInline(block.content)}</h2>;
    if (block.level === 2) return <h3 className={className}>{renderInline(block.content)}</h3>;
    return <h4 className={className}>{renderInline(block.content)}</h4>;
  }

  if (block.type === 'quote') {
    return (
      <blockquote className="border-l-2 border-black/15 pl-3 text-[#52525b]">
        {block.lines.map((line, index) => (
          <p className="my-0 leading-7" key={`${line}-${index}`}>
            {renderInline(line)}
          </p>
        ))}
      </blockquote>
    );
  }

  if (block.type === 'table') {
    return (
      <div className="not-prose overflow-x-auto rounded-2xl border border-black/10 bg-white">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-[#f7f7f8] text-[#52525b]">
            <tr>
              {block.headers.map((header, index) => (
                <th
                  className="border-b border-black/10 px-3 py-2 text-xs font-medium"
                  key={`${header}-${index}`}
                  scope="col"
                >
                  {renderInline(header)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.06] text-[#27272a]">
            {block.rows.map((row, rowIndex) => (
              <tr className="align-top" key={rowIndex}>
                {block.headers.map((_, cellIndex) => (
                  <td className="px-3 py-2 leading-6" key={cellIndex}>
                    {renderInline(row[cellIndex] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (block.type === 'list') {
    const ListTag = block.ordered ? 'ol' : 'ul';
    const isTaskList = !block.ordered && block.items.some((item) => item.checked !== undefined);
    return (
      <ListTag
        className={cn(
          'my-0 space-y-1 pl-5 leading-7',
          block.ordered ? 'list-decimal' : isTaskList ? 'list-none pl-0' : 'list-disc',
        )}
      >
        {block.items.map((item, index) => (
          <li
            className={cn(
              'pl-1',
              item.checked !== undefined && 'flex items-start gap-2 pl-0 text-[#27272a]',
            )}
            key={`${item.content}-${index}`}
          >
            {item.checked !== undefined ? (
              <input
                type="checkbox"
                checked={item.checked}
                readOnly
                tabIndex={-1}
                aria-label={item.checked ? '已完成' : '未完成'}
                className="mt-[0.48rem] h-4 w-4 shrink-0 rounded border-black/20 accent-black"
              />
            ) : null}
            <span className={cn(item.checked && 'text-[#52525b]')}>{renderInline(item.content)}</span>
          </li>
        ))}
      </ListTag>
    );
  }

  if (block.type === 'hr') {
    return <hr className="my-4 border-black/10" />;
  }

  return (
    <p className="my-0 leading-7">
      {block.lines.map((line, index) => (
        <span key={`${line}-${index}`}>
          {index > 0 ? <br /> : null}
          {renderInline(line)}
        </span>
      ))}
    </p>
  );
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const trimmedLanguage = language?.trim();

  const handleCopy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard is unavailable');
      await navigator.clipboard.writeText(code);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1400);
    } catch {
      setCopyState('failed');
      window.setTimeout(() => setCopyState('idle'), 1800);
    }
  };
  const label =
    copyState === 'copied' ? '代码已复制' : copyState === 'failed' ? '复制失败' : '复制代码';

  return (
    <figure className="not-prose overflow-hidden rounded-2xl border border-black/10 bg-[#0d0d0d] text-[#f4f4f5] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <figcaption className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-xs text-white/60">
        <span>{trimmedLanguage || 'code'}</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          onClick={handleCopy}
          aria-label={label}
          aria-live="polite"
          title={label}
        >
          {copyState === 'copied' ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {copyState === 'copied' ? '已复制' : copyState === 'failed' ? '失败' : '复制'}
        </button>
      </figcaption>
      <pre className="m-0 overflow-x-auto p-3 text-[13px] leading-6">
        <code>{code}</code>
      </pre>
    </figure>
  );
}

function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const lines = normalizeFenceBoundaries(text).replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const fence = parseFenceStart(trimmed);
    if (fence) {
      const codeLines: string[] = fence.firstCodeLine ? [fence.firstCodeLine] : [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? '').trim().startsWith('```')) {
        codeLines.push(lines[index] ?? '');
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({
        type: 'code',
        language: fence.language,
        content: codeLines.join('\n'),
      });
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3,
        content: headingMatch[2],
      });
      index += 1;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (index < lines.length && (lines[index] ?? '').trim().startsWith('>')) {
        quoteLines.push((lines[index] ?? '').trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push({ type: 'quote', lines: quoteLines });
      continue;
    }

    if (isMarkdownTableStart(lines, index)) {
      const tableLines: string[] = [];
      while (index < lines.length && isTableLine(lines[index] ?? '')) {
        tableLines.push(lines[index] ?? '');
        index += 1;
      }
      const table = parseMarkdownTable(tableLines);
      if (table) {
        blocks.push(table);
        continue;
      }
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      index += 1;
      continue;
    }

    const listMatch = trimmed.match(/^((?:[-*+])|\d+\.)\s+(.+)$/);
    if (listMatch) {
      const ordered = /^\d+\.$/.test(listMatch[1]);
      const items: MarkdownListItem[] = [];
      while (index < lines.length) {
        const current = (lines[index] ?? '').trim();
        const currentMatch = current.match(/^((?:[-*+])|\d+\.)\s+(.+)$/);
        if (!currentMatch || /^\d+\.$/.test(currentMatch[1]) !== ordered) break;
        items.push(parseListItem(currentMatch[2]));
        index += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? '';
      const currentTrimmed = current.trim();
      if (!currentTrimmed) break;
      if (
        currentTrimmed.startsWith('```') ||
        currentTrimmed.startsWith('>') ||
        isMarkdownTableStart(lines, index) ||
        /^(-{3,}|\*{3,}|_{3,})$/.test(currentTrimmed) ||
        currentTrimmed.match(/^(#{1,3})\s+(.+)$/) ||
        currentTrimmed.match(/^((?:[-*+])|\d+\.)\s+(.+)$/)
      ) {
        break;
      }
      paragraphLines.push(current);
      index += 1;
    }
    blocks.push({ type: 'paragraph', lines: paragraphLines });
  }

  return blocks;
}

function parseListItem(content: string): MarkdownListItem {
  const taskMatch = content.match(/^\[( |x|X)\]\s+(.+)$/);
  if (!taskMatch) return { content };
  return {
    content: taskMatch[2],
    checked: taskMatch[1].toLowerCase() === 'x',
  };
}

function normalizeFenceBoundaries(text: string): string {
  const knownLanguages = [
    'typescript',
    'javascript',
    'python',
    'json',
    'tsx',
    'jsx',
    'bash',
    'shell',
    'sql',
    'css',
    'html',
    'ts',
    'js',
    'py',
    'sh',
  ].join('|');

  return text
    .replace(
      new RegExp(`([^\\n])\`\`\`(${knownLanguages})`, 'g'),
      '$1\n```$2',
    )
    .replace(new RegExp(`\`\`\`(${knownLanguages})(?=[^\\s\\n\`])`, 'g'), '```$1\n');
}

function isMarkdownTableStart(lines: string[], index: number) {
  const current = lines[index] ?? '';
  const next = lines[index + 1] ?? '';
  return isTableLine(current) && isTableSeparatorLine(next);
}

function isTableLine(line: string) {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.slice(1, -1).includes('|');
}

function isTableSeparatorLine(line: string) {
  if (!isTableLine(line)) return false;
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function parseMarkdownTable(tableLines: string[]): Extract<MarkdownBlock, { type: 'table' }> | null {
  if (tableLines.length < 2 || !isTableSeparatorLine(tableLines[1])) return null;
  const headers = splitTableRow(tableLines[0]);
  if (headers.length === 0) return null;
  const rows = tableLines
    .slice(2)
    .filter((line) => isTableLine(line) && !isTableSeparatorLine(line))
    .map((line) => splitTableRow(line));
  return { type: 'table', headers, rows };
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function parseFenceStart(
  trimmed: string,
): { language?: string; firstCodeLine?: string } | null {
  const fullFence = trimmed.match(/^```([\w-]+)?\s*$/);
  if (fullFence) {
    return { language: fullFence[1] };
  }

  if (!trimmed.startsWith('```')) return null;

  const afterFence = trimmed.slice(3);
  const knownLanguages = [
    'typescript',
    'javascript',
    'python',
    'json',
    'tsx',
    'jsx',
    'bash',
    'shell',
    'sql',
    'css',
    'html',
    'ts',
    'js',
    'py',
    'sh',
  ];
  const language = knownLanguages.find(
    (candidate) => afterFence.startsWith(candidate) && afterFence.length > candidate.length,
  );

  if (!language) return null;

  return {
    language,
    firstCodeLine: afterFence.slice(language.length).trimStart(),
  };
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const tokenPattern =
    /(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|https?:\/\/[^\s<>()]+|mailto:[^\s<>()]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('[')) {
      const link = parseInlineLink(token);
      if (link) {
        nodes.push(
          <a
            className="font-medium text-[#0d0d0d] underline decoration-black/25 underline-offset-4 transition hover:decoration-black/70"
            href={link.href}
            key={`link-${match.index}`}
            rel={link.external ? 'noreferrer noopener' : undefined}
            target={link.external ? '_blank' : undefined}
          >
            {link.label}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    } else if (token.startsWith('`')) {
      nodes.push(
        <code
          className="rounded-md bg-black/[0.06] px-1 py-0.5 font-mono text-[0.92em] text-[#27272a]"
          key={`code-${match.index}`}
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      nodes.push(
        <strong className="font-semibold text-[#0d0d0d]" key={`strong-${match.index}`}>
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      const link = parseAutoLink(token);
      if (link) {
        nodes.push(
          <span key={`auto-link-${match.index}`}>
            <a
              className="font-medium text-[#0d0d0d] underline decoration-black/25 underline-offset-4 transition hover:decoration-black/70"
              href={link.href}
              rel={link.external ? 'noreferrer noopener' : undefined}
              target={link.external ? '_blank' : undefined}
            >
              {link.label}
            </a>
            {link.trailing}
          </span>,
        );
      } else {
        nodes.push(token);
      }
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function parseAutoLink(token: string): {
  label: string;
  href: string;
  external: boolean;
  trailing: string;
} | null {
  const trailing = token.match(/[.,!?;:，。！？；：]+$/)?.[0] ?? '';
  const href = trailing ? token.slice(0, -trailing.length) : token;
  if (!isSafeHref(href)) return null;
  return {
    label: href,
    href,
    external: /^https?:\/\//i.test(href),
    trailing,
  };
}

function parseInlineLink(token: string): { label: string; href: string; external: boolean } | null {
  const match = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (!match) return null;
  const label = match[1].trim();
  const href = match[2].trim();
  if (!label || !isSafeHref(href)) return null;
  return {
    label,
    href,
    external: /^https?:\/\//i.test(href),
  };
}

function isSafeHref(href: string) {
  if (href.startsWith('/') || href.startsWith('#')) return true;
  return /^(https?:|mailto:)/i.test(href);
}
