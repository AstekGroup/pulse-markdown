// Résolution de l'ancrage d'un commentaire dans le HTML rendu.
//
// Stratégie (COMMENT-SPEC §3) : chercher la quote (espaces normalisés)
// d'abord dans le bloc racine désigné par `anchorLines`/`data-line`, sinon
// dans tout le conteneur rendu ; départager les occurrences multiples par
// prefix/suffix puis par proximité de la position d'origine ; retourner
// `null` si la quote est introuvable (orphelin).

import type { ParsedComment, ParsedDoc, PulseAnchor } from '../../types';

/**
 * Résultat de résolution d'une ancre — union discriminée :
 * - `text` : correspondance ordinaire dans un ou plusieurs nœuds texte,
 *   enveloppée par `wrapMatchInMark` avec des `<mark>`.
 * - `block` : la cible est (ou dégrade vers) un bloc entier — cas des
 *   diagrammes Mermaid, où insérer un `<mark>` HTML dans l'arbre SVG casserait
 *   le rendu (élément HTML non affiché dans un namespace SVG) et produirait
 *   un `boundingRect` 0×0. Le bloc entier reçoit alors la classe
 *   `pulse-anchor-block` — jamais de `<mark>` à l'intérieur.
 */
export type AnchorMatch =
  | {
      kind: 'text';
      /** Nœud texte où débute la correspondance. */
      node: Text;
      /** Offset de début dans `node`. */
      startOffset: number;
      /** Nœud texte où se termine la correspondance (peut être égal à `node`). */
      endNode: Text;
      /** Offset de fin dans `endNode`. */
      endOffset: number;
      /** Élément de bloc racine (ou conteneur) dans lequel la correspondance a été trouvée. */
      container: HTMLElement;
    }
  | {
      kind: 'block';
      /** Bloc racine entier ciblé par l'ancre (ex. `.mermaid-diagram`). */
      el: HTMLElement;
    };

type TextAnchorMatch = Extract<AnchorMatch, { kind: 'text' }>;

interface TextRange {
  node: Text;
  start: number;
  end: number;
}

function collectTextNodes(root: Node): Text[] {
  const nodes: Text[] = [];
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n = walker.nextNode();
  while (n) {
    nodes.push(n as Text);
    n = walker.nextNode();
  }
  return nodes;
}

function buildRawIndex(root: Node): { raw: string; ranges: TextRange[] } {
  const nodes = collectTextNodes(root);
  let raw = '';
  const ranges: TextRange[] = [];
  for (const node of nodes) {
    const start = raw.length;
    raw += node.data;
    ranges.push({ node, start, end: raw.length });
  }
  return { raw, ranges };
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ');
}

function buildNormalizedMap(raw: string): { normalized: string; rawOffsets: number[] } {
  let normalized = '';
  const rawOffsets: number[] = [];
  let inWhitespace = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (/\s/.test(ch)) {
      if (!inWhitespace) {
        normalized += ' ';
        rawOffsets.push(i);
        inWhitespace = true;
      }
    } else {
      normalized += ch;
      rawOffsets.push(i);
      inWhitespace = false;
    }
  }
  rawOffsets.push(raw.length);
  return { normalized, rawOffsets };
}

/**
 * Localise le nœud texte portant l'offset brut de DÉBUT d'une correspondance.
 * Borne haute EXCLUSIVE (`rawOffset < r.end`) : quand l'offset tombe pile à la
 * frontière entre deux nœuds texte adjacents (systématique dans un SVG, où
 * les libellés sont des `<text>`/`<tspan>` sans espace entre eux), c'est le
 * nœud SUIVANT qui doit être retenu, pas le précédent avec un offset égal à
 * sa longueur. Seul le tout dernier range tolère la borne `<=` (offset en
 * toute fin du conteneur).
 */
function locateRangeStart(ranges: TextRange[], rawOffset: number): { node: Text; offset: number } | null {
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    const isLast = i === ranges.length - 1;
    if (rawOffset >= r.start && (isLast ? rawOffset <= r.end : rawOffset < r.end)) {
      return { node: r.node, offset: rawOffset - r.start };
    }
  }
  return null;
}

/**
 * Localise le nœud texte portant l'offset brut de FIN (exclusif) d'une
 * correspondance : celui qui contient le dernier caractère inclus, à
 * l'index `rawEnd - 1`. Borne basse EXCLUSIVE (`rawEnd > r.start`) — miroir
 * de `locateRangeStart` pour la même raison de frontière entre nœuds.
 */
function locateRangeEnd(ranges: TextRange[], rawEnd: number): { node: Text; offset: number } | null {
  for (const r of ranges) {
    if (rawEnd > r.start && rawEnd <= r.end) {
      return { node: r.node, offset: rawEnd - r.start };
    }
  }
  return null;
}

