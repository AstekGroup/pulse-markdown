import DOMPurify from 'dompurify';

// Attributs data-* systématiquement conservés (data-line, data-graph…), au
// même titre que les classes et les ids de headings — DOMPurify les garde
// déjà par défaut, on l'explicite ici pour que l'intention soit lisible.
const FORBIDDEN_TAGS = ['script', 'style', 'iframe', 'form', 'object', 'embed', 'link', 'meta', 'base'];

// N'autorise que les protocoles inoffensifs dans les attributs d'URL
// (href, src…) : http(s), mailto, tel — jamais javascript:, data:text/html, etc.
const SAFE_URI_REGEXP = /^(?:(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$)))/i;

let hooksInstalled = false;

function installHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;

  DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    if (/^on/i.test(data.attrName)) {
      data.keepAttr = false;
    }
  });

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node instanceof Element && node.tagName === 'A' && node.getAttribute('target') === '_blank') {
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

/**
 * Sanitisation centralisée du HTML issu du rendu Markdown : interdit
 * script/style/iframe/form et assimilés, neutralise les urls javascript:,
 * force rel="noopener noreferrer" sur les liens target="_blank". Conserve
 * les classes, les ids de headings et les attributs data-* (data-line,
 * data-graph…) nécessaires au reste de l'application.
 */
export function sanitizeHtml(dirty: string): string {
  installHooks();
  return DOMPurify.sanitize(dirty, {
    FORBID_TAGS: FORBIDDEN_TAGS,
    ALLOW_DATA_ATTR: true,
    // target n'est pas autorisé par défaut par DOMPurify (target="_blank"
    // sans rel="noopener" est un risque connu) : on l'ajoute explicitement,
    // le hook afterSanitizeAttributes ci-dessus impose le rel qui va avec.
    ADD_ATTR: ['target'],
    ALLOWED_URI_REGEXP: SAFE_URI_REGEXP,
  });
}

// Balises explicitement interdites dans le SVG Mermaid, en plus de la
// restriction au profil `svg`/`svgFilters` : `foreignObject` est déjà exclu
// de ce profil (il autoriserait du HTML arbitraire dans un SVG), `script` de
// même — listés ici pour que l'intention soit lisible, pas pour compenser
// une lacune du profil.
const FORBIDDEN_MERMAID_TAGS = ['script', 'foreignObject'];

/**
 * Sanitisation dédiée aux SVG produits par Mermaid : contrairement à
 * `sanitizeHtml`, elle AUTORISE `<style>` (le profil `svg` de DOMPurify le
 * permet nativement) — Mermaid encode ses fills/strokes/couleurs de thème
 * dans un `<style>` interne, et le supprimer casse visuellement tous les
 * diagrammes (aplats noirs, flèches invisibles). Mermaid tourne par ailleurs
 * en `securityLevel:'strict'` ; on continue d'interdire script/foreignObject
 * (hors du profil `svg`) et les attributs `on*` (hook global ci-dessus).
 */
export function sanitizeMermaidSvg(dirty: string): string {
  installHooks();
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: FORBIDDEN_MERMAID_TAGS,
    ALLOWED_URI_REGEXP: SAFE_URI_REGEXP,
  });
}
