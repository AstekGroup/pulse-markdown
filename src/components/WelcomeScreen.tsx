import { useState } from 'react';
import { FileText, FolderOpen, FolderTree, Sparkles, UploadCloud } from 'lucide-react';
import { useStore } from '../store';
import type { RecentEntry } from '../types';
import iconWhite from '../assets/pulse-icon-white.svg';

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days} j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function RecentRow({ recent }: { recent: RecentEntry }) {
  const openRecent = useStore((s) => s.openRecent);
  const Icon = recent.kind === 'dir' ? FolderTree : FileText;
  return (
    <li>
      <button type="button" className="welcome-recent" onClick={() => void openRecent(recent)}>
        <Icon size={16} aria-hidden="true" />
        <span className="welcome-recent__name">{recent.name}</span>
        <span className="welcome-recent__date">{formatRelative(recent.openedAt)}</span>
      </button>
    </li>
  );
}

export function WelcomeScreen() {
  const recents = useStore((s) => s.recents);
  const openFilePicker = useStore((s) => s.openFilePicker);
  const openFolderPicker = useStore((s) => s.openFolderPicker);
  const loadDemo = useStore((s) => s.loadDemo);
  const toggle = useStore((s) => s.toggle);
  const [dragActive, setDragActive] = useState(false);

  return (
    <div className="welcome-screen">
      <div className="welcome-halo" aria-hidden="true" />
      <svg className="welcome-waves" viewBox="0 0 800 600" aria-hidden="true" preserveAspectRatio="none">
        <path d="M0,150 C150,100 250,200 400,150 C550,100 650,200 800,150" />
        <path d="M0,280 C150,230 250,330 400,280 C550,230 650,330 800,280" />
        <path d="M0,410 C150,360 250,460 400,410 C550,360 650,460 800,410" />
      </svg>

      <div className="welcome-content">
        <div className="welcome-step welcome-brand">
          <img src={iconWhite} alt="" width={40} height={50} />
          <h1 className="welcome-title">Pulse Markdown</h1>
          <p className="welcome-subtitle">
            Lisez, annotez et partagez vos documents Markdown — sans rien installer.
          </p>
        </div>

        <div
          className={`welcome-step welcome-dropzone${dragActive ? ' is-active' : ''}`}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
          }}
        >
          <UploadCloud size={28} aria-hidden="true" />
          <p>Déposez un fichier ou un dossier Markdown ici</p>
        </div>

        <div className="welcome-step welcome-actions">
          <button type="button" className="btn btn--primary btn--lg" onClick={() => void openFilePicker()}>
            <FileText size={16} />
            Ouvrir un fichier
          </button>
          <button type="button" className="btn btn--secondary btn--lg" onClick={() => void openFolderPicker()}>
            <FolderOpen size={16} />
            Ouvrir un dossier
          </button>
          <button type="button" className="btn btn--ghost btn--lg" onClick={loadDemo}>
            <Sparkles size={16} />
            Voir un exemple
          </button>
        </div>

        {recents.length > 0 && (
          <div className="welcome-step welcome-recents">
            <ul>
              {recents.map((r) => (
                <RecentRow key={r.id} recent={r} />
              ))}
            </ul>
          </div>
        )}

        <div className="welcome-step welcome-footer">
          <p>100 % local — vos fichiers ne quittent jamais votre ordinateur.</p>
          <button type="button" className="link-button" onClick={() => toggle('shortcuts')}>
            ? Raccourcis
          </button>
        </div>
      </div>
    </div>
  );
}
