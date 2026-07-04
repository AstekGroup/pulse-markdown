import { describe, expect, it } from 'vitest';
import { MARKER_OPEN, parseDocument } from '../parser';
import { addComment, addReply, deleteComment, setStatus, stripAllComments, updateCommentText } from '../mutations';
import { generateCommentId } from '../id';
import { renderMarkdown } from '../../markdown/render';
import type { PulseComment } from '../../../types';

function markerLines(json: Record<string, unknown>): string[] {
  return ['<!--pulse:comment', ...JSON.stringify(json, null, 2).split('\n'), '-->'];
}

function marker(json: Record<string, unknown>): string {
  return markerLines(json).join('\n');
}

function baseComment(overrides: Partial<PulseComment> = {}): PulseComment {
  return {
    v: 1,
    id: 'pc-abc123',
    status: 'open',
    author: 'Marie Dupont',
    createdAt: '2026-07-04T14:32:00+02:00',
    text: 'Peut-on préciser la source ?',
    anchor: { quote: 'progresse de 12 %' },
    replies: [],
    ...overrides,
  };
}

describe('COMMENT-SPEC §6 — cas de test obligatoires', () => {
  // 1. Aller-retour : parse puis mutations puis parse — le contenu est intact
  it('1. round-trip : le contenu du document reste intact hors lignes de marqueurs', () => {
    const source = [
      'Le CA du T3 progresse de 12 % sur la région Nord.',
      '',
      marker(baseComment()),
      '',
      '## Section suivante',
      '',
      'Un paragraphe de conclusion.',
      '',
    ].join('\n');

    const doc1 = parseDocument(source);
    expect(doc1.comments).toHaveLength(1);

    const mutated = setStatus(doc1, 'pc-abc123', 'resolved', 'Thomas F.');
    const doc2 = parseDocument(mutated);

    expect(doc2.content).toBe(doc1.content);
    expect(doc2.comments[0].comment.status).toBe('resolved');
  });

  // 2. Marqueur dans un bloc de code clôturé → traité comme contenu
  it('2. un marqueur à l’intérieur d’un bloc de code clôturé est du contenu', () => {
    const source = [
      'Voici un exemple :',
      '',
      '```',
      '<!--pulse:comment',
      '{ "not": "a real marker" }',
      '-->',
      '```',
      '',
      'Fin.',
      '',
    ].join('\n');

    const doc = parseDocument(source);
    expect(doc.comments).toHaveLength(0);
    expect(doc.content).toBe(source.replace(/\n$/, '') + '\n');
  });

  // 3. Fichier CRLF réécrit en CRLF ; fichier avec BOM préservé
  it('3a. un fichier CRLF est ré-écrit en CRLF après mutation', () => {
    const lines = ['Paragraphe un.', '', ...markerLines(baseComment()), '', 'Paragraphe deux.', ''];
    const source = lines.join('\r\n');

    const doc = parseDocument(source);
    expect(doc.eol).toBe('\r\n');

    const mutated = setStatus(doc, 'pc-abc123', 'resolved');
    expect(mutated).toContain('\r\n');
    expect(mutated).not.toMatch(/[^\r]\n/);
  });

  it('3b. le BOM est préservé', () => {
    const source = '﻿' + ['Un paragraphe.', '', marker(baseComment()), '', 'Suite.', ''].join('\n');
    const doc = parseDocument(source);
    expect(doc.hadBom).toBe(true);
    expect(doc.source.charCodeAt(0)).toBe(0xfeff);

    const mutated = setStatus(doc, 'pc-abc123', 'resolved');
    expect(mutated.charCodeAt(0)).toBe(0xfeff);
  });

  // 4. JSON malformé → préservé, exposé malformed
  it('4. un JSON malformé est préservé tel quel et exposé malformed: true', () => {
    const source = [
      'Un paragraphe.',
      '',
      '<!--pulse:comment',
      '{ "v": 1, "id": "pc-broken", oops }',
      '-->',
      '',
      'Suite.',
      '',
    ].join('\n');

    const doc = parseDocument(source);
    expect(doc.comments).toHaveLength(1);
    expect(doc.comments[0].malformed).toBe(true);
    expect(doc.comments[0].raw).toContain('oops');
  });

  // 5. Commentaire sur : dernier bloc, titre, après tableau, après liste imbriquée, sur bloc de code
  it('5a. commentaire sur le tout dernier bloc du document', () => {
    const source = ['# Titre', '', 'Dernier paragraphe.', '', marker(baseComment())].join('\n');
    const doc = parseDocument(source);
    expect(doc.comments).toHaveLength(1);
    expect(doc.comments[0].anchorLines).not.toBeNull();
  });

  it('5b. commentaire sur un titre', () => {
    const source = ['# Titre principal', '', marker(baseComment()), '', 'Paragraphe.', ''].join('\n');
    const doc = parseDocument(source);
    expect(doc.comments[0].anchorLines).toEqual([0, 1]);
  });

  it('5c. commentaire après un tableau', () => {
    const source = [
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      marker(baseComment()),
      '',
      'Suite.',
      '',
    ].join('\n');
    const doc = parseDocument(source);
    expect(doc.comments[0].anchorLines).toEqual([0, 3]);
  });

  it('5d. commentaire après une liste imbriquée', () => {
    const source = [
      '- item un',
      '  - sous-item',
      '- item deux',
      '',
      marker(baseComment()),
      '',
      'Suite.',
      '',
    ].join('\n');
    const doc = parseDocument(source);
    expect(doc.comments[0].anchorLines).toEqual([0, 3]);
  });

  it('5e. commentaire sur un bloc de code', () => {
    const source = ['```ts', 'const x = 1;', '```', '', marker(baseComment()), '', 'Suite.', ''].join('\n');
    const doc = parseDocument(source);
    expect(doc.comments[0].anchorLines).toEqual([0, 3]);
  });

  // 6. Deux commentaires sur le même bloc → deux marqueurs consécutifs, ordre stable
  it('6. deux commentaires sur le même bloc restent dans l’ordre', () => {
    const c1 = baseComment({ id: 'pc-first1' });
    const c2 = baseComment({ id: 'pc-second', text: 'Deuxième avis' });
    const source = ['Un paragraphe.', '', marker(c1), '', marker(c2), '', 'Suite.', ''].join('\n');

    const doc = parseDocument(source);
    expect(doc.comments).toHaveLength(2);
    expect(doc.comments[0].comment.id).toBe('pc-first1');
    expect(doc.comments[1].comment.id).toBe('pc-second');
    expect(doc.comments[0].anchorLines).toEqual(doc.comments[1].anchorLines);
  });

  // 7. deleteComment ne laisse pas de triple ligne vide
  it('7. deleteComment ne laisse pas de triple ligne vide', () => {
    const c1 = baseComment({ id: 'pc-first1' });
    const c2 = baseComment({ id: 'pc-second', text: 'Deuxième avis' });
    const source = ['Un paragraphe.', '', marker(c1), '', marker(c2), '', 'Suite.', ''].join('\n');

    const doc = parseDocument(source);
    const afterDelete = deleteComment(doc, 'pc-second');
    expect(afterDelete).not.toMatch(/\n{4,}/);
    expect(afterDelete).toBe(['Un paragraphe.', '', marker(c1), '', 'Suite.', ''].join('\n'));

    const reparsed = parseDocument(afterDelete);
    expect(reparsed.comments).toHaveLength(1);
    expect(reparsed.comments[0].comment.id).toBe('pc-first1');
  });

  // 8. Texte contenant "-->" neutralisé à l'écriture
  it('8. un texte utilisateur contenant "-->" est neutralisé en écriture', () => {
    const doc = parseDocument(['Un paragraphe.', ''].join('\n'));
    const id = generateCommentId();
    const comment = baseComment({ id, text: 'Attention à ceci --> ça casse ?' });
    const written = addComment(doc, comment, 0);

    expect(written).not.toContain('ceci --> ça');
    expect(written).toContain('ceci -- > ça');

    const reparsed = parseDocument(written);
    expect(reparsed.comments[0].malformed).toBeUndefined();
    expect(reparsed.comments[0].comment.text).toContain('-- >');
  });

  // 9. Document vide / sans commentaire / marqueur en fin sans \n final
  it('9a. document vide', () => {
    const doc = parseDocument('');
    expect(doc.comments).toHaveLength(0);
    expect(doc.content).toBe('');
  });

  it('9b. document sans commentaire', () => {
    const doc = parseDocument('Juste un paragraphe.\n');
    expect(doc.comments).toHaveLength(0);
    expect(doc.content).toBe('Juste un paragraphe.\n');
  });

  it('9c. marqueur en toute fin de fichier sans \\n final', () => {
    const source = ['Paragraphe.', '', marker(baseComment())].join('\n');
    expect(source.endsWith('\n')).toBe(false);
    const doc = parseDocument(source);
    expect(doc.comments).toHaveLength(1);
    expect(doc.comments[0].markerLines[1]).toBe(source.split('\n').length);
  });

  // 10. Champs inconnus dans le JSON → préservés après setStatus
  it('10. les champs inconnus sont préservés après setStatus', () => {
    const withExtra = { ...baseComment(), customField: 'valeur maison' };
    const source = ['Un paragraphe.', '', marker(withExtra), '', 'Suite.', ''].join('\n');

    const doc = parseDocument(source);
    expect(doc.comments[0].comment.customField).toBe('valeur maison');

    const mutated = setStatus(doc, 'pc-abc123', 'resolved');
    const reparsed = parseDocument(mutated);
    expect(reparsed.comments[0].comment.customField).toBe('valeur maison');
    expect(reparsed.comments[0].comment.status).toBe('resolved');
  });
});

