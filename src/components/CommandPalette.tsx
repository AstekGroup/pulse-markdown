import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  FileText,
  Filter,
  FolderOpen,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelRightClose,
  Printer,
  Save,
  Search,
  SkipBack,
  SkipForward,
  Sun,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from '../store';
import type { CommentFilter, DocFont, FileEntry, ThemeMode, TreeNode } from '../types';
import { navigateComment, SHORTCUTS, shortcutLabel } from '../hooks/useShortcuts';

type PaletteGroup = 'Fichiers' | 'Commentaires' | 'Affichage' | 'Actions';

interface PaletteItem {
  id: string;
  group: PaletteGroup;
  label: string;
  sublabel?: string;
  icon: LucideIcon;
  right?: ReactNode;
  run: () => void;
}

const GROUP_ORDER: PaletteGroup[] = ['Fichiers', 'Commentaires', 'Affichage', 'Actions'];

function flattenFiles(node: TreeNode): FileEntry[] {
  if (node.kind === 'file') return node.entry ? [node.entry] : [];
  return (node.children ?? []).flatMap(flattenFiles);
}

/** Score de correspondance par sous-séquence floue (aucune dépendance). */
function fuzzyScore(query: string, text: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  let score = 0;
  let streak = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 10 + streak * 4;
      streak += 1;
      qi += 1;
    } else {
      streak = 0;
    }
  }
  if (qi < q.length) return null;
  return score - t.length * 0.05;
}

function Kbd({ id }: { id: string }) {
  const def = SHORTCUTS.find((s) => s.id === id);
  if (!def) return null;
  return (
    <kbd className="flex-shrink-0 rounded-[var(--radius-s)] border border-[var(--ink-700)] bg-[var(--ink-800)] px-1.5 py-0.5 font-[var(--font-mono)] text-[11px] font-semibold leading-none text-[var(--ink-100)]">
      {shortcutLabel(def)}
    </kbd>
  );
}

function ActiveMark({ active }: { active: boolean }) {
  if (!active) return null;
  return <Check size={14} className="flex-shrink-0 text-[var(--pulse-bright)]" aria-hidden="true" />;
}

/**
 * Palette de commandes ⌘K (DESIGN-BRIEF §6) : commandes + fichiers du dossier
 * (fuzzy), groupes Fichiers / Commentaires / Affichage / Actions.
 */