interface Occurrence {
  start: number;
  end: number;
}

function findOccurrences(normalized: string, quote: string): Occurrence[] {
  const occurrences: Occurrence[] = [];
  let idx = normalized.indexOf(quote);
  while (idx !== -1) {
    occurrences.push({ start: idx, end: idx + quote.length });
    idx = normalized.indexOf(quote, idx + 1);
  }
  return occurrences;
}

function scoreContext(normalized: string, occ: Occurrence, prefix?: string, suffix?: string): number {
  let score = 0;
  if (prefix) {
    const np = normalizeWhitespace(prefix);
    const before = normalized.slice(Math.max(0, occ.start - np.length), occ.start);
    if (before.endsWith(np)) score += 2;
  }
  if (suffix) {
    const ns = normalizeWhitespace(suffix);
    const after = normalized.slice(occ.end, occ.end + ns.length);
    if (after.startsWith(ns)) score += 2;
  }
  return score;
}

function blockAncestor(node: Text, root: HTMLElement): HTMLElement {
  const el = node.parentElement?.closest('[data-line]');
  return (el as HTMLElement | null) ?? root;
}

function proximityScore(root: HTMLElement, ranges: TextRange[], occ: Occurrence, reference: HTMLElement): number {
  const loc = locateRangeStart(ranges, occ.start);
  if (!loc) return 0;
  const block = blockAncestor(loc.node, root);
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('[data-line]'));
  const bi = blocks.indexOf(block);
  const ri = blocks.indexOf(reference);
  if (bi === -1 || ri === -1) return 0;
  return 1 / (1 + Math.abs(bi - ri));
}

function searchWithin(
  root: HTMLElement,
  normalizedQuote: string,
  anchor: PulseAnchor,
  proximityRef?: HTMLElement,
): TextAnchorMatch | null {
  const { raw, ranges } = buildRawIndex(root);
  const { normalized, rawOffsets } = buildNormalizedMap(raw);
  const occurrences = findOccurrences(normalized, normalizedQuote);
  if (occurrences.length === 0) return null;

  let best = occurrences[0];
  if (occurrences.length > 1) {
    let bestScore = -Infinity;
    for (const occ of occurrences) {
      let score = scoreContext(normalized, occ, anchor.prefix, anchor.suffix);
      if (proximityRef) score += proximityScore(root, ranges, occ, proximityRef);
      if (score > bestScore) {
        bestScore = score;
        best = occ;
      }
    }
  }

  const rawStart = rawOffsets[best.start];
  const rawEnd = rawOffsets[best.end];
  const startLoc = locateRangeStart(ranges, rawStart);
  const endLoc = locateRangeEnd(ranges, rawEnd);
  if (!startLoc || !endLoc) return null;

  return {
    kind: 'text',
    node: startLoc.node,
    startOffset: startLoc.offset,
    endNode: endLoc.node,
    endOffset: endLoc.offset,
    container: blockAncestor(startLoc.node, root),
  };
}

/** Un diagramme rendu (Mermaid) : bloc source non hydraté ou déjà hydraté en SVG. */
function isDiagramBlock(el: HTMLElement): boolean {
  return el.matches('.mermaid-diagram, .mermaid-src');
}

/** Un nœud texte situé dans l'arbre SVG d'un diagramme hydraté — y insérer un
 * élément HTML (`<mark>`) ne serait jamais rendu (namespace SVG) et casserait
 * visuellement le libellé du nœud. */
function isInSvg(node: Text): boolean {
  return !!node.parentElement?.closest('svg');
}

export function resolveAnchor(_doc: ParsedDoc, html: HTMLElement, c: ParsedComment): AnchorMatch | null {
  const anchor = c.comment.anchor;
  const normalizedQuote = normalizeWhitespace(anchor.quote ?? '').trim();
  if (!normalizedQuote) return null;

  let designatedBlock: HTMLElement | null = null;
  if (c.anchorLines) {
    designatedBlock = html.querySelector<HTMLElement>(`[data-line="${c.anchorLines[0]}"]`);
  }

  // Diagramme (Mermaid) : ancrage de bloc direct, sans chercher la quote dans
  // les nœuds texte — résout aussi le cas où le SVG n'est pas encore hydraté
  // (le bloc, lui, existe dès l'injection du innerHTML).
  if (designatedBlock && isDiagramBlock(designatedBlock)) {
    return { kind: 'block', el: designatedBlock };
  }

  if (designatedBlock) {
    const match = searchWithin(designatedBlock, normalizedQuote, anchor);
    if (match) return match;
  }

  const fallback = searchWithin(html, normalizedQuote, anchor, designatedBlock ?? undefined);
  if (!fallback) return null;
  // Recherche plein-document aboutie à l'intérieur d'un diagramme : dégrade
  // aussi en ancrage de bloc (même raison que ci-dessus).
  if (isInSvg(fallback.node)) {
    return { kind: 'block', el: fallback.container };
  }
  return fallback;
}