describe('parser — cas complémentaires', () => {
  it('stripAllComments retire tous les marqueurs sans laisser de triple ligne vide', () => {
    const c1 = baseComment({ id: 'pc-first1' });
    const c2 = baseComment({ id: 'pc-second' });
    const source = [
      '# Titre',
      '',
      'Paragraphe un.',
      '',
      marker(c1),
      '',
      marker(c2),
      '',
      'Paragraphe deux.',
      '',
    ].join('\n');

    const cleaned = stripAllComments(source);
    expect(cleaned).not.toContain('pulse:comment');
    expect(cleaned).not.toMatch(/\n{3,}/);
    expect(cleaned).toBe(['# Titre', '', 'Paragraphe un.', '', 'Paragraphe deux.', ''].join('\n'));
  });

  it('updateCommentText ne modifie que les lignes du marqueur ciblé', () => {
    const c1 = baseComment({ id: 'pc-first1' });
    const source = ['Paragraphe un.', '', marker(c1), '', 'Paragraphe deux.', ''].join('\n');
    const doc = parseDocument(source);
    const mutated = updateCommentText(doc, 'pc-first1', 'Nouveau texte');
    const reparsed = parseDocument(mutated);
    expect(reparsed.content).toBe(doc.content);
    expect(reparsed.comments[0].comment.text).toBe('Nouveau texte');
  });

  it('addComment sur une liste à puces loose insère le marqueur après le dernier item, jamais entre deux items', () => {
    const source = ['- item un', '', '- item deux', '', 'Suite.', ''].join('\n');
    const doc = parseDocument(source);
    const id = generateCommentId();
    const written = addComment(doc, baseComment({ id }), 0);
    const writtenLines = written.split('\n');

    expect(writtenLines.indexOf('- item un')).toBeLessThan(writtenLines.indexOf('- item deux'));
    expect(writtenLines.indexOf('- item deux')).toBeLessThan(writtenLines.indexOf(MARKER_OPEN));
    expect(writtenLines.indexOf(MARKER_OPEN)).toBeLessThan(writtenLines.indexOf('Suite.'));

    const reparsed = parseDocument(written);
    expect(reparsed.comments).toHaveLength(1);
    expect((renderMarkdown(reparsed.content).html.match(/<ul/g) ?? []).length).toBe(1);
  });

  it('addComment sur une liste ordonnée loose insère le marqueur après le dernier item, sans scinder la numérotation', () => {
    const source = ['1. item un', '', '2. item deux', '', 'Suite.', ''].join('\n');
    const doc = parseDocument(source);
    const id = generateCommentId();
    const written = addComment(doc, baseComment({ id }), 0);
    const writtenLines = written.split('\n');

    expect(writtenLines.indexOf('1. item un')).toBeLessThan(writtenLines.indexOf('2. item deux'));
    expect(writtenLines.indexOf('2. item deux')).toBeLessThan(writtenLines.indexOf(MARKER_OPEN));
    expect(writtenLines.indexOf(MARKER_OPEN)).toBeLessThan(writtenLines.indexOf('Suite.'));

    const reparsed = parseDocument(written);
    expect(reparsed.comments).toHaveLength(1);
    const html = renderMarkdown(reparsed.content).html;
    expect((html.match(/<ol/g) ?? []).length).toBe(1);
    expect(html).toContain('item deux');
  });

  it('addReply ajoute une réponse au fil existant', () => {
    const c1 = baseComment({ id: 'pc-first1' });
    const source = ['Paragraphe un.', '', marker(c1), '', 'Paragraphe deux.', ''].join('\n');
    const doc = parseDocument(source);
    const mutated = addReply(doc, 'pc-first1', {
      author: 'Thomas F.',
      createdAt: '2026-07-04T15:01:00+02:00',
      text: 'Bien vu.',
    });
    const reparsed = parseDocument(mutated);
    expect(reparsed.comments[0].comment.replies).toHaveLength(1);
    expect(reparsed.comments[0].comment.replies[0].text).toBe('Bien vu.');
  });
});
