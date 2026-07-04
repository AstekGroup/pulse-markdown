# SPEC — Pulse Markdown

Application web **100 % locale** de lecture et d'annotation de fichiers
Markdown, destinée à des relecteurs non techniques (métier, commerce) comme à
des power users. Livrée sous forme d'**un seul fichier HTML autonome**
(`dist/index.html`) : double-clic → l'app s'ouvre dans le navigateur, sans
internet, sans serveur, sans installation.

Lire aussi : `docs/COMMENT-SPEC.md` (format des commentaires embarqués) et
`docs/DESIGN-BRIEF.md` (design, microcopie, interactions). L'UI est
**entièrement en français**.

## 1. Stack (figée)

- React 19 + TypeScript strict + Vite 7 + `vite-plugin-singlefile` (tout est
  inliné : JS, CSS, fonts en base64, SVG).
- Tailwind CSS v4 (`@tailwindcss/vite`) pour l'UI applicative + CSS artisanal
  pour la typographie du document (`src/styles/document.css`).
- État : zustand (un store unique, slices). Icônes : lucide-react.
- Markdown : markdown-it (+ markdown-it-anchor, markdown-it-task-lists,
  markdown-it-footnote), highlight.js (coloration), mermaid (diagrammes,
  import dynamique), DOMPurify (sanitisation — obligatoire).
- Fichiers : File System Access API (Chrome/Edge) avec **fallbacks complets**
  (input file / webkitdirectory / téléchargement Blob) pour Firefox/Safari.
  Récents : idb-keyval (les FileSystemHandle se stockent dans IndexedDB).
- Tests : vitest (+ jsdom pour ce qui touche au DOM).

**Interdit aux agents : ajouter une dépendance non listée.** Tout est installé
au scaffold. Pas de framer-motion (transitions CSS uniquement), pas de
tailwindcss/typography (document.css est artisanal).

## 2. Arborescence

```
src/
├── main.tsx                  # bootstrap React + import des styles
├── App.tsx                   # shell : compose les panneaux, gère ?demo
├── store.ts                  # store zustand (contrat §4)
├── types.ts                  # types partagés (contrat §3 — VERBATIM)
├── demo.ts                   # chargement du document d'exemple embarqué
├── core/
│   ├── comments/             # moteur de commentaires (COMMENT-SPEC)
│   │   ├── parser.ts         # parseDocument, scanner de fences, EOL/BOM
│   │   ├── mutations.ts      # addComment, setStatus, addReply, delete…
│   │   ├── anchors.ts        # résolution quote/prefix/suffix, orphelins
│   │   ├── id.ts             # generateCommentId (pc-xxxxxx)
│   │   └── __tests__/        # les 10 cas de COMMENT-SPEC §6 minimum
│   ├── markdown/
│   │   ├── render.ts         # renderMarkdown(content) → {html, toc, words}
│   │   ├── sanitize.ts       # DOMPurify config centralisée
│   │   ├── mermaid.ts        # hydrateMermaid(root) post-rendu, lazy
│   │   └── __tests__/
│   └── files/
│       ├── capabilities.ts   # détection FS Access API
│       ├── open.ts           # pickers + fallbacks + drop (fichier & dossier)
│       ├── tree.ts           # walk récursif → TreeNode (.md/.markdown, skip cachés/node_modules)
│       ├── save.ts           # écriture in-place ou téléchargement
│       ├── recents.ts        # idb-keyval, permissions handles
│       └── images.ts         # résolution des images relatives → blob URLs
├── components/
│   ├── WelcomeScreen.tsx     # zéro-state : drop zone, actions, récents
│   ├── TopBar.tsx            # titre doc, fil d'ariane, actions, save state
│   ├── LibraryPanel.tsx      # arborescence du dossier, badges commentaires
│   ├── ReaderView.tsx        # rendu du doc, ancres, marges, sélection, TOC
│   ├── SourceView.tsx        # vue source lecture seule (marqueurs visibles)
│   ├── CommentsPanel.tsx     # fils, composer, filtres, résolution
│   ├── CommandPalette.tsx    # ⌘K
│   ├── ShortcutsOverlay.tsx  # aide « ? »
│   ├── IdentityDialog.tsx    # « Comment vous appelez-vous ? » (1re fois)
│   ├── StatusBar.tsx         # mots, temps de lecture, position, capacités
│   └── Toasts.tsx
├── hooks/
│   ├── useShortcuts.ts       # table centralisée des raccourcis
│   └── useSelectionAnchor.ts # sélection texte → PendingAnchor
├── styles/
│   ├── tokens.css            # variables (DESIGN-BRIEF §2) + @font-face
│   ├── app.css               # chrome applicatif
│   ├── document.css          # typographie du document rendu (.pulse-doc)
│   └── print.css             # impression : document seul
└── assets/                   # fonts/, pulse-icon-*.svg, demo.md
```

