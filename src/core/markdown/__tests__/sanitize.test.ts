import { describe, expect, it } from 'vitest';
import { sanitizeHtml, sanitizeMermaidSvg } from '../sanitize';

describe('sanitizeHtml', () => {
  it('supprime les balises script/style/iframe/form', () => {
    const dirty =
      '<p>Texte</p><script>alert(1)</script><style>body{color:red}</style>' +
      '<iframe src="https://evil.example"></iframe><form action="/x"><input></form>';
    const clean = sanitizeHtml(dirty);
    expect(clean).toContain('<p>Texte</p>');
    expect(clean.toLowerCase()).not.toContain('<script');
    expect(clean.toLowerCase()).not.toContain('<style');
    expect(clean.toLowerCase()).not.toContain('<iframe');
    expect(clean.toLowerCase()).not.toContain('<form');
    expect(clean).not.toContain('alert(1)');
  });

  it('supprime les attributs on*', () => {
    const clean = sanitizeHtml('<div onclick="alert(1)" onmouseover="alert(2)">bloc</div>');
    expect(clean.toLowerCase()).not.toContain('onclick');
    expect(clean.toLowerCase()).not.toContain('onmouseover');
    expect(clean).toContain('bloc');
  });

  it('neutralise les urls javascript:', () => {
    const clean = sanitizeHtml('<a href="javascript:alert(1)">clic</a>');
    expect(clean.toLowerCase()).not.toContain('javascript:');
  });

  it('conserve les classes, ids et attributs data-*', () => {
    const clean = sanitizeHtml(
      '<h2 id="section-un" class="titre" data-line="4">Section</h2><pre data-graph="abc" data-line="9"></pre>',
    );
    expect(clean).toContain('id="section-un"');
    expect(clean).toContain('class="titre"');
    expect(clean).toContain('data-line="4"');
    expect(clean).toContain('data-graph="abc"');
    expect(clean).toContain('data-line="9"');
  });

  it('force rel="noopener noreferrer" sur les liens target=_blank', () => {
    const withoutRel = sanitizeHtml('<a href="https://example.com" target="_blank">lien</a>');
    expect(withoutRel).toContain('rel="noopener noreferrer"');

    const withWeakerRel = sanitizeHtml('<a href="https://example.com" target="_blank" rel="external">lien</a>');
    expect(withWeakerRel).toContain('rel="noopener noreferrer"');
  });

  it("ne touche pas au rel d'un lien qui n'ouvre pas de nouvel onglet", () => {
    const clean = sanitizeHtml('<a href="https://example.com">lien</a>');
    expect(clean).not.toContain('rel=');
  });
});

describe('sanitizeMermaidSvg', () => {
  it('conserve le <style> interne (fills/strokes du thème Mermaid) contrairement à sanitizeHtml', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><style>#x rect{fill:red}</style>' +
      '<rect id="x" width="10" height="10"/></svg>';

    const viaMermaidPath = sanitizeMermaidSvg(svg);
    expect(viaMermaidPath.toLowerCase()).toContain('<style');
    expect(viaMermaidPath).toContain('fill:red');

    // Le chemin générique, lui, continue de retirer <style> (comportement
    // volontaire pour le HTML du document — c'est précisément pourquoi un
    // chemin dédié existe pour le SVG Mermaid).
    const viaGenericPath = sanitizeHtml(svg);
    expect(viaGenericPath.toLowerCase()).not.toContain('<style');
  });

  it('supprime toujours script/foreignObject et les attributs on* dans le SVG', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">' +
      '<script>alert(2)</script>' +
      '<foreignObject><div onclick="alert(3)">x</div></foreignObject>' +
      '<circle cx="5" cy="5" r="4"/></svg>';

    const clean = sanitizeMermaidSvg(svg);
    expect(clean.toLowerCase()).not.toContain('<script');
    expect(clean.toLowerCase()).not.toContain('foreignobject');
    expect(clean.toLowerCase()).not.toContain('onload');
    expect(clean.toLowerCase()).not.toContain('onclick');
    expect(clean).not.toContain('alert(');
    expect(clean).toContain('<circle');
  });
});
