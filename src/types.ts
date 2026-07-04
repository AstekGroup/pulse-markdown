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
