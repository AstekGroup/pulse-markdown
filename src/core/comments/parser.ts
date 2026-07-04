// Parseur des commentaires Pulse embarqués dans le Markdown (COMMENT-SPEC v1).
//
// Le fichier est scanné ligne par ligne, en colonne 0, en suivant l'état des
// blocs de code clôturés (``` / ~~~, longueur et caractère de clôture pris en
// compte). Rien n'est jamais perdu : `content` est reconstruit en retirant
// uniquement les lignes des marqueurs, et `source` reste le texte original,
// intact, BOM et fin de ligne compris.

import type { ParsedComment, ParsedDoc, PulseAnchor, PulseComment, PulseReply } from '../../types';
import { getRootBlockRanges } from '../markdown/render';

export const MARKER_OPEN = '<!--pulse:comment';
export const MARKER_CLOSE = '-->';

// ——— BOM / EOL / lignes ———

export function stripBom(raw: string): { text: string; hadBom: boolean } {
  if (raw.charCodeAt(0) === 0xfeff) return { text: raw.slice(1), hadBom: true };
  return { text: raw, hadBom: false };
}

export function detectEol(text: string): '\n' | '\r\n' {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const totalNewlines = (text.match(/\n/g) ?? []).length;
  const lf = totalNewlines - crlf;
  return crlf > 0 && crlf >= lf ? '\r\n' : '\n';
}

export function toLines(text: string): string[] {
  return text.split(/\r\n|\n/);
}

export function withBom(text: string, hadBom: boolean): string {
  return hadBom ? '﻿' + text : text;
}

// ——— Scanner de blocs de code (fences) ———

interface FenceState {
  char: '`' | '~';
  len: number;
}

function fenceOpenMatch(line: string): FenceState | null {
  const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
  if (!m) return null;
  const marker = m[1];
  const infoString = line.slice(m[0].length);
  if (marker[0] === '`' && infoString.includes('`')) return null;
  return { char: marker[0] as '`' | '~', len: marker.length };
}

function fenceCloseMatch(line: string, state: FenceState): boolean {
  const m = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
  if (!m) return false;
  const marker = m[1];
  return marker[0] === state.char && marker.length >= state.len;
}

// ——— Scan combiné : sépare marqueurs et contenu ———

interface RawMarker {
  start: number; // ligne d'ouverture, dans l'espace des lignes source
  end: number; // exclusif, ligne suivant la fermeture
  bodyLines: string[];
  insertAt: number; // position dans contentLines au moment du marqueur
}

interface ScanResult {
  contentLines: string[];
  contentSourceIndex: number[]; // contentSourceIndex[k] = index source de contentLines[k]
  markers: RawMarker[];
}

function scanDocument(lines: string[]): ScanResult {
  const contentLines: string[] = [];
  const contentSourceIndex: number[] = [];
  const markers: RawMarker[] = [];
  let fence: FenceState | null = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (fence) {
      contentLines.push(line);
      contentSourceIndex.push(i);
      if (fenceCloseMatch(line, fence)) fence = null;
      i++;
      continue;
    }

    const open = fenceOpenMatch(line);
    if (open) {
      fence = open;
      contentLines.push(line);
      contentSourceIndex.push(i);
      i++;
      continue;
    }

    if (line === MARKER_OPEN) {
      const body: string[] = [];
      let j = i + 1;
      let closed = false;
      while (j < lines.length) {
        if (lines[j] === MARKER_CLOSE) {
          closed = true;
          break;
        }
        body.push(lines[j]);
        j++;
      }
      if (closed) {
        markers.push({ start: i, end: j + 1, bodyLines: body, insertAt: contentLines.length });
        i = j + 1;
        continue;
      }
      // Pas de fermeture trouvée : ce n'est pas un marqueur valide, on le
      // traite comme du contenu ordinaire.
      contentLines.push(line);
      contentSourceIndex.push(i);
      i++;
      continue;
    }

    contentLines.push(line);
    contentSourceIndex.push(i);
    i++;
  }

  return { contentLines, contentSourceIndex, markers };
}

// ——— Blocs racine (mêmes frontières que le rendu, pour l'ancrage primaire) ———
//
// Réutilise la tokenisation de `renderMarkdown` (markdown-it) plutôt qu'une
// détection naïve ligne/blanc : une liste loose (items séparés par une ligne
// vide) ou une liste ordonnée doit rester un seul bloc racine, jamais scindée
// (COMMENT-SPEC §3) — sans quoi un marqueur peut être inséré entre deux items
// d'une même liste et en casser le rendu chez tout autre lecteur Markdown.

export interface RootBlock {
  start: number; // inclusif
  end: number; // exclusif
}

