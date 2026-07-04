import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import taskLists from 'markdown-it-task-lists';
import footnote from 'markdown-it-footnote';
import hljs from 'highlight.js/lib/core';
import type { LanguageFn } from 'highlight.js';
import hljsBash from 'highlight.js/lib/languages/bash';
import hljsC from 'highlight.js/lib/languages/c';
import hljsCpp from 'highlight.js/lib/languages/cpp';
import hljsCsharp from 'highlight.js/lib/languages/csharp';
import hljsCss from 'highlight.js/lib/languages/css';
import hljsDiff from 'highlight.js/lib/languages/diff';
import hljsDockerfile from 'highlight.js/lib/languages/dockerfile';
import hljsGo from 'highlight.js/lib/languages/go';
import hljsGraphql from 'highlight.js/lib/languages/graphql';
import hljsIni from 'highlight.js/lib/languages/ini';
import hljsJava from 'highlight.js/lib/languages/java';
import hljsJavascript from 'highlight.js/lib/languages/javascript';
import hljsJson from 'highlight.js/lib/languages/json';
import hljsLess from 'highlight.js/lib/languages/less';
import hljsMarkdown from 'highlight.js/lib/languages/markdown';
import hljsPhp from 'highlight.js/lib/languages/php';
import hljsPlaintext from 'highlight.js/lib/languages/plaintext';
import hljsPython from 'highlight.js/lib/languages/python';
import hljsRuby from 'highlight.js/lib/languages/ruby';
import hljsRust from 'highlight.js/lib/languages/rust';
import hljsScss from 'highlight.js/lib/languages/scss';
import hljsSql from 'highlight.js/lib/languages/sql';
import hljsTypescript from 'highlight.js/lib/languages/typescript';
import hljsXml from 'highlight.js/lib/languages/xml';
import hljsYaml from 'highlight.js/lib/languages/yaml';
import type { RenderedDoc, TocItem } from '../../types';
import { sanitizeHtml } from './sanitize';

type Token = ReturnType<MarkdownIt['parse']>[number];

// Langages courants « web/data » enregistrés pour la coloration syntaxique.
// L'auto-détection (highlightAuto) ne portera que sur ce sous-ensemble.
const HLJS_LANGUAGES: Record<string, LanguageFn> = {
  bash: hljsBash,
  c: hljsC,
  cpp: hljsCpp,
  csharp: hljsCsharp,
  css: hljsCss,
  diff: hljsDiff,
  dockerfile: hljsDockerfile,
  go: hljsGo,
  graphql: hljsGraphql,
  ini: hljsIni,
  java: hljsJava,
  javascript: hljsJavascript,
  json: hljsJson,
  less: hljsLess,
  markdown: hljsMarkdown,
  php: hljsPhp,
  plaintext: hljsPlaintext,
  python: hljsPython,
  ruby: hljsRuby,
  rust: hljsRust,
  scss: hljsScss,
  sql: hljsSql,
  typescript: hljsTypescript,
  xml: hljsXml,
  yaml: hljsYaml,
};

let hljsRegistered = false;

function getHighlighter(): typeof hljs {
  if (!hljsRegistered) {
    for (const [name, language] of Object.entries(HLJS_LANGUAGES)) {
      hljs.registerLanguage(name, language);
    }
    hljsRegistered = true;
  }
  return hljs;
}

// Blocs racine porteurs de data-line (SPEC §5) : uniquement au niveau 0
// (jamais un paragraphe imbriqué dans une liste ou une citation).
//
// `html_block` : du HTML brut embarqué directement dans le Markdown (ex. un
// <blockquote> ou <div> écrit à la main plutôt qu'avec la syntaxe native).
// Son rendu par défaut de markdown-it ignore totalement `token.attrSet` (le
// renderer se contente de recopier `token.content` tel quel) — le poser ici
// ne suffit PAS à lui seul : `markHtmlBlockRenderer` ci-dessous l'enveloppe
// explicitement dans un conteneur porteur de `data-line`. Sans ce cas, tout
// bloc HTML brut est invisible à l'ancrage (ni pilule de sélection, ni
// raccourci « c », ni bouton de la gouttière ne le détectent).
const ROOT_BLOCK_TYPES = new Set([
  'paragraph_open',
  'heading_open',
  'table_open',
  'code_block',
  'blockquote_open',
  'bullet_list_open',
  'ordered_list_open',
  'hr',
  'html_block',
]);

