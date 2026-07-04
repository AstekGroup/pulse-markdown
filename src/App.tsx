import { useEffect, useState } from 'react';
import { useStore } from './store';
import { parseDocument } from './core/comments/parser';
import { renderMarkdown } from './core/markdown/render';
import type { FileEntry } from './types';
import { TopBar } from './components/TopBar';
import { StatusBar } from './components/StatusBar';
import { WelcomeScreen } from './components/WelcomeScreen';
import { LibraryPanel } from './components/LibraryPanel';
import { ReaderView } from './components/ReaderView';
import { SourceView } from './components/SourceView';
import { CommentsPanel } from './components/CommentsPanel';
import { CommandPalette } from './components/CommandPalette';
import { ShortcutsOverlay } from './components/ShortcutsOverlay';
import { IdentityDialog } from './components/IdentityDialog';
import { Toasts } from './components/Toasts';
import { useShortcuts } from './hooks/useShortcuts';

declare global {
  interface Window {
    __pulse: {
      getSource(): string | null;
      loadSource(text: string, name?: string): void;
      loadDemo(): void;
      store: typeof useStore;
    };
  }
}

function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files');
}

export default function App() {
  const view = useStore((s) => s.view);
  const sourceView = useStore((s) => s.sourceView);
  const theme = useStore((s) => s.theme);
  const openDropped = useStore((s) => s.openDropped);
  const loadDemo = useStore((s) => s.loadDemo);

  const [dragDepth, setDragDepth] = useState(0);
  useShortcuts();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('demo')) loadDemo();
  }, [loadDemo]);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!useStore.getState().dirty) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  useEffect(() => {
    function onDragEnter(e: DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragDepth((d) => d + 1);
    }
    function onDragOver(e: DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault();
    }
    function onDragLeave(e: DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragDepth((d) => Math.max(0, d - 1));
    }
    function onDrop(e: DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragDepth(0);
      const items = e.dataTransfer?.items;
      if (items) void openDropped(items);
    }
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [openDropped]);

  useEffect(() => {
    window.__pulse = {
      getSource: () => useStore.getState().doc?.source ?? null,
      loadSource: (text, name = 'document.md') => {
        const doc = parseDocument(text);
        const rendered = renderMarkdown(doc.content);
        const entry: FileEntry = { id: name, name, path: name, source: 'drop' };
        // Comme store.openParsedEntry (B7) : ce chargement isolé n'appartient à
        // aucun dossier déjà ouvert — on remet rootHandle/tree à null pour ne
        // pas résoudre images/liens relatifs contre l'ancien dossier.
        useStore.setState({
          currentEntry: entry,
          rootHandle: null,
          tree: null,
          doc,
          rendered,
          dirty: false,
          saveState: 'idle',
          saveMode: 'download',
          view: 'reader',
          activeCommentId: null,
          pendingAnchor: null,
          sourceView: false,
        });
      },
      loadDemo: () => useStore.getState().loadDemo(),
      store: useStore,
    };
  }, []);

  return (
    <>
      {view === 'welcome' ? (
        <WelcomeScreen />
      ) : (
        <div className="app-shell">
          <LibraryPanel />
          <div className="app-main">
            <TopBar />
            <div className="app-content">{sourceView ? <SourceView /> : <ReaderView />}</div>
            <StatusBar />
          </div>
          <CommentsPanel />
        </div>
      )}
      <CommandPalette />
      <ShortcutsOverlay />
      <IdentityDialog />
      <Toasts />
      {dragDepth > 0 && (
        <div className="drop-veil" aria-hidden="true">
          <div className="drop-veil__card">Déposez pour ouvrir</div>
        </div>
      )}
    </>
  );
}
