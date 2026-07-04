import { useMemo } from 'react';
import { useStore } from '../store';
import { stripBom, toLines } from '../core/comments/parser';

/**
 * Vue source lecture seule (⌘E, SPEC §6) : `doc.source` avec numéros de ligne
 * (compteur CSS) et marqueurs `<!--pulse:comment … -->` mis en évidence.
 */
export function SourceView() {
  const doc = useStore((s) => s.doc);

  const lines = useMemo(() => (doc ? toLines(stripBom(doc.source).text) : []), [doc]);

  const markerLines = useMemo(() => {
    const set = new Set<number>();
    if (doc) {
      for (const comment of doc.comments) {
        for (let i = comment.markerLines[0]; i < comment.markerLines[1]; i++) set.add(i);
      }
    }
    return set;
  }, [doc]);

  if (!doc) {
    return (
      <div className="source-view">
        <p className="source-view__empty">Aucun document.</p>
      </div>
    );
  }

  return (
    <div className="source-view" lang="fr">
      <pre className="source-view__code">
        <code>
          {lines.map((line, index) => (
            <span
              key={index}
              className={`source-line${markerLines.has(index) ? ' source-line--marker' : ''}`}
            >
              {line}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
