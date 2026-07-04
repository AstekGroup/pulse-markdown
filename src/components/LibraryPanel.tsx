import { useEffect, useState } from 'react';
import { ChevronRight, FileText, FolderOpen, FolderTree, Menu, PanelLeftClose } from 'lucide-react';
import { useStore } from '../store';
import type { TreeNode } from '../types';
import iconWhite from '../assets/pulse-icon-white.svg';

/** Ferme l'overlay mobile de la bibliothèque après ouverture d'un fichier,
 * sans provoquer de re-rendu superflu (lecture directe de l'état courant). */
function closeMobileLibraryIfOpen(): void {
  if (useStore.getState().mobileLibraryOpen) useStore.getState().toggle('mobileLibrary');
}

function TreeFolder({ node, depth }: { node: TreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(true);
  const children = node.children ?? [];

  return (
    <li>
      <button
        type="button"
        className="library-row library-row--dir"
        style={{ paddingLeft: 12 + depth * 14 }}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <ChevronRight size={14} className={`library-chevron${expanded ? ' library-chevron--open' : ''}`} />
        <FolderTree size={15} aria-hidden="true" />
        <span className="library-row__name">{node.name}</span>
      </button>
      {expanded && children.length > 0 && (
        <ul className="library-tree__children">
          {children.map((child) =>
            child.kind === 'dir' ? (
              <TreeFolder key={child.path} node={child} depth={depth + 1} />
            ) : (
              <TreeFile key={child.path} node={child} depth={depth + 1} />
            ),
          )}
        </ul>
      )}
    </li>
  );
}

function TreeFile({ node, depth }: { node: TreeNode; depth: number }) {
  const currentEntry = useStore((s) => s.currentEntry);
  const openEntry = useStore((s) => s.openEntry);
  const active = node.entry && currentEntry?.id === node.entry.id;
  const counts = node.entry?.commentCounts;

  return (
    <li>
      <button
        type="button"
        className={`library-row library-row--file${active ? ' is-active' : ''}`}
        style={{ paddingLeft: 12 + depth * 14 + 18 }}
        onClick={() => {
          if (!node.entry) return;
          void openEntry(node.entry);
          closeMobileLibraryIfOpen();
        }}
      >
        <FileText size={14} aria-hidden="true" />
        <span className="library-row__name">{node.name}</span>
        {counts && counts.open > 0 && <span className="library-badge">{counts.open}</span>}
      </button>
    </li>
  );
}

export function LibraryPanel() {
  const tree = useStore((s) => s.tree);
  const libraryOpen = useStore((s) => s.libraryOpen);
  const mobileLibraryOpen = useStore((s) => s.mobileLibraryOpen);
  const toggle = useStore((s) => s.toggle);
  const openFolderPicker = useStore((s) => s.openFolderPicker);

  const compact = !tree || !libraryOpen;

  // Sous 768px, le rail est masqué par défaut (DESIGN-BRIEF §3) et ne
  // s'ouvre qu'en overlay via le déclencheur mobile ci-dessous ; Échap le
  // referme au même titre que le clic sur le voile ou un choix de fichier.
  useEffect(() => {
    if (!mobileLibraryOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') toggle('mobileLibrary');
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileLibraryOpen, toggle]);

  return (
    <>
      <button
        type="button"
        className="library-mobile-trigger"
        onClick={() => toggle('mobileLibrary')}
        aria-label="Ouvrir la bibliothèque"
        aria-haspopup="true"
        aria-expanded={mobileLibraryOpen}
      >
        <Menu size={18} />
      </button>
      {mobileLibraryOpen && (
        <div
          className="library-mobile-backdrop"
          onClick={() => toggle('mobileLibrary')}
          aria-hidden="true"
        />
      )}
      <aside
        className={`library-rail${compact ? ' library-rail--compact' : ''}${
          mobileLibraryOpen ? ' library-rail--mobile-open' : ''
        }`}
        aria-label="Bibliothèque"
      >
        <div className="library-header">
          <img src={iconWhite} alt="" className="library-logo" width={20} height={25} />
          {!compact && <span className="library-wordmark">Pulse Markdown</span>}
          {tree && (
            <button
              type="button"
              className="library-collapse"
              onClick={() => toggle('library')}
              aria-label={libraryOpen ? 'Réduire la bibliothèque' : 'Ouvrir la bibliothèque'}
              title={'⌘\\'}
            >
              <PanelLeftClose size={16} className={libraryOpen ? '' : 'library-chevron--open'} />
            </button>
          )}
        </div>

        {!compact && tree && (
          <nav className="library-tree" aria-label="Arborescence du dossier">
            <ul>
              {(tree.children ?? []).map((child) =>
                child.kind === 'dir' ? (
                  <TreeFolder key={child.path} node={child} depth={0} />
                ) : (
                  <TreeFile key={child.path} node={child} depth={0} />
                ),
              )}
            </ul>
          </nav>
        )}

        {compact && (
          <button
            type="button"
            className="library-compact-action"
            onClick={() => (tree ? toggle('library') : void openFolderPicker())}
            title={tree ? 'Ouvrir la bibliothèque' : 'Ouvrir un dossier'}
            aria-label={tree ? 'Ouvrir la bibliothèque' : 'Ouvrir un dossier'}
          >
            <FolderOpen size={17} />
          </button>
        )}
      </aside>
    </>
  );
}
