import { describe, expect, it } from 'vitest';
import { isExternalOrDataSrc, resolveRelativeImagePath } from '../images';

describe('resolveRelativeImagePath', () => {
  it('résout une image dans le même dossier que le document', () => {
    expect(resolveRelativeImagePath('notes/rapport.md', 'schema.png')).toBe('notes/schema.png');
    expect(resolveRelativeImagePath('notes/rapport.md', './schema.png')).toBe('notes/schema.png');
  });

  it('résout une image dans un sous-dossier', () => {
    expect(resolveRelativeImagePath('notes/rapport.md', 'assets/schema.png')).toBe(
      'notes/assets/schema.png',
    );
  });

  it('remonte les dossiers parents avec ../', () => {
    expect(resolveRelativeImagePath('notes/sub/rapport.md', '../assets/logo.png')).toBe(
      'notes/assets/logo.png',
    );
    expect(resolveRelativeImagePath('notes/sub/rapport.md', '../../logo.png')).toBe('logo.png');
  });

  it('résout depuis un document à la racine du dossier ouvert', () => {
    expect(resolveRelativeImagePath('rapport.md', 'images/photo.jpg')).toBe('images/photo.jpg');
  });
});

describe('isExternalOrDataSrc', () => {
  it('détecte les URL absolues, data et blob', () => {
    expect(isExternalOrDataSrc('https://exemple.fr/img.png')).toBe(true);
    expect(isExternalOrDataSrc('//exemple.fr/img.png')).toBe(true);
    expect(isExternalOrDataSrc('data:image/png;base64,AAAA')).toBe(true);
    expect(isExternalOrDataSrc('blob:https://exemple.fr/uuid')).toBe(true);
  });

  it('laisse passer les chemins relatifs', () => {
    expect(isExternalOrDataSrc('./schema.png')).toBe(false);
    expect(isExternalOrDataSrc('assets/schema.png')).toBe(false);
  });
});
