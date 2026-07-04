# DESIGN BRIEF — Pulse Markdown

## 1. Direction : « l'épreuve d'imprimeur »

Pulse Markdown est une **salle de lecture** : on y relit des documents comme on
annote une épreuve papier de qualité, au feutre vert, dans un atelier calme.
Deux matières se répondent :

- **L'encre** : le chrome applicatif (rails, barres, panneaux) est sombre,
  profond, vert nuit (#042326) — il se fait oublier.
- **Le papier** : la zone de lecture est claire, chaude, généreuse — c'est la
  star. Le document est composé comme un bel imprimé.

Le vert Pulse n'apparaît que là où la main agit : ancres de commentaires,
actions, focus. Rare donc précieux. L'impression d'ensemble : sobre, précis,
haut de gamme — jamais « outil de dev », jamais « app IA générique ».

**Le détail mémorable** : les commentaires vivent dans la marge comme des
annotations de marge d'imprimeur, reliés à leur passage par un trait fin vert
qui « respire » quand on les active.

## 2. Tokens (source de vérité : `src/styles/tokens.css`)

Couleurs (charte Pulse : #02735E vert, #00C072 vert vif, #042326 vert nuit) :

```css
:root {
  /* encre (chrome) */
  --ink-900:#042326; --ink-800:#0a3136; --ink-700:#123f45;
  --ink-300:#7ba3a3; --ink-100:#d7e4e2;
  /* papier (lecture) — blanc cassé chaud, jamais #fff pur */
  --paper:#faf9f6; --paper-raised:#ffffff; --paper-edge:#e8e5dd;
  --text:#1d2a28; --text-muted:#5c6f6b;
  /* marque */
  --pulse:#02735E; --pulse-bright:#00C072; --pulse-soft:rgba(2,115,94,.08);
  /* sémantique */
  --warn:#b45309; --danger:#b3261e;
  --highlight:rgba(0,192,114,.16);          /* surbrillance d'ancre */
  --highlight-active:rgba(0,192,114,.30);
  --radius-s:6px; --radius-m:10px; --radius-l:14px;
  --shadow-card:0 1px 2px rgba(4,35,38,.06),0 8px 24px -12px rgba(4,35,38,.18);
}
[data-theme=dark] {
  --paper:#0d2225; --paper-raised:#123034; --paper-edge:#1d4046;
  --text:#e6efed; --text-muted:#93aca9;
  --pulse:#00C072; /* sur fond sombre, le vert vif devient le primaire (charte : jamais #02735E sur sombre) */
  --pulse-soft:rgba(0,192,114,.10);
  --highlight:rgba(0,192,114,.14); --highlight-active:rgba(0,192,114,.28);
  --shadow-card:0 1px 2px rgba(0,0,0,.3),0 8px 24px -12px rgba(0,0,0,.5);
}
```

Typographies (embarquées en base64, `font-display:swap`, subset latin) :

- **Chillax** (variable) — display : wordmark, titres d'écran d'accueil,
  numéros/compteurs. Signature de la marque.
- **Poppins** (400/500/600, italic 400) — UI et texte courant du document en
  mode « sans ».
- **Source Serif 4** (variable + italique) — mode lecture « Éditorial » du
  document (toggle `docFont`). C'est le mode par défaut : c'est lui qui donne
  le cachet « bel imprimé ».
- **JetBrains Mono** (400/600) — code, vue source, kbd.

Si un téléchargement de fonte échoue au scaffold : continuer avec la pile de
repli (`system-ui`…), ne jamais bloquer le build.

## 3. Layout

```
┌──────┬────────────────────────────────────────────┬──────────┐
│ rail │  topbar (papier, hairline en bas)          │          │
│ encre├────────────────────────────────────────────┤  marge   │
│ 288px│      colonne document, max 72ch,           │ commen-  │
│ arbo │      padding généreux (96px haut)          │ taires   │
│      │      TOC flottante à gauche du texte       │ 340px    │
│      ├────────────────────────────────────────────┤          │
│      │  statusbar (hairline haut, texte 12px)     │          │
└──────┴────────────────────────────────────────────┴──────────┘
```

- **Rail bibliothèque** (gauche, fond `--ink-900`, texte clair) : logo Pulse
  icône + « Pulse Markdown » en Chillax, arborescence du dossier, badges verts
  « n ouverts ». Repliable (⌘\). Absent si fichier seul → rail réduit à 56px
  (logo + actions).
- **Topbar** (papier) : nom du fichier (+ fil d'ariane du dossier), état de
  sauvegarde (● ambre « Non enregistré » / ✓ « Enregistré »), actions :
  Commenter, Enregistrer (primaire), menu ⋯ (Exporter copie propre, Copier le
  prompt IA, Imprimer, Vue source, Thème, Police du document).
- **Marge commentaires** (droite, fond papier légèrement teinté) : cartes
  alignées, repliable (⌘⇧C). < 1280px : la marge devient un panneau
  coulissant. Mobile (< 768px) : lecture seule confortable, commentaires en
  feuille du bas.
- **Barre de progression de lecture** : filet 2px `--pulse-bright` collé sous
  la topbar, largeur = progression du scroll.

## 4. Le document (`document.css`, classe `.pulse-doc`)

Composition éditoriale exigeante — c'est le cœur de la valeur perçue :

- Corps 17px/1.75 (serif par défaut), largeur 72ch, `text-wrap:pretty`,
  césure française (`hyphens:auto`, lang=fr).
- H1 Chillax 600 2.2rem, filet fin sous le H1 ; H2 1.5rem avec ancre « # » au
  survol ; H3 1.17rem. `scroll-margin-top:96px`.
- Liens : couleur `--pulse`, soulignement 1px décalé, hover fond `--pulse-soft`.
- `blockquote` : barre 3px `--pulse`, fond `--pulse-soft`, italique.
- Tableaux : en-tête petites majuscules, lignes zébrées subtiles, coins
  arrondis, débordement horizontal scrollable.
- Code inline : fond `--paper-edge`, JetBrains Mono 0.9em. Blocs : fond encre
  (même en thème clair — beau contraste), langue affichée en étiquette,
  bouton copier au survol.
- Cases à cocher (task lists) rendues en vraies cases stylées (désactivées).
- Images : max 100%, coins arrondis, légère ombre ; `figcaption` si title.
- Notes de bas de page : filet + taille réduite.
- **Ancres de commentaires** : `mark.pulse-anchor` fond `--highlight`,
  soulignement pointillé vert ; état actif : `--highlight-active` + animation
  `anchor-pulse` (2 pulsations douces). Gouttière droite : au survol d'un bloc,
  bouton rond ⊕ discret (opacité 0 → 1, 120ms).

## 5. Écran d'accueil (zéro-state) — le moment « waouh »

Fond encre plein écran, très léger motif d'onde/pouls en arrière-plan (SVG
inline, opacité 4 %), halo radial vert très diffus. Au centre :

1. Icône Pulse (blanche) puis wordmark « Pulse Markdown » en Chillax 44px,
   sous-titre Poppins : « Lisez, annotez et partagez vos documents Markdown —
   sans rien installer. »
2. **Zone de dépôt** : grande carte à bord pointillé `--ink-300`, coins 14px ;
   au drag-over : bord `--pulse-bright`, fond `--pulse-soft`, léger scale.
   Texte : « Déposez un fichier ou un dossier Markdown ici ».
3. Trois actions : [Ouvrir un fichier] (primaire vert), [Ouvrir un dossier],
   [Voir un exemple] (ghost).
4. Récents (si présents) : liste sobre, nom + date relative.
5. Pied : « 100 % local — vos fichiers ne quittent jamais votre ordinateur. »
   + « ? Raccourcis ».

Entrée en scène : apparitions décalées (opacity+translateY, 80ms d'écart,
400ms, ease-out). Une seule chorégraphie, pas d'animations gadgets ensuite.

## 6. Raccourcis (power users) — table unique dans `useShortcuts.ts`

| Touche | Action | | Touche | Action |
|---|---|---|---|---|
| ⌘O | Ouvrir un fichier | | ⌘K | Palette de commandes |
| ⌘⇧O | Ouvrir un dossier | | ⌘E | Vue source ⇄ rendu |
| ⌘S | Enregistrer | | ⌘\ | Bibliothèque |
| ⌘P | Imprimer | | ⌘⇧C | Panneau commentaires |
| c | Commenter la sélection/le bloc | | n / p | Commentaire suivant/précédent |
| ⌘⏎ | Envoyer (composer) | | ? | Aide raccourcis |
| Échap | Fermer (palette, composer, aide) | | | |

Règles : ⌘ sur macOS, Ctrl ailleurs (afficher le bon symbole) ; les raccourcis
à lettre seule sont inactifs quand le focus est dans un champ de saisie.
La **palette ⌘K** (style Raycast, fond encre, bordure hairline) expose toutes
les commandes + les fichiers du dossier (fuzzy), groupes « Fichiers /
Commentaires / Affichage », navigation flèches + ⏎.

## 7. Commentaires (UX)

- **Carte** : avatar = initiales dans une pastille verte, nom 600, date
  relative (« il y a 2 h »), texte, actions au survol (Répondre, Résoudre ✓,
  Supprimer). Résolu : carte atténuée, coche verte, texte barré nulle part
  (jamais barrer le contenu). Fil replié au-delà de 2 réponses (« 3 réponses »).
- **Composer** : textarea auto-extensible, placeholder « Votre commentaire… »,
  hint « ⌘⏎ pour envoyer », boutons Annuler / Commenter (primaire).
- **Sélection → pilule** : bouton flottant « 💬 Commenter » au-dessus de la
  sélection (position via rect), disparaît au scroll/clic ailleurs.
- **Filtres** : segmented control Tous · Ouverts (n) · Résolus ; état vide :
  « Aucun commentaire — sélectionnez un passage pour commencer. »
- **Orphelins** : bandeau ⚠ « Repère perdu — le texte visé a changé », la
  carte reste utilisable.
- Carte active ⇄ ancre : survol d'une carte = pré-surbrillance de l'ancre ;
  clic = scroll doux + pulsation ; clic sur une ancre = focus de la carte.

## 8. Microcopie (français impeccable)

Ton : direct, chaleureux, professionnel. Vouvoiement. Jamais de jargon
(« fichier », « dossier », « enregistrer » — pas « repo », « commit »).
Toasts : « Commentaire ajouté — pensez à enregistrer », « Document
enregistré », « Copie sans commentaires téléchargée », « Prompt copié dans le
presse-papier », « Ce navigateur ne permet pas d'enregistrer directement : le
fichier a été téléchargé ». Dialogue identité : « Comment doit-on vous
appeler ? » + hint « Votre nom signera vos commentaires, rien ne quitte cet
ordinateur. » Interdits (règles maison) : « au final », « voire même »,
« malgré que », « solutionner », « au jour d'aujourd'hui », « pallier à ».

## 9. Accessibilité & finitions

- Contrastes AA partout (vérifier `--text-muted` sur `--paper`).
- Focus visible : anneau 2px `--pulse-bright` décalé 2px, jamais supprimé.
- Palette et dialogues : focus trap, `role=dialog`, `aria-modal`, Échap.
- Cibles cliquables ≥ 32px ; `prefers-reduced-motion` : désactiver la choré
  d'entrée et la pulsation.
- `aria-live=polite` pour les toasts et l'état de sauvegarde.
- Thème : `data-theme` sur `<html>`, suit `system` par défaut, toggle 3 états.
- Scrollbars fines stylées ; sélection de texte teintée vert
  (`::selection { background:var(--highlight-active) }`).
