// Mutations pures du format de commentaires Pulse : chaque fonction prend le
// document déjà parsé (`ParsedDoc`) et retourne une nouvelle source complète.
// Aucune mutation ne touche autre chose que les lignes des marqueurs
// concernés (+ la ligne vide excédentaire en cas de suppression).

import type { CommentStatus, ParsedDoc, PulseComment, PulseReply } from '../../types';
import { MARKER_CLOSE, MARKER_OPEN, locateBlockInsertionPoint, parseDocument, stripBom, toLines, withBom } from './parser';

// ——— Neutralisation de "-->" dans les champs texte ———

function sanitizeStrings<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(/-->/g, '-- >') as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeStrings(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeStrings(v);
    }
    return out as T;
  }
  return value;
}

function serializeMarkerLines(comment: PulseComment): string[] {
  const sanitized = sanitizeStrings(comment);
  const json = JSON.stringify(sanitized, null, 2);
  return [MARKER_OPEN, ...json.split('\n'), MARKER_CLOSE];
}

// ——— Insertion d'un nouveau marqueur ———

function computeInsertionLines(markerLines: string[], lines: string[], insertionIndex: number): string[] {
  const precededByBlank = insertionIndex > 0 && lines[insertionIndex - 1] === '';
  const followedByBlank = insertionIndex < lines.length && lines[insertionIndex] === '';
  const out: string[] = [];
  if (!precededByBlank) out.push('');
  out.push(...markerLines);
  if (!followedByBlank) out.push('');
  return out;
}

export function addComment(doc: ParsedDoc, c: PulseComment, contentLine: number): string {
  const insertionIndex = locateBlockInsertionPoint(doc, contentLine);
  const { text } = stripBom(doc.source);
  const lines = toLines(text);
  const markerLines = serializeMarkerLines(c);
  const insertion = computeInsertionLines(markerLines, lines, insertionIndex);
  lines.splice(insertionIndex, 0, ...insertion);
  return withBom(lines.join(doc.eol), doc.hadBom);
}

// ——— Réécriture du corps d'un marqueur existant ———

function replaceMarkerBody(doc: ParsedDoc, id: string, updater: (c: PulseComment) => PulseComment): string {
  const found = doc.comments.find((pc) => pc.comment.id === id);
  if (!found) return doc.source;

  const updated = updater(found.comment);
  const { text } = stripBom(doc.source);
  const lines = toLines(text);
  const [start, end] = found.markerLines;
  const markerLines = serializeMarkerLines(updated);
  lines.splice(start, end - start, ...markerLines);
  return withBom(lines.join(doc.eol), doc.hadBom);
}

export function updateCommentText(doc: ParsedDoc, id: string, text: string): string {
  return replaceMarkerBody(doc, id, (c) => ({ ...c, text }));
}

export function setStatus(doc: ParsedDoc, id: string, status: CommentStatus, by?: string): string {
  return replaceMarkerBody(doc, id, (c) => {
    const next: PulseComment = { ...c, status };
    if (status === 'resolved') {
      next.resolvedAt = new Date().toISOString();
      if (by) next.resolvedBy = by;
    }
    return next;
  });
}

export function addReply(doc: ParsedDoc, id: string, reply: PulseReply): string {
  return replaceMarkerBody(doc, id, (c) => ({ ...c, replies: [...c.replies, reply] }));
}

// ——— Suppression d'un marqueur ———

export function deleteComment(doc: ParsedDoc, id: string): string {
  const found = doc.comments.find((pc) => pc.comment.id === id);
  if (!found) return doc.source;

  const { text } = stripBom(doc.source);
  const lines = toLines(text);
  const [start, end] = found.markerLines;
  lines.splice(start, end - start);
  removeExcessBlankAt(lines, start);
  return withBom(lines.join(doc.eol), doc.hadBom);
}

/**
 * Après suppression d'un marqueur, ses deux lignes vides flanquantes se
 * retrouvent adjacentes. On en retire une seule ("la ligne vide
 * excédentaire") pour restituer une séparation à une seule ligne vide.
 */
function removeExcessBlankAt(lines: string[], at: number): void {
  if (at > 0 && at < lines.length && lines[at - 1] === '' && lines[at] === '') {
    lines.splice(at, 1);
  }
}

// ——— Export "copie propre" ———

export function stripAllComments(raw: string): string {
  const doc = parseDocument(raw);
  const { text } = stripBom(raw);
  const lines = toLines(text);

  for (let k = doc.comments.length - 1; k >= 0; k--) {
    const [start, end] = doc.comments[k].markerLines;
    lines.splice(start, end - start);
    removeExcessBlankAt(lines, start);
  }

  return withBom(lines.join(doc.eol), doc.hadBom);
}