## 3. Contrat `src/types.ts` (créé VERBATIM au scaffold)

```ts
// ——— Commentaires (COMMENT-SPEC v1) ———
export type CommentStatus = 'open' | 'resolved';

export interface PulseReply { author: string; createdAt: string; text: string }

export interface PulseAnchor {
  quote: string; prefix?: string; suffix?: string;
  heading?: string | null; blockType?: string;
}

export interface PulseComment {
  v: 1; id: string; status: CommentStatus; author: string; createdAt: string;
  text: string; anchor: PulseAnchor; replies: PulseReply[];
  resolvedBy?: string; resolvedAt?: string;
  [extra: string]: unknown; // champs inconnus préservés
}

export interface ParsedComment {
  comment: PulseComment;
  /** lignes du marqueur dans source (0-based, fin exclusive) */
  markerLines: [number, number];
  /** lignes du bloc cible dans content, ou null (orphelin) */
  anchorLines: [number, number] | null;
  raw: string;
  malformed?: boolean;
}

export interface ParsedDoc {
  source: string;            // texte original complet (source de vérité)
  content: string;           // source sans marqueurs (pour rendu) — EOL \n
  comments: ParsedComment[]; // ordonnés par position
  eol: '\n' | '\r\n';
  hadBom: boolean;
}

// ——— Rendu ———
export interface TocItem { level: number; text: string; id: string }
export interface RenderedDoc { html: string; toc: TocItem[]; words: number; minutes: number }

// ——— Fichiers ———
export interface FileEntry {
  id: string;                // chemin relatif ou nom unique
  name: string;              // "rapport.md"
  path: string;              // chemin d'affichage relatif au dossier ouvert
  handle?: FileSystemFileHandle;
  file?: File;               // fallback sans FS Access
  source: 'picker' | 'drop' | 'tree' | 'demo' | 'recent';
  commentCounts?: { open: number; total: number }; // scan paresseux
}

export interface TreeNode {
  kind: 'dir' | 'file'; name: string; path: string;
  children?: TreeNode[];     // dirs seulement, triés naturel, dirs d'abord
  entry?: FileEntry;         // files seulement
}

export interface RecentEntry {
  id: string; name: string; kind: 'file' | 'dir';
  openedAt: string;          // ISO
  handle?: FileSystemHandle; // présent si FS Access
}

export interface PendingAnchor {
  mode: 'selection' | 'block';
  anchor: PulseAnchor;
  /** data-line (dans content) du bloc racine cible */
  contentLine: number;
  /** rect viewport pour positionner le composer */
  rectTop: number;
}

export interface Toast { id: number; kind: 'info' | 'success' | 'error'; text: string }
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
export type CommentFilter = 'all' | 'open' | 'resolved';
export type ThemeMode = 'light' | 'dark' | 'system';
export type DocFont = 'sans' | 'serif';
```

## 4. Contrat du store (`src/store.ts`, zustand)

```ts
interface PulseStore {
  // préférences (persistées en localStorage : identity, theme, docFont)
  identity: string | null;
  theme: ThemeMode; docFont: DocFont;
  // bibliothèque & document
  tree: TreeNode | null;
  currentEntry: FileEntry | null;
  recents: RecentEntry[];
  doc: ParsedDoc | null;
  rendered: RenderedDoc | null;
  dirty: boolean; saveState: SaveState;
  saveMode: 'inplace' | 'download' | null; // capacité du doc courant
  // interactions
  activeCommentId: string | null;
  pendingAnchor: PendingAnchor | null;
  commentFilter: CommentFilter;
  // panneaux / vues
  view: 'welcome' | 'reader';
  libraryOpen: boolean; commentsOpen: boolean; sourceView: boolean;
  paletteOpen: boolean; shortcutsOpen: boolean; identityAsk: boolean;
  toasts: Toast[];

  // actions — fichiers
  openFilePicker(): Promise<void>;
  openFolderPicker(): Promise<void>;
  openDropped(items: DataTransferItemList): Promise<void>;
  openEntry(entry: FileEntry): Promise<void>;
  openRecent(r: RecentEntry): Promise<void>;
  loadDemo(): void;
  save(): Promise<void>;
  exportClean(): void;             // copie sans commentaires (téléchargement)
  copyAiPrompt(): void;            // COMMENT-SPEC §5 → presse-papier
  // actions — document/commentaires (chacune : mutation pure + re-parse + dirty)
  applySource(newSource: string): void;
  addComment(text: string): void;  // consomme pendingAnchor
  addReply(id: string, text: string): void;
  setCommentStatus(id: string, status: CommentStatus): void;
  deleteComment(id: string): void;
  // actions — UI
  setIdentity(name: string): void;
  setTheme(t: ThemeMode): void; setDocFont(f: DocFont): void;
  setActiveComment(id: string | null): void;
  setPendingAnchor(p: PendingAnchor | null): void;
  setCommentFilter(f: CommentFilter): void;
  toggle(panel: 'library' | 'comments' | 'source' | 'palette' | 'shortcuts'): void;
  pushToast(kind: Toast['kind'], text: string): void;
}
```

