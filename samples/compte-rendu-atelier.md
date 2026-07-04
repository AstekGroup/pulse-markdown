# Compte-rendu d'atelier — Architecture Pulse Markdown

## Participants

- Marie Dupont (Product Lead)
- Thomas Ferrand (Architecture)
- Lisa Chen (Front-end)
- Nadia Khouya (DevOps)

**Date** : 4 juillet 2026, 09 h – 12 h
**Lieu** : Salle Ionesco, Astek Paris
**Objectif** : Valider l'architecture de la plateforme de lecture/annotation.

## Décisions principales

Après deux heures de discussions, le groupe a tranché sur trois points critiques.

### 1. Stack technologique

Stack confirmée : **React 19 + TypeScript strict**, Tailwind CSS v4 pour l'UI, markdown-it pour le parsing. Pas de backend API : **application 100 % locale** (File System Access API avec fallbacks). Préférences persistées en localStorage et IndexedDB.

<!--pulse:comment
{
  "v": 1,
  "id": "pc-a9x4qm",
  "status": "open",
  "author": "Nadia Khouya",
  "createdAt": "2026-07-04T09:30:00+02:00",
  "text": "Avons-nous validé le comportement sur les fichiers volumineux (> 100 Mo) ? Les images embarquées vont alourdir les échanges.",
  "anchor": {
    "quote": "application 100 % locale",
    "prefix": "Pas de backend API : ",
    "suffix": " (File System",
    "heading": "1. Stack technologique",
    "blockType": "paragraph"
  },
  "replies": []
}
-->

### 2. Format des commentaires embarqués

Le groupe valide la **spécification v1** : commentaires HTML stockés dans le Markdown, JSON pretty-printé. Chaque commentaire porte un identifiant unique `pc-*`, des réponses, et un état (open/resolved). Le marqueur est invisible dans GitHub.

> « C'est le cœur de la valeur : le document reste autoportant. »

<!--pulse:comment
{
  "v": 1,
  "id": "pc-k2v6rt",
  "status": "open",
  "author": "Lisa Chen",
  "createdAt": "2026-07-04T10:15:00+02:00",
  "text": "Je propose de tester la pulsation de l'ancre sur mobile, pour vérifier que l'animation n'est pas trop agressive.",
  "anchor": {
    "quote": "le document reste autoportant",
    "prefix": "« C'est le cœur de la valeur : ",
    "suffix": ". »",
    "heading": "2. Format des commentaires embarqués",
    "blockType": "blockquote"
  },
  "replies": [
    {
      "author": "Thomas Ferrand",
      "createdAt": "2026-07-04T11:00:00+02:00",
      "text": "Bonne idée. C'est couvert par prefers-reduced-motion, c'est prévu dans le DESIGN-BRIEF."
    }
  ]
}
-->

### 3. Point ouvert — Édition avancée

Faut-il supporter l'édition directe du JSON par les utilisateurs avancés, ou uniquement par l'interface ? La décision a porté sur **l'interface exclusivement** ; si un utilisateur modifie les marqueurs en brut, ils sont traités comme malformés.

<!--pulse:comment
{
  "v": 1,
  "id": "pc-n1b8sp",
  "status": "resolved",
  "author": "Marie Dupont",
  "createdAt": "2026-07-04T11:30:00+02:00",
  "text": "Faut-il documenter le format pour les clients qui voudraient écrire leur propre outillage ?",
  "anchor": {
    "quote": "si un utilisateur modifie les marqueurs en brut, ils sont traités comme malformés",
    "prefix": "l'interface exclusivement** ; ",
    "suffix": ".",
    "heading": "3. Point ouvert — Édition avancée",
    "blockType": "paragraph"
  },
  "replies": [
    {
      "author": "Thomas Ferrand",
      "createdAt": "2026-07-04T13:45:00+02:00",
      "text": "Fait : la spécification complète est publiée dans docs/COMMENT-SPEC.md du dépôt."
    }
  ],
  "resolvedBy": "Thomas Ferrand",
  "resolvedAt": "2026-07-04T14:00:00+02:00"
}
-->

## Prochaines étapes

- Prototyper l'interface de sélection/commentaire (Lisa, 5 j)
- Valider la sanitisation DOMPurify avec des cas d'attaque XSS (Thomas, 3 j)
- Tester les fallbacks fichiers sur Safari/Firefox (Nadia, 2 j)

---

*Rédigé par : Thomas Ferrand — 04/07/2026*