export function computeRootBlocks(lines: string[]): RootBlock[] {
  const ranges = getRootBlockRanges(lines.join('\n'));
  return ranges.map((r) => {
    // markdown-it inclut parfois, dans le `map` d'un token racine (typiquement
    // une liste), les lignes vides de fin consommées lors de la détection de
    // continuation — elles ne font pas partie du bloc lui-même. On les rogne
    // pour que la frontière ne déborde jamais sur le bloc suivant.
    let end = r.end;
    while (end > r.start && lines[end - 1].trim() === '') end--;
    return { start: r.start, end };
  });
}

export function findBlockForLine(blocks: RootBlock[], line: number): RootBlock | null {
  let result: RootBlock | null = null;
  for (const block of blocks) {
    if (block.start <= line) result = block;
    else break;
  }
  return result;
}

// ——— Validation du JSON de commentaire ———

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isValidAnchor(v: unknown): v is PulseAnchor {
  return isPlainObject(v) && typeof v.quote === 'string';
}

function isValidReply(v: unknown): v is PulseReply {
  return (
    isPlainObject(v) &&
    typeof v.author === 'string' &&
    typeof v.createdAt === 'string' &&
    typeof v.text === 'string'
  );
}

function isValidComment(v: unknown): v is PulseComment {
  if (!isPlainObject(v)) return false;
  return (
    v.v === 1 &&
    typeof v.id === 'string' &&
    (v.status === 'open' || v.status === 'resolved') &&
    typeof v.author === 'string' &&
    typeof v.createdAt === 'string' &&
    typeof v.text === 'string' &&
    isValidAnchor(v.anchor) &&
    Array.isArray(v.replies) &&
    v.replies.every(isValidReply)
  );
}

function fallbackComment(parsed: unknown): PulseComment {
  const base = isPlainObject(parsed) ? parsed : {};
  const anchor = isValidAnchor(base.anchor) ? base.anchor : { quote: '' };
  const replies = Array.isArray(base.replies) ? (base.replies as PulseReply[]) : [];
  return {
    ...base,
    v: 1,
    id: typeof base.id === 'string' ? base.id : '',
    status: base.status === 'resolved' ? 'resolved' : 'open',
    author: typeof base.author === 'string' ? base.author : '',
    createdAt: typeof base.createdAt === 'string' ? base.createdAt : '',
    text: typeof base.text === 'string' ? base.text : '',
    anchor,
    replies,
  } as PulseComment;
}

// ——— API publique ———

export function parseDocument(raw: string): ParsedDoc {
  const { text, hadBom } = stripBom(raw);
  const eol = detectEol(text);
  const lines = toLines(text);
  const scan = scanDocument(lines);
  const blocks = computeRootBlocks(scan.contentLines);

  const comments: ParsedComment[] = scan.markers.map((m) => {
    const bodyText = m.bodyLines.join('\n');
    const rawMarker = [MARKER_OPEN, ...m.bodyLines, MARKER_CLOSE].join('\n');

    let parsedJson: unknown;
    let jsonError = false;
    try {
      parsedJson = JSON.parse(bodyText);
    } catch {
      jsonError = true;
    }

    const valid = !jsonError && isValidComment(parsedJson);
    const comment: PulseComment = valid ? (parsedJson as PulseComment) : fallbackComment(parsedJson);
    const block = findBlockForLine(blocks, m.insertAt);

    const parsedComment: ParsedComment = {
      comment,
      markerLines: [m.start, m.end],
      anchorLines: block ? [block.start, block.end] : null,
      raw: rawMarker,
    };
    if (!valid) parsedComment.malformed = true;
    return parsedComment;
  });

  const content = scan.contentLines.join('\n');

  return { source: raw, content, comments, eol, hadBom };
}

/**
 * Détermine, dans l'espace des lignes de `doc.source`, l'indice où insérer
 * un nouveau marqueur ciblant le bloc racine dont la ligne de départ (dans
 * `content`) est `contentLine`. S'il existe déjà des marqueurs pour ce même
 * bloc, l'insertion se fait après le dernier d'entre eux (ordre stable).
 */
export function locateBlockInsertionPoint(doc: ParsedDoc, contentLine: number): number {
  const { text } = stripBom(doc.source);
  const lines = toLines(text);
  const scan = scanDocument(lines);
  const blocks = computeRootBlocks(scan.contentLines);
  const target = findBlockForLine(blocks, contentLine);

  if (!target) return lines.length;

  const sameBlockMarkerEnds = scan.markers
    .filter((m) => {
      const b = findBlockForLine(blocks, m.insertAt);
      return b !== null && b.start === target.start && b.end === target.end;
    })
    .map((m) => m.end);

  if (sameBlockMarkerEnds.length > 0) {
    return Math.max(...sameBlockMarkerEnds);
  }

  const lastContentIdx = target.end - 1;
  if (lastContentIdx < 0) return lines.length;
  const sourceIdx = scan.contentSourceIndex[lastContentIdx];
  return sourceIdx + 1;
}
