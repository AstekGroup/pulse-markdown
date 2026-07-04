// Store applicatif unique (zustand, SPEC §4). Le texte source (`ParsedDoc.source`)
// est la seule source de vérité pour le document et ses commentaires : toute
// mutation passe par une fonction pure de `core/comments/mutations`, qui produit
// un nouveau texte, ensuite re-parsé et re-rendu via `applySource`.

import { create } from 'zustand';
import type {
  CommentFilter,
  CommentStatus,
  FileEntry,
  ParsedDoc,
  PendingAnchor,
  PulseComment,
  PulseReply,
  RecentEntry,
  RenderedDoc,
  SaveState,
  ThemeMode,
  DocFont,
  Toast,
  TreeNode,
} from './types';
import { parseDocument } from './core/comments/parser';
import {
  addComment as coreAddComment,
  addReply as coreAddReply,
  deleteComment as coreDeleteComment,
  setStatus as coreSetStatus,
  stripAllComments,
} from './core/comments/mutations';
import { generateCommentId } from './core/comments/id';
import { renderMarkdown } from './core/markdown/render';
import { detectFileCapabilities, type FileCapabilities } from './core/files/capabilities';
import { openDroppedItems, pickMarkdownFile, pickMarkdownFolder } from './core/files/open';
import { buildTreeFromHandle, scanCommentCounts, type ReadEntryText } from './core/files/tree';
import { saveFile } from './core/files/save';
import { addRecent, ensureRecentPermission, loadRecents, pruneDeadRecents } from './core/files/recents';
import { loadDemo as buildDemoDocument } from './demo';

// ——— Préférences persistées (identity, theme, docFont) ———

interface Prefs {
  identity: string | null;
  theme: ThemeMode;
  docFont: DocFont;
}

const PREFS_KEY = 'pulse-markdown:prefs';

function loadPrefs(): Prefs {
  const fallback: Prefs = { identity: null, theme: 'system', docFont: 'serif' };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      identity: typeof parsed.identity === 'string' && parsed.identity.trim() ? parsed.identity : null,
      theme: parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system' ? parsed.theme : 'system',
      docFont: parsed.docFont === 'sans' || parsed.docFont === 'serif' ? parsed.docFont : 'serif',
    };
  } catch {
    return fallback;
  }
}

function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // stockage indisponible (navigation privée, quota) : préférence non persistée
  }
}

// ——— Prompt de relecture IA (COMMENT-SPEC §5, texte exact) ———

const AI_REVIEW_PROMPT =
  'Ce document Markdown contient des commentaires de relecture embarqués dans des marqueurs ' +
  '<!--pulse:comment … --> (JSON : author, text, status, anchor.quote = extrait visé, replies). ' +
  'Traite chaque commentaire au statut "open" : applique la correction demandée au texte visé par ' +
  'anchor.quote, puis passe le marqueur correspondant à "status": "resolved" en ajoutant une reply ' +
  'signée de ton nom résumant la modification. Ne supprime aucun marqueur.';

// ——— Utilitaires fichiers (hors contrat core, propres au store) ———

function downloadTextFile(name: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function cleanExportName(entryName: string | undefined): string {
  const base = entryName ? entryName.replace(/\.(md|markdown)$/i, '') : 'document';
  return `${base}-sans-commentaires.md`;
}

async function readEntryText(entry: FileEntry): Promise<string> {
  if (entry.handle) {
    const file = await entry.handle.getFile();
    return file.text();
  }
  if (entry.file) return entry.file.text();
  throw new Error('Document illisible.');
}

const readEntryTextForScan: ReadEntryText = readEntryText;

function findFirstFile(node: TreeNode): FileEntry | null {
  if (node.kind === 'file') return node.entry ?? null;
  for (const child of node.children ?? []) {
    const found = findFirstFile(child);
    if (found) return found;
  }
  return null;
}

function cloneTree(node: TreeNode): TreeNode {
  return { ...node, children: node.children?.map(cloneTree) };
}

function scheduleIdle(fn: () => void): void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(() => fn());
  } else {
    setTimeout(fn, 200);
  }
}

let toastCounter = 0;

// ——— Store ———