Notes d'implémentation :
- `applySource` re-parse, re-rend, met `dirty: true`, préserve le scroll.
- Garde anti-perte : `beforeunload` si `dirty`.
- `window.__pulse = { getSource, loadDemo, loadSource(text), store }` exposé
  pour l'automatisation (tests navigateur, IA).
- `?demo` dans l'URL → `loadDemo()` au démarrage.

## 5. Contrats des modules cœur

```ts
// core/comments
parseDocument(raw: string): ParsedDoc
addComment(doc: ParsedDoc, c: PulseComment, contentLine: number): string
updateCommentText(doc: ParsedDoc, id: string, text: string): string
setStatus(doc: ParsedDoc, id: string, status: CommentStatus, by?: string): string
addReply(doc: ParsedDoc, id: string, reply: PulseReply): string
deleteComment(doc: ParsedDoc, id: string): string
stripAllComments(raw: string): string
generateCommentId(): string
// core/comments/anchors
resolveAnchor(doc: ParsedDoc, html: HTMLElement, c: ParsedComment): AnchorMatch | null

// core/markdown
renderMarkdown(content: string): RenderedDoc
// - blocs racine porteurs de data-line (début, dans content) via token.map :
//   paragraph_open, heading_open, table_open, fence, code_block,
//   blockquote_open, bullet_list_open, ordered_list_open, hr
// - liens externes: target=_blank rel="noopener noreferrer"
// - fence lang=mermaid → <pre class="mermaid-src"> hydraté par hydrateMermaid
// - sanitisation DOMPurify systématique (html:true dans markdown-it)
hydrateMermaid(root: HTMLElement, theme: 'light'|'dark'): Promise<void>

// core/files — voir arborescence ; toutes les fns tolèrent l'absence de
// FS Access API et basculent sur les fallbacks. save() retourne le mode
// effectif ('inplace' | 'download').
```

## 6. Comportements clés

- **Ouverture** : drag & drop (fichier `.md` ou dossier entier), boutons
  « Ouvrir un fichier » / « Ouvrir un dossier », récents cliquables (avec
  re-demande de permission), bouton « Voir un exemple » (demo embarquée).
- **Dossier** : arborescence dans le panneau gauche, filtrée `.md/.markdown`,
  répertoires cachés/`node_modules` exclus. Scan paresseux des compteurs de
  commentaires (concurrence 3, idle) → badges. Images relatives des documents
  résolues via le dossier (blob URLs). Liens relatifs `.md` interceptés →
  ouverture dans l'app.
- **Commentaire** : sélection de texte → pilule flottante « Commenter » ;
  survol d'un bloc → bouton discret dans la gouttière droite. Composer inline
  dans le panneau. Première fois → IdentityDialog (nom stocké localStorage).
- **Sauvegarde** : ⌘S / bouton. FS Access → écriture in-place ; sinon
  téléchargement du `.md` (toast explicite). Indicateur d'état permanent
  (point ambre « modifications non enregistrées » / coche « enregistré »).
- **Navigation commentaires** : clic sur carte ⇄ scroll + surbrillance pulsée
  de l'ancre ; n/p naviguent ; filtres Tous/Ouverts/Résolus ; compteur.
- **Vue source** (⌘E) : lecture seule, marqueurs visibles mis en évidence.
- **Impression** (⌘P) : print.css → document seul, propre.
- Raccourcis complets : voir DESIGN-BRIEF §6 (table unique dans useShortcuts).

## 7. Scripts npm

- `dev` (vite), `build` (tsc -b && vite build → un seul dist/index.html),
  `package` (build + `cp dist/index.html pulse-markdown.html` à la racine),
  `test` (vitest run), `typecheck` (tsc --noEmit).

## 8. Critères d'acceptation

1. `npm run test`, `npm run typecheck`, `npm run build` verts.
2. `dist/index.html` unique, fonctionne en `file://` (aucune requête réseau).
3. Les 10 cas COMMENT-SPEC §6 testés et verts.
4. Un `.md` annoté dans l'app reste parfaitement rendu sur GitHub (marqueurs
   invisibles) et re-chargeable dans l'app avec ses fils complets.
5. Fallbacks fichiers opérationnels (l'app reste utilisable sans FS Access).
6. Aucun XSS : HTML brut du markdown sanitisé (test avec `<script>`,
   `onerror`, `javascript:`).
7. UI conforme au DESIGN-BRIEF, entièrement française, thème clair ET sombre.
