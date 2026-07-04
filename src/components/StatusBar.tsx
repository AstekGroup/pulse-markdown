import { Clock, HardDrive, Type } from 'lucide-react';
import { useStore } from '../store';
import { useAppContentScrollFraction } from '../hooks/useSelectionAnchor';

export function StatusBar() {
  const rendered = useStore((s) => s.rendered);
  const saveMode = useStore((s) => s.saveMode);
  const docFont = useStore((s) => s.docFont);
  const percent = Math.round(useAppContentScrollFraction() * 100);

  return (
    <div className="statusbar">
      <span className="statusbar__item">{rendered?.words ?? 0} mots</span>
      <span className="statusbar__sep" aria-hidden="true">
        ·
      </span>
      <span className="statusbar__item">
        <Clock size={12} aria-hidden="true" />
        {rendered?.minutes ?? 0} min de lecture
      </span>
      <span className="statusbar__sep" aria-hidden="true">
        ·
      </span>
      <span className="statusbar__item">{percent}%</span>
      <span className="statusbar__spacer" />
      <span className="statusbar__item">
        <Type size={12} aria-hidden="true" />
        Police : {docFont === 'serif' ? 'Éditoriale' : 'Sans'}
      </span>
      <span className="statusbar__sep" aria-hidden="true">
        ·
      </span>
      <span className="statusbar__item">
        <HardDrive size={12} aria-hidden="true" />
        {saveMode === 'inplace' ? 'Édition directe' : 'Enregistrement par téléchargement'}
      </span>
    </div>
  );
}