export interface PulseStore {
  // préférences (persistées en localStorage : identity, theme, docFont)
  identity: string | null;
  theme: ThemeMode;
  docFont: DocFont;
  // capacités du navigateur (File System Access API)
  capabilities: FileCapabilities;
  // bibliothèque & document
  tree: TreeNode | null;
  rootHandle: FileSystemDirectoryHandle | null;
  currentEntry: FileEntry | null;
  recents: RecentEntry[];
  doc: ParsedDoc | null;
  rendered: RenderedDoc | null;
  dirty: boolean;
  saveState: SaveState;
  saveMode: 'inplace' | 'download' | null;
  // interactions
  activeCommentId: string | null;
  pendingAnchor: PendingAnchor | null;
  commentFilter: CommentFilter;
  // panneaux / vues
  view: 'welcome' | 'reader';
  libraryOpen: boolean;
  // ouverture de la bibliothèque en overlay plein écran sous 768px (DESIGN-BRIEF §3) ;
  // indépendante de `libraryOpen` (qui gère la largeur compacte/étendue en desktop)
  mobileLibraryOpen: boolean;
  commentsOpen: boolean;
  sourceView: boolean;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  identityAsk: boolean;
  toasts: Toast[];
  // en attente d'identité (rejoué une fois le nom renseigné)
  pendingIdentityAction: (() => void) | null;

  // actions — fichiers
  openFilePicker(): Promise<void>;
  openFolderPicker(): Promise<void>;
  openDropped(items: DataTransferItemList): Promise<void>;
  openEntry(entry: FileEntry): Promise<void>;
  openRecent(r: RecentEntry): Promise<void>;
  loadDemo(): void;
  save(): Promise<void>;
  exportClean(): void;
  copyAiPrompt(): void;
  // actions — document/commentaires
  applySource(newSource: string): void;
  addComment(text: string): void;
  addReply(id: string, text: string): void;
  setCommentStatus(id: string, status: CommentStatus): void;
  deleteComment(id: string): void;
  // actions — UI
  setIdentity(name: string): void;
  setTheme(t: ThemeMode): void;
  setDocFont(f: DocFont): void;
  setActiveComment(id: string | null): void;
  setPendingAnchor(p: PendingAnchor | null): void;
  setCommentFilter(f: CommentFilter): void;
  toggle(panel: 'library' | 'mobileLibrary' | 'comments' | 'source' | 'palette' | 'shortcuts'): void;
  pushToast(kind: Toast['kind'], text: string): void;
  removeToast(id: number): void;
}