function slugify(text: string): string {
  const ascii = text
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return ascii || 'section';
}

function markDataLine(md: MarkdownIt): void {
  md.core.ruler.push('pulse_data_line', (state) => {
    for (const token of state.tokens) {
      if (token.level === 0 && token.map && ROOT_BLOCK_TYPES.has(token.type)) {
        token.attrSet('data-line', String(token.map[0]));
      }
    }
  });
}

function markExternalLinks(md: MarkdownIt): void {
  const renderDefault =
    md.renderer.rules.link_open ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const href = token.attrGet('href');
    if (href && /^https?:\/\//i.test(href)) {
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener noreferrer');
    }
    return renderDefault(tokens, idx, options, env, self);
  };
}

/**
 * Enveloppe chaque bloc HTML brut racine (`html_block`, niveau 0) dans un
 * conteneur porteur de `data-line` — le renderer par défaut de markdown-it
 * pour ce type de token se contente de recopier `token.content` verbatim et
 * ignore tout attribut posé via `attrSet`. Sans cette enveloppe, du HTML écrit
 * à la main dans le Markdown (ex. `<blockquote>…</blockquote>`) rendrait
 * visuellement à l'identique d'un bloc natif mais resterait invisible à
 * l'ancrage des commentaires (COMMENT-SPEC §3). Un bloc imbriqué (niveau > 0,
 * ex. HTML brut à l'intérieur d'une liste) n'est PAS enveloppé : comme pour
 * les autres types, seul le bloc racine englobant porte `data-line`.
 */
function markHtmlBlockRenderer(md: MarkdownIt): void {
  md.renderer.rules.html_block = (tokens, idx) => {
    const token = tokens[idx];
    if (token.level !== 0 || !token.map) return token.content;
    return `<div class="pulse-html-block" data-line="${token.map[0]}">${token.content}</div>`;
  };
}

function markFenceRenderer(md: MarkdownIt): void {
  const highlighter = getHighlighter();

  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : '';
    const langName = (info.split(/\s+/)[0] ?? '').toLowerCase();
    const dataLine = token.map ? ` data-line="${token.map[0]}"` : '';

    if (langName === 'mermaid') {
      // encodeURIComponent plutôt qu'un simple échappement HTML : la syntaxe
      // mermaid regorge de séquences "-->" que DOMPurify neutralise (risque
      // de mXSS par évasion de commentaire) si elles survivent telles
      // quelles, même échappées en &gt;, dans un attribut. Le pourcentage-
      // encodage reste réversible sans jamais produire de caractère sensible.
      const graphSource = encodeURIComponent(token.content.trim());
      return `<pre class="mermaid-src"${dataLine} data-graph="${graphSource}"></pre>\n`;
    }

    let highlightedCode: string;
    let resolvedLang = '';

    if (langName && highlighter.getLanguage(langName)) {
      resolvedLang = langName;
      try {
        highlightedCode = highlighter.highlight(token.content, {
          language: langName,
          ignoreIllegals: true,
        }).value;
      } catch {
        highlightedCode = md.utils.escapeHtml(token.content);
        resolvedLang = '';
      }
    } else if (langName) {
      // Fallback auto : langue déclarée mais non reconnue.
      try {
        const auto = highlighter.highlightAuto(token.content);
        highlightedCode = auto.value;
        resolvedLang = auto.language ?? '';
      } catch {
        highlightedCode = md.utils.escapeHtml(token.content);
      }
    } else {
      highlightedCode = md.utils.escapeHtml(token.content);
    }

    const langClass = resolvedLang ? ` language-${resolvedLang}` : '';
    const langLabel = langName ? ` data-lang="${md.utils.escapeHtml(langName)}"` : '';
    return `<pre${dataLine}${langLabel}><code class="hljs${langClass}">${highlightedCode}</code></pre>\n`;
  };
}

