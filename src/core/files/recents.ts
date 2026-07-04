import { get, set } from 'idb-keyval';
import type { RecentEntry } from '../../types';

const RECENTS_KEY = 'pulse-markdown:recents';
const MAX_RECENTS = 8;

export async function loadRecents(): Promise<RecentEntry[]> {
  const stored = await get<RecentEntry[]>(RECENTS_KEY);
  return Array.isArray(stored) ? stored : [];
}

export async function addRecent(entry: RecentEntry): Promise<RecentEntry[]> {
  const current = await loadRecents();
  const deduped = current.filter((r) => r.id !== entry.id);
  const next = [entry, ...deduped].slice(0, MAX_RECENTS);
  await set(RECENTS_KEY, next);
  return next;
}

export async function removeRecent(id: string): Promise<RecentEntry[]> {
  const current = await loadRecents();
  const next = current.filter((r) => r.id !== id);
  await set(RECENTS_KEY, next);
  return next;
}

export type RecentPermissionResult = 'granted' | 'denied' | 'unavailable';

export async function ensureRecentPermission(entry: RecentEntry): Promise<RecentPermissionResult> {
  const handle = entry.handle;
  if (!handle || typeof handle.queryPermission !== 'function' || typeof handle.requestPermission !== 'function') {
    return 'unavailable';
  }
  try {
    const existing = await handle.queryPermission({ mode: 'readwrite' });
    if (existing === 'granted') return 'granted';
    const requested = await handle.requestPermission({ mode: 'readwrite' });
    return requested === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

/** Retire des récents les handles devenus invalides (fichier/dossier supprimé
 * ou déplacé depuis) : à appeler paresseusement à l'ouverture de l'app. */
export async function pruneDeadRecents(): Promise<RecentEntry[]> {
  const current = await loadRecents();
  const alive: RecentEntry[] = [];
  for (const entry of current) {
    if (!entry.handle || typeof entry.handle.queryPermission !== 'function') {
      alive.push(entry);
      continue;
    }
    try {
      await entry.handle.queryPermission({ mode: 'readwrite' });
      alive.push(entry);
    } catch {
      // handle mort : l'entrée est exclue des récents
    }
  }
  if (alive.length !== current.length) {
    await set(RECENTS_KEY, alive);
  }
  return alive;
}