export const useStore = create<PulseStore>((set, get) => {
  const prefs = loadPrefs();

  function openParsedEntry(entry: FileEntry, source: string): void {
    const doc = parseDocument(source);
    const rendered = renderMarkdown(doc.content);
    const caps = get().capabilities;
    const saveMode: 'inplace' | 'download' = entry.handle && caps.createWritable ? 'inplace' : 'download';
    // Un fichier ouvert isolément (picker/drop/récent-fichier/demo) n'appartient
    // pas au dossier éventuellement déjà ouvert : conserver rootHandle/tree
    // résoudrait à tort les images relatives et les liens .md contre l'ANCIEN
    // dossier (revue sécurité — B7). Seules les entrées issues de l'arborescence
    // du dossier courant (`source: 'tree'`) doivent le préserver.
    const belongsToCurrentTree = entry.source === 'tree';
    set({
      currentEntry: entry,
      doc,
      rendered,
      dirty: false,
      saveState: 'idle',
      saveMode,
      view: 'reader',
      activeCommentId: null,
      pendingAnchor: null,
      sourceView: false,
      ...(belongsToCurrentTree ? {} : { rootHandle: null, tree: null }),
    });
  }

  async function openEntryInternal(entry: FileEntry, remember: boolean): Promise<void> {
    try {
      const text = await readEntryText(entry);
      openParsedEntry(entry, text);
      if (remember) {
        const recent: RecentEntry = {
          id: entry.id,
          name: entry.name,
          kind: 'file',
          openedAt: new Date().toISOString(),
          handle: entry.handle,
        };
        const recents = await addRecent(recent);
        set({ recents });
      }
    } catch {
      get().pushToast('error', 'Impossible d’ouvrir ce document.');
    }
  }

  function adoptTree(tree: TreeNode, rootHandle: FileSystemDirectoryHandle | null, remember: boolean): void {
    set({ tree, rootHandle, libraryOpen: true });
    if (remember && rootHandle) {
      addRecent({
        id: rootHandle.name,
        name: rootHandle.name,
        kind: 'dir',
        openedAt: new Date().toISOString(),
        handle: rootHandle,
      }).then((recents) => set({ recents }));
    }
    scheduleIdle(() => {
      scanCommentCounts(tree, readEntryTextForScan, 3).then(() => {
        if (get().tree === tree) set({ tree: cloneTree(tree) });
      });
    });
    const first = findFirstFile(tree);
    if (first) void openEntryInternal(first, false);
  }

  function ensureIdentity(run: () => void): void {
    if (get().identity) {
      run();
      return;
    }
    set({ identityAsk: true, pendingIdentityAction: run });
  }

  return {
    identity: prefs.identity,
    theme: prefs.theme,
    docFont: prefs.docFont,
    capabilities: detectFileCapabilities(),

    tree: null,
    rootHandle: null,
    currentEntry: null,
    recents: [],
    doc: null,
    rendered: null,
    dirty: false,
    saveState: 'idle',
    saveMode: null,

    activeCommentId: null,
    pendingAnchor: null,
    commentFilter: 'all',

    view: 'welcome',
    libraryOpen: true,
    mobileLibraryOpen: false,
    commentsOpen: true,
    sourceView: false,
    paletteOpen: false,
    shortcutsOpen: false,
    identityAsk: false,
    toasts: [],
    pendingIdentityAction: null,

    // ——— fichiers ———

    async openFilePicker() {
      const entry = await pickMarkdownFile();
      if (!entry) return;
      await openEntryInternal(entry, true);
    },

    async openFolderPicker() {
      const result = await pickMarkdownFolder();
      if (!result) return;
      adoptTree(result.tree, result.rootHandle, true);
    },

    async openDropped(items: DataTransferItemList) {
      const result = await openDroppedItems(items);
      if (!result) return;
      if (result.kind === 'file') {
        await openEntryInternal(result.entry, true);
      } else {
        adoptTree(result.tree, result.rootHandle, true);
      }
    },

    async openEntry(entry: FileEntry) {
      await openEntryInternal(entry, true);
    },

    async openRecent(r: RecentEntry) {
      if (!r.handle) {
        get().pushToast('error', 'Ce document n’est plus accessible.');
        return;
      }
      const permission = await ensureRecentPermission(r);
      if (permission !== 'granted') {
        get().pushToast('error', 'L’accès à ce document a été refusé.');
        return;
      }
      if (r.kind === 'file') {
        const handle = r.handle as FileSystemFileHandle;
        const file = await handle.getFile();
        const entry: FileEntry = { id: r.id, name: r.name, path: r.name, handle, file, source: 'recent' };
        await openEntryInternal(entry, true);
      } else {
        const handle = r.handle as FileSystemDirectoryHandle;
        const tree = await buildTreeFromHandle(handle);
        adoptTree(tree, handle, true);
      }
    },

    loadDemo() {
      const { entry, source } = buildDemoDocument();
      openParsedEntry(entry, source);
    },

    async save() {
      const { doc, currentEntry, saveState } = get();
      if (!doc || !currentEntry) return;
      // Sans ce garde-fou, un clic répété pendant l'attente d'une permission
      // navigateur (cf. save.ts) déclencherait plusieurs `createWritable()`
      // concurrents — la première tentative suffit ; les suivantes n'ajoutent
      // que de la confusion (prompts empilés) pendant que l'utilisateur, ne
      // voyant rien se passer, insiste sur le bouton.
      if (saveState === 'saving') return;
      set({ saveState: 'saving' });
      try {
        const mode = await saveFile(currentEntry, doc.source);
        set({ saveState: 'saved', dirty: false, saveMode: mode });
        if (mode === 'inplace') {
          get().pushToast('success', 'Document enregistré');
        } else {
          get().pushToast('info', 'Ce navigateur ne permet pas d’enregistrer directement : le fichier a été téléchargé');
        }
      } catch {
        set({ saveState: 'error' });
        get().pushToast('error', 'Échec de l’enregistrement.');
      }
    },

    exportClean() {
      const { doc, currentEntry } = get();
      if (!doc) return;
      const clean = stripAllComments(doc.source);
      downloadTextFile(cleanExportName(currentEntry?.name), clean);
      get().pushToast('success', 'Copie sans commentaires téléchargée');
    },

    copyAiPrompt() {
      navigator.clipboard
        .writeText(AI_REVIEW_PROMPT)
        .then(() => get().pushToast('success', 'Prompt copié dans le presse-papier'))
        .catch(() => get().pushToast('error', 'Impossible de copier le prompt.'));
    },

    // ——— document / commentaires ———

    applySource(newSource: string) {
      const { doc, rendered } = get();
      if (!doc) return;
      const parsed = parseDocument(newSource);
      // Les mutations de commentaires (addComment/addReply/setStatus/…)
      // n'insèrent/ne réécrivent que des lignes de marqueur : `content` (le
      // document débarrassé des marqueurs) reste alors rigoureusement
      // identique. Recalculer `rendered` dans ce cas referait pour rien un
      // cycle markdown-it + highlight.js + DOMPurify complet et déclencherait
      // une réhydratation (Mermaid, images, ancres) inutile côté ReaderView.
      const nextRendered = rendered && parsed.content === doc.content ? rendered : renderMarkdown(parsed.content);
      set({ doc: parsed, rendered: nextRendered, dirty: true, saveState: 'idle' });
    },

    addComment(text: string) {
      const trimmed = text.trim();
      if (!trimmed) return;
      const { pendingAnchor, doc } = get();
      if (!pendingAnchor || !doc) return;
      ensureIdentity(() => {
        const state = get();
        if (!state.doc || !state.pendingAnchor || !state.identity) return;
        const comment: PulseComment = {
          v: 1,
          id: generateCommentId(),
          status: 'open',
          author: state.identity,
          createdAt: new Date().toISOString(),
          text: trimmed,
          anchor: state.pendingAnchor.anchor,
          replies: [],
        };
        const newSource = coreAddComment(state.doc, comment, state.pendingAnchor.contentLine);
        get().applySource(newSource);
        set({ pendingAnchor: null, activeCommentId: comment.id });
        get().pushToast('success', 'Commentaire ajouté — pensez à enregistrer');
      });
    },

    addReply(id: string, text: string) {
      const trimmed = text.trim();
      if (!trimmed) return;
      ensureIdentity(() => {
        const state = get();
        if (!state.doc || !state.identity) return;
        const reply: PulseReply = { author: state.identity, createdAt: new Date().toISOString(), text: trimmed };
        const newSource = coreAddReply(state.doc, id, reply);
        get().applySource(newSource);
        get().pushToast('success', 'Réponse ajoutée — pensez à enregistrer');
      });
    },

    setCommentStatus(id: string, status: CommentStatus) {
      const { doc, identity } = get();
      if (!doc) return;
      const newSource = coreSetStatus(doc, id, status, status === 'resolved' ? (identity ?? undefined) : undefined);
      get().applySource(newSource);
      get().pushToast('success', status === 'resolved' ? 'Commentaire résolu' : 'Commentaire rouvert');
    },

    deleteComment(id: string) {
      const { doc, activeCommentId } = get();
      if (!doc) return;
      const newSource = coreDeleteComment(doc, id);
      get().applySource(newSource);
      if (activeCommentId === id) set({ activeCommentId: null });
      get().pushToast('info', 'Commentaire supprimé');
    },

    // ——— UI ———

    setIdentity(name: string) {
      const trimmed = name.trim();
      if (!trimmed) return;
      set({ identity: trimmed, identityAsk: false });
      savePrefs({ identity: trimmed, theme: get().theme, docFont: get().docFont });
      const pending = get().pendingIdentityAction;
      if (pending) {
        set({ pendingIdentityAction: null });
        pending();
      }
    },

    setTheme(t: ThemeMode) {
      set({ theme: t });
      savePrefs({ identity: get().identity, theme: t, docFont: get().docFont });
    },

    setDocFont(f: DocFont) {
      set({ docFont: f });
      savePrefs({ identity: get().identity, theme: get().theme, docFont: f });
    },

    setActiveComment(id: string | null) {
      set({ activeCommentId: id });
    },

    setPendingAnchor(p: PendingAnchor | null) {
      set({ pendingAnchor: p });
    },

    setCommentFilter(f: CommentFilter) {
      set({ commentFilter: f });
    },

    toggle(panel) {
      set((s) => {
        switch (panel) {
          case 'library':
            return { libraryOpen: !s.libraryOpen };
          case 'mobileLibrary':
            return { mobileLibraryOpen: !s.mobileLibraryOpen };
          case 'comments':
            return { commentsOpen: !s.commentsOpen };
          case 'source':
            return { sourceView: !s.sourceView };
          case 'palette':
            return { paletteOpen: !s.paletteOpen };
          case 'shortcuts':
            return { shortcutsOpen: !s.shortcutsOpen };
          default:
            return {};
        }
      });
    },

    pushToast(kind, text) {
      toastCounter += 1;
      const id = toastCounter;
      set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
      setTimeout(() => get().removeToast(id), 4200);
    },

    removeToast(id: number) {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    },
  };
});

// Récents : chargés puis nettoyés une fois au démarrage (handles morts exclus).
void loadRecents().then((recents) => useStore.setState({ recents }));
void pruneDeadRecents().then((recents) => useStore.setState({ recents }));