function createMarkdownIt(): MarkdownIt {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: false,
  });

  md.use(anchor, { slugify, tabIndex: false });
  md.use(taskLists, { enabled: false });
  md.use(footnote);

  markDataLine(md);
  markExternalLinks(md);
  markFenceRenderer(md);
  markHtmlBlockRenderer(md);

  return md;
}

let sharedMarkdownIt: MarkdownIt | null = null;

function getMarkdownIt(): MarkdownIt {
  if (!sharedMarkdownIt) {
    sharedMarkdownIt = createMarkdownIt();
  }
  return sharedMarkdownIt;
}

// Types de tokens racine porteurs de data-line dans le HTML rendu : les
// mêmes que ROOT_BLOCK_TYPES, plus `fence` (posé par un renderer dédié,
// voir markFenceRenderer). Exposé pour que `core/comments/parser` calcule
// exactement les mêmes frontières de blocs racine que le rendu — une liste
// loose (items séparés par une ligne vide) ou une liste ordonnée doit rester
// un seul bloc, jamais scindée (COMMENT-SPEC §3).
const ROOT_BLOCK_RANGE_TYPES = new Set([...ROOT_BLOCK_TYPES, 'fence']);

export interface RootBlockRange {
  start: number; // inclusif
  end: number; // exclusif
}

/**
 * Calcule les frontières des blocs racine d'un contenu Markdown (sans
 * marqueurs de commentaires) en réutilisant la même tokenisation que
 * `renderMarkdown` — garantit que le parseur de commentaires et le rendu
 * s'accordent sur les mêmes blocs.
 */
export function getRootBlockRanges(content: string): RootBlockRange[] {
  const md = getMarkdownIt();
  const tokens = md.parse(content, {});
  const ranges: RootBlockRange[] = [];
  for (const token of tokens) {
    if (token.level === 0 && token.map && ROOT_BLOCK_RANGE_TYPES.has(token.type)) {
      ranges.push({ start: token.map[0], end: token.map[1] });
    }
  }
  return ranges;
}

function headingText(children: Token[] | null): string {
  if (!children) return '';
  return children
    .filter((token) => token.type === 'text' || token.type === 'code_inline')
    .map((token) => token.content)
    .join('');
}

function extractToc(tokens: Token[]): TocItem[] {
  const toc: TocItem[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.type !== 'heading_open') continue;
    const level = Number(token.tag.slice(1));
    if (!Number.isInteger(level) || level < 1 || level > 3) continue;
    const id = token.attrGet('id');
    if (!id) continue;
    const inlineToken = tokens[i + 1];
    const text = inlineToken?.type === 'inline' ? headingText(inlineToken.children) : '';
    toc.push({ level, text, id });
  }
  return toc;
}

function countWords(html: string): number {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
  const matches = text.trim().match(/\S+/gu);
  return matches ? matches.length : 0;
}

function computeMinutes(words: number): number {
  if (words <= 0) return 1;
  return Math.max(1, Math.ceil(words / 200));
}

/**
 * Rend un contenu Markdown (sans marqueurs de commentaires) en HTML sanitisé,
 * avec table des matières (h1-h3), nombre de mots et temps de lecture estimé.
 */
export function renderMarkdown(content: string): RenderedDoc {
  const md = getMarkdownIt();
  const env: Record<string, unknown> = {};
  const tokens = md.parse(content, env);
  const rawHtml = md.renderer.render(tokens, md.options, env);
  const html = sanitizeHtml(rawHtml);
  const toc = extractToc(tokens);
  const words = countWords(html);
  const minutes = computeMinutes(words);

  return { html, toc, words, minutes };
}