interface TextSegment {
  node: Text;
  start: number;
  end: number;
}

/** Découpe un `AnchorMatch` de type `text` (qui peut s'étendre sur plusieurs
 * nœuds texte — ex. deux cellules de tableau adjacentes sans séparateur dans
 * le texte brut concaténé) en segments, un par nœud texte réellement traversé. */
function collectMatchSegments(match: TextAnchorMatch): TextSegment[] {
  const { node, startOffset, endNode, endOffset, container } = match;
  if (node === endNode) {
    return startOffset < endOffset ? [{ node, start: startOffset, end: endOffset }] : [];
  }

  const doc = container.ownerDocument ?? document;
  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const segments: TextSegment[] = [];
  let collecting = false;
  let current = walker.nextNode();
  while (current) {
    const text = current as Text;
    if (text === node) collecting = true;
    if (collecting) {
      const start = text === node ? startOffset : 0;
      const end = text === endNode ? endOffset : text.data.length;
      if (start < end) segments.push({ node: text, start, end });
    }
    if (text === endNode) break;
    current = walker.nextNode();
  }
  return segments;
}

/** Isole, au sein d'un nœud texte, exactement le sous-texte `[start, end)`
 * dans son propre nœud texte (via `splitText`), sans jamais toucher aux
 * éléments environnants. */
function extractTextSegment(text: Text, start: number, end: number): Text {
  let node = text;
  if (start > 0) node = node.splitText(start);
  if (end - start < node.data.length) node.splitText(end - start);
  return node;
}

/**
 * Enveloppe un `AnchorMatch` :
 * - `kind: 'text'` → un ou plusieurs `<mark class="pulse-anchor"
 *   data-comment-id="…">`, un par segment de nœud texte traversé — **jamais**
 *   via `Range.surroundContents` (qui, lorsque les bornes du range couvrent
 *   l'intégralité d'un nœud texte, peut envelopper l'ÉLÉMENT parent plutôt que
 *   le seul texte — ex. un `<td>` entier dans un tableau — et casser la
 *   structure du document). On isole toujours le texte lui-même avant de
 *   l'entourer. Garde-fou : tout segment situé dans un `<svg>` est ignoré (un
 *   `<mark>` HTML n'y serait pas rendu — namespace SVG).
 * - `kind: 'block'` → pas de `<mark>` : le bloc entier reçoit la classe
 *   `pulse-anchor-block` et `data-comment-id` (cas des diagrammes Mermaid).
 */
export function wrapMatchInMark(match: AnchorMatch, commentId: string): void {
  if (match.kind === 'block') {
    match.el.classList.add('pulse-anchor-block');
    // Plusieurs commentaires peuvent viser le même bloc (ex. deux remarques
    // sur un même diagramme) : data-comment-id est une liste séparée par des
    // espaces, interrogeable via le sélecteur d'attribut `~=`.
    const ids = (match.el.getAttribute('data-comment-id') ?? '').split(/\s+/).filter(Boolean);
    if (!ids.includes(commentId)) ids.push(commentId);
    match.el.setAttribute('data-comment-id', ids.join(' '));
    return;
  }

  const segments = collectMatchSegments(match).filter((segment) => !isInSvg(segment.node));
  for (const segment of segments) {
    const isolated = extractTextSegment(segment.node, segment.start, segment.end);
    const parent = isolated.parentNode;
    if (!parent) continue;
    const doc = isolated.ownerDocument ?? document;
    const mark = doc.createElement('mark');
    mark.className = 'pulse-anchor';
    mark.dataset.commentId = commentId;
    parent.insertBefore(mark, isolated);
    mark.appendChild(isolated);
  }
}

/** Construit une ancre à partir d'une sélection ou d'un bloc, au moment de la création. */
export function buildAnchor(
  quote: string,
  contextBefore: string,
  contextAfter: string,
  heading: string | null,
  blockType?: string,
): PulseAnchor {
  const anchor: PulseAnchor = { quote: quote.slice(0, 200) };
  const prefix = contextBefore.slice(-32);
  const suffix = contextAfter.slice(0, 32);
  if (prefix) anchor.prefix = prefix;
  if (suffix) anchor.suffix = suffix;
  if (heading !== undefined) anchor.heading = heading;
  if (blockType) anchor.blockType = blockType;
  return anchor;
}