export function CommandPalette() {
  const paletteOpen = useStore((s) => s.paletteOpen);
  const toggle = useStore((s) => s.toggle);
  const tree = useStore((s) => s.tree);
  const currentEntry = useStore((s) => s.currentEntry);
  const openEntry = useStore((s) => s.openEntry);
  const openFilePicker = useStore((s) => s.openFilePicker);
  const openFolderPicker = useStore((s) => s.openFolderPicker);
  const save = useStore((s) => s.save);
  const exportClean = useStore((s) => s.exportClean);
  const copyAiPrompt = useStore((s) => s.copyAiPrompt);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const docFont = useStore((s) => s.docFont);
  const setDocFont = useStore((s) => s.setDocFont);
  const sourceView = useStore((s) => s.sourceView);
  const commentFilter = useStore((s) => s.commentFilter);
  const setCommentFilter = useStore((s) => s.setCommentFilter);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!paletteOpen) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    setQuery('');
    setSelectedIndex(0);
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(raf);
      previouslyFocused.current?.focus?.();
    };
  }, [paletteOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const items = useMemo<PaletteItem[]>(() => {
    const fileEntries = new Map<string, FileEntry>();
    if (tree) for (const entry of flattenFiles(tree)) fileEntries.set(entry.id, entry);
    if (currentEntry) fileEntries.set(currentEntry.id, currentEntry);

    const fileItems: PaletteItem[] = Array.from(fileEntries.values()).map((entry) => ({
      id: `file-${entry.id}`,
      group: 'Fichiers',
      label: entry.name,
      sublabel: entry.path,
      icon: FileText,
      right:
        entry.commentCounts && entry.commentCounts.open > 0 ? (
          <span className="flex-shrink-0 rounded-full bg-[var(--pulse-bright)] px-1.5 py-0.5 text-[10px] font-bold leading-none text-[#04231f]">
            {entry.commentCounts.open}
          </span>
        ) : undefined,
      run: () => void openEntry(entry),
    }));

    const commentItems: PaletteItem[] = [
      {
        id: 'next-comment',
        group: 'Commentaires',
        label: 'Commentaire suivant',
        icon: SkipForward,
        right: <Kbd id="next-comment" />,
        run: () => navigateComment(1),
      },
      {
        id: 'prev-comment',
        group: 'Commentaires',
        label: 'Commentaire précédent',
        icon: SkipBack,
        right: <Kbd id="prev-comment" />,
        run: () => navigateComment(-1),
      },
      ...(
        [
          ['all', 'Filtrer : tous les commentaires'],
          ['open', 'Filtrer : commentaires ouverts'],
          ['resolved', 'Filtrer : commentaires résolus'],
        ] as [CommentFilter, string][]
      ).map(([value, label]) => ({
        id: `filter-${value}`,
        group: 'Commentaires' as const,
        label,
        icon: Filter,
        right: <ActiveMark active={commentFilter === value} />,
        run: () => setCommentFilter(value),
      })),
    ];

    const displayItems: PaletteItem[] = [
      {
        id: 'toggle-library',
        group: 'Affichage',
        label: 'Bibliothèque',
        icon: PanelLeftClose,
        right: <Kbd id="library" />,
        run: () => toggle('library'),
      },
      {
        id: 'toggle-comments',
        group: 'Affichage',
        label: 'Panneau commentaires',
        icon: PanelRightClose,
        right: <Kbd id="comments-panel" />,
        run: () => toggle('comments'),
      },
      {
        id: 'toggle-source',
        group: 'Affichage',
        label: sourceView ? 'Vue rendue' : 'Vue source',
        icon: Code2,
        right: <Kbd id="source-view" />,
        run: () => toggle('source'),
      },
      ...(
        [
          ['light', 'Thème : clair', Sun],
          ['dark', 'Thème : sombre', Moon],
          ['system', 'Thème : système', Monitor],
        ] as [ThemeMode, string, LucideIcon][]
      ).map(([value, label, icon]) => ({
        id: `theme-${value}`,
        group: 'Affichage' as const,
        label,
        icon,
        right: <ActiveMark active={theme === value} />,
        run: () => setTheme(value),
      })),
      ...(
        [
          ['serif', 'Police du document : éditorial'],
          ['sans', 'Police du document : sans-serif'],
        ] as [DocFont, string][]
      ).map(([value, label]) => ({
        id: `font-${value}`,
        group: 'Affichage' as const,
        label,
        icon: Type,
        right: <ActiveMark active={docFont === value} />,
        run: () => setDocFont(value),
      })),
    ];

    const actionItems: PaletteItem[] = [
      {
        id: 'open-file',
        group: 'Actions',
        label: 'Ouvrir un fichier',
        icon: FileText,
        right: <Kbd id="open-file" />,
        run: () => void openFilePicker(),
      },
      {
        id: 'open-folder',
        group: 'Actions',
        label: 'Ouvrir un dossier',
        icon: FolderOpen,
        right: <Kbd id="open-folder" />,
        run: () => void openFolderPicker(),
      },
      {
        id: 'save',
        group: 'Actions',
        label: 'Enregistrer',
        icon: Save,
        right: <Kbd id="save" />,
        run: () => void save(),
      },
      {
        id: 'export-clean',
        group: 'Actions',
        label: 'Exporter une copie propre',
        icon: Download,
        run: () => exportClean(),
      },
      {
        id: 'copy-ai-prompt',
        group: 'Actions',
        label: 'Copier le prompt IA',
        icon: Copy,
        run: () => copyAiPrompt(),
      },
      {
        id: 'print',
        group: 'Actions',
        label: 'Imprimer',
        icon: Printer,
        right: <Kbd id="print" />,
        run: () => window.print(),
      },
    ];

    return [...fileItems, ...commentItems, ...displayItems, ...actionItems];
  }, [
    tree,
    currentEntry,
    commentFilter,
    theme,
    docFont,
    sourceView,
    openEntry,
    openFilePicker,
    openFolderPicker,
    save,
    exportClean,
    copyAiPrompt,
    setCommentFilter,
    setTheme,
    setDocFont,
    toggle,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim();
    const scored = items
      .map((item) => ({ item, score: fuzzyScore(q, `${item.label} ${item.sublabel ?? ''}`) }))
      .filter((entry): entry is { item: PaletteItem; score: number } => entry.score !== null);
    scored.sort((a, b) => {
      const ga = GROUP_ORDER.indexOf(a.item.group);
      const gb = GROUP_ORDER.indexOf(b.item.group);
      if (ga !== gb) return ga - gb;
      return q ? b.score - a.score : 0;
    });
    return scored.map((entry) => entry.item);
  }, [items, query]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!paletteOpen) return null;

  function runItem(item: PaletteItem) {
    toggle('palette');
    item.run();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Tab') {
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => (filtered.length ? (i + 1) % filtered.length : 0));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[selectedIndex];
      if (item) runItem(item);
    }
  }

  const activeItem = filtered[selectedIndex];

  return (
    <div className="palette-backdrop" onClick={() => toggle('palette')}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Palette de commandes"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[var(--ink-700)] px-4 py-3">
          <Search size={16} className="flex-shrink-0 text-[var(--ink-300)]" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-listbox"
            aria-autocomplete="list"
            aria-activedescendant={activeItem ? `palette-item-${activeItem.id}` : undefined}
            placeholder="Rechercher une commande ou un fichier…"
            className="min-w-0 flex-1 bg-transparent font-[var(--font-sans)] text-[14px] text-white outline-none placeholder:text-[var(--ink-300)]"
          />
        </div>

        <div id="palette-listbox" role="listbox" ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
          {filtered.length === 0 && (
            <p className="px-3 py-8 text-center text-[13px] text-[var(--ink-300)]">Aucun résultat.</p>
          )}
          {GROUP_ORDER.map((group) => {
            const groupItems = filtered.filter((item) => item.group === group);
            if (groupItems.length === 0) return null;
            return (
              <div key={group} className="mb-2 last:mb-0">
                <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-300)]">
                  {group}
                </div>
                {groupItems.map((item) => {
                  const index = filtered.indexOf(item);
                  const active = index === selectedIndex;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      id={`palette-item-${item.id}`}
                      role="option"
                      aria-selected={active}
                      data-index={index}
                      type="button"
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => runItem(item)}
                      className={`flex w-full items-center gap-3 rounded-[var(--radius-m)] px-3 py-2 text-left transition-colors ${
                        active ? 'bg-[var(--pulse-soft)] text-white' : 'text-[var(--ink-100)]'
                      }`}
                    >
                      <Icon size={15} className="flex-shrink-0 text-[var(--ink-300)]" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-[var(--font-sans)] text-[13px]">{item.label}</span>
                        {item.sublabel && (
                          <span className="block truncate text-[11px] text-[var(--ink-300)]">{item.sublabel}</span>
                        )}
                      </span>
                      {item.right}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
