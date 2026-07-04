import { describe, expect, it } from 'vitest';
import { buildTreeFromFiles, scanCommentCounts } from '../tree';
import type { TreeNode } from '../../../types';

function fileAt(relativePath: string, content = '# Titre'): File {
  const file = new File([content], relativePath.split('/').pop() ?? relativePath, {
    type: 'text/markdown',
  });
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
  return file;
}

function findChild(node: TreeNode, name: string): TreeNode | undefined {
  return node.children?.find((child) => child.name === name);
}

describe('buildTreeFromFiles', () => {
  it('reconstruit une arborescence imbriquée depuis des chemins relatifs', () => {
    const files = [
      fileAt('projet/README.md'),
      fileAt('projet/notes/rapport.md'),
      fileAt('projet/notes/annexe.markdown'),
    ];

    const tree = buildTreeFromFiles(files);

    expect(tree.kind).toBe('dir');
    expect(tree.name).toBe('projet');
    expect(tree.children).toHaveLength(2);

    const notes = findChild(tree, 'notes');
    expect(notes?.kind).toBe('dir');
    expect(notes?.children?.map((c) => c.name)).toEqual(['annexe.markdown', 'rapport.md']);

    const readme = findChild(tree, 'README.md');
    expect(readme?.kind).toBe('file');
    expect(readme?.entry?.path).toBe('projet/README.md');
    expect(readme?.entry?.source).toBe('tree');
  });

  it('ignore les fichiers non markdown, les dossiers cachés et node_modules', () => {
    const files = [
      fileAt('projet/index.txt'),
      fileAt('projet/.git/config.md'),
      fileAt('projet/node_modules/pkg/readme.md'),
      fileAt('projet/guide.md'),
    ];

    const tree = buildTreeFromFiles(files);

    expect(tree.children).toHaveLength(1);
    expect(tree.children?.[0].name).toBe('guide.md');
  });

  it('trie les dossiers avant les fichiers, en ordre naturel', () => {
    const files = [
      fileAt('doc/zeta.md'),
      fileAt('doc/file10.md'),
      fileAt('doc/file2.md'),
      fileAt('doc/sous-dossier/a.md'),
    ];

    const tree = buildTreeFromFiles(files);
    const names = tree.children?.map((child) => child.name);

    expect(names).toEqual(['sous-dossier', 'file2.md', 'file10.md', 'zeta.md']);
  });

  it("produit un dossier racine par défaut quand aucun fichier n'est markdown", () => {
    const tree = buildTreeFromFiles([fileAt('projet/notes.txt')]);
    expect(tree.name).toBe('Dossier');
    expect(tree.children).toEqual([]);
  });
});

describe('scanCommentCounts', () => {
  const withComments = `Paragraphe.

<!--pulse:comment
{
  "v": 1,
  "id": "pc-aaaaaa",
  "status": "open",
  "author": "A",
  "createdAt": "2026-01-01T00:00:00+01:00",
  "text": "t",
  "anchor": { "quote": "q" },
  "replies": []
}
-->

<!--pulse:comment
{
  "v": 1,
  "id": "pc-bbbbbb",
  "status": "resolved",
  "author": "A",
  "createdAt": "2026-01-01T00:00:00+01:00",
  "text": "t",
  "anchor": { "quote": "q" },
  "replies": []
}
-->
`;

  it('compte les commentaires ouverts et totaux via une regex légère', async () => {
    const files = [fileAt('doc/a.md'), fileAt('doc/b.md')];
    const tree = buildTreeFromFiles(files);

    await scanCommentCounts(
      tree,
      async (entry) => (entry.name === 'a.md' ? withComments : 'Rien ici.'),
      2,
    );

    const a = findChild(tree, 'a.md');
    const b = findChild(tree, 'b.md');

    expect(a?.entry?.commentCounts).toEqual({ open: 1, total: 2 });
    expect(b?.entry?.commentCounts).toEqual({ open: 0, total: 0 });
  });

  it('ne bloque pas sur une lecture en échec', async () => {
    const files = [fileAt('doc/a.md')];
    const tree = buildTreeFromFiles(files);

    await scanCommentCounts(tree, async () => {
      throw new Error('lecture impossible');
    });

    const a = findChild(tree, 'a.md');
    expect(a?.entry?.commentCounts).toBeUndefined();
  });
});
