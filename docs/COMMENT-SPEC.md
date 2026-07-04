# Spécification — Commentaires Pulse embarqués dans le Markdown (v1)

Objectif : rendre un fichier Markdown **autoportant** — le document ET ses
commentaires de relecture vivent dans le même fichier `.md`, sans base de
données ni service. Les commentaires sont **invisibles** dans tout rendu
Markdown standard (GitHub, VS Code, pandoc…) et **lisibles par une IA** qui
relit le fichier brut.

## 1. Format du marqueur

Un commentaire (= un fil de discussion) est un commentaire HTML placé **entre
deux blocs, au niveau racine du document**, immédiatement **après** le bloc
qu'il annote :

```markdown
Le chiffre d'affaires du T3 progresse de 12 % sur la région Nord.

<!--pulse:comment
{
  "v": 1,
  "id": "pc-x7k2m9",
  "status": "open",
  "author": "Marie Dupont",
  "createdAt": "2026-07-04T14:32:00+02:00",
  "text": "Peut-on préciser la source de ce chiffre ? Il me semble daté de mars.",
  "anchor": {
    "quote": "progresse de 12 % sur la région Nord",
    "prefix": "d'affaires du T3 ",
    "suffix": ".",
    "heading": "Résultats commerciaux",
    "blockType": "paragraph"
  },
  "replies": [
    { "author": "Thomas F.", "createdAt": "2026-07-04T15:01:00+02:00", "text": "Bien vu, je mets à jour avec les chiffres de juin." }
  ]
}
-->

## Section suivante
```

### Grammaire stricte

- Ligne d'ouverture : exactement `<!--pulse:comment` en **colonne 0** (rien d'autre sur la ligne).
- Corps : un objet **JSON** pretty-printé (2 espaces), UTF-8. Le corps ne doit
  jamais contenir la séquence `-->` (l'échappement JSON `-->` n'est
  pas requis : on **valide à l'écriture** que les champs texte ne contiennent
  pas `-->` ; si un utilisateur la saisit, on la remplace par `-- >`).
- Ligne de fermeture : exactement `-->` en colonne 0, seule sur sa ligne.
- Le marqueur est **entouré d'une ligne vide** avant et après (à l'écriture).
- Un marqueur = un fil : les réponses sont dans `replies`, jamais dans un
  marqueur séparé.

### Schéma JSON (v1)

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `v` | `1` | oui | version du format |
| `id` | string | oui | identifiant stable `pc-` + 6 caractères base36 |
| `status` | `"open"` \| `"resolved"` | oui | état du fil |
| `author` | string | oui | nom affiché du relecteur |
| `createdAt` | string ISO 8601 (avec fuseau) | oui | date de création |
| `text` | string | oui | corps du commentaire (peut être multi-ligne via `\n`) |
| `anchor` | objet | oui | ancrage (voir ci-dessous) |
| `anchor.quote` | string ≤ 200 car. | oui | extrait exact du texte visé (texte brut, pas le markdown) |
| `anchor.prefix` | string ≤ 32 car. | non | contexte immédiat avant la quote |
| `anchor.suffix` | string ≤ 32 car. | non | contexte immédiat après la quote |
| `anchor.heading` | string \| null | non | titre de la section la plus proche au-dessus |
| `anchor.blockType` | string | non | `paragraph`, `heading`, `list`, `table`, `code`, `blockquote`, `image`, `diagram`, `other` |
| `replies` | tableau | oui (peut être vide) | `{ author, createdAt, text }` |
| `resolvedBy` | string | non | qui a résolu |
| `resolvedAt` | string ISO | non | quand |

Champs inconnus : **préservés** à la réécriture (tolérance ascendante).

## 2. Règles de parsing

1. Scanner le fichier **ligne par ligne** en suivant l'état des blocs de code
   clôturés (``` ou ~~~, y compris clôtures ≥ 4 backticks : une clôture ne
   ferme que si elle a au moins autant de caractères que l'ouverture, même
   caractère, et pas de texte après). Un marqueur situé **dans un bloc de code
   clôturé est du contenu**, pas un commentaire.
2. Un marqueur ne peut pas commencer dans un bloc de code indenté : exiger la
   colonne 0 suffit à l'exclure.
3. JSON invalide ou champs obligatoires manquants → le marqueur est conservé
   tel quel dans le fichier, le commentaire est exposé comme `malformed: true`
   (affiché « Commentaire illisible » côté UI, jamais supprimé ni réécrit).
4. **Aucune donnée n'est jamais perdue** : la réécriture du fichier ne touche
   que les lignes des marqueurs concernés par une mutation. Le reste du
   document est recopié octet pour octet.
5. Fins de ligne : détecter le style dominant (`\r\n` vs `\n`) à la lecture,
   travailler en `\n` en interne, **restituer le style d'origine** à l'écriture.
   Préserver un éventuel BOM UTF-8 en tête de fichier.

## 3. Règles d'ancrage

- **Position primaire** : le marqueur est placé immédiatement après le bloc
  racine annoté. Au chargement, le bloc cible = le bloc racine **précédant** le
  marqueur (via les line-maps du parseur Markdown sur le contenu débarrassé des
  marqueurs).
- **Ancrage secondaire (résilience)** : si le document a été modifié hors de
  l'application et que la position ne colle plus (la `quote` n'apparaît pas
  dans le bloc précédent), rechercher la `quote` dans tout le document
  (normalisation des espaces), départager les occurrences multiples avec
  `prefix`/`suffix` puis par proximité de la position d'origine.
- **Orphelin** : si la quote est introuvable, le commentaire reste visible dans
  le panneau avec un état « repère perdu » (⚠), rattaché à `anchor.heading` si
  possible. Il n'est jamais supprimé automatiquement.
- Bloc imbriqué (item de liste, cellule de tableau) : le marqueur s'attache au
  **bloc racine englobant** (la liste, le tableau) ; la `quote` précise la cible.
  On n'insère **jamais** un marqueur à l'intérieur d'une liste, d'un tableau ou
  d'une citation (cela casserait le rendu d'autres outils).
- Diagramme (Mermaid) : l'ancrage visuel se fait au **bloc entier** (le
  conteneur du diagramme rendu), jamais dans les nœuds internes du SVG — la
  `quote` reste informative, pour les relecteurs humains comme pour une IA.
- Cas limite : commentaire sur le tout dernier bloc → marqueur en fin de
  fichier, précédé d'une ligne vide, suivi d'une fin de ligne finale.

## 4. Mutations (API pure)

Chaque mutation est une fonction pure `(sourceActuel, …) → nouveauSource` ;
l'application re-parse ensuite le résultat (source de vérité unique = le texte).

- `addComment` : insère un marqueur après le bloc cible.
- `updateCommentText`, `setStatus`, `addReply`, `deleteComment` : réécrivent ou
  suppriment **uniquement** les lignes du marqueur visé (+ la ligne vide
  excédentaire en cas de suppression).
- `stripAllComments` : retourne le document sans aucun marqueur `pulse:comment`
  (export « copie propre »). Les lignes vides résiduelles sont dédoublonnées
  (jamais plus de 2 consécutives à l'endroit d'un retrait).

## 5. Lisibilité IA

Le format est du JSON explicite dans un commentaire HTML : toute IA lisant le
fichier brut comprend `status`, `author`, `text`, `anchor.quote` sans
documentation. L'application propose de plus un bouton « Copier le prompt de
relecture IA » qui produit :

```text
Ce document Markdown contient des commentaires de relecture embarqués dans des
marqueurs <!--pulse:comment … --> (JSON : author, text, status, anchor.quote =
extrait visé, replies). Traite chaque commentaire au statut "open" : applique
la correction demandée au texte visé par anchor.quote, puis passe le marqueur
correspondant à "status": "resolved" en ajoutant une reply signée de ton nom
résumant la modification. Ne supprime aucun marqueur.
```

## 6. Cas de test obligatoires (moteur)

1. Aller-retour : `parse` puis mutations puis `parse` — le corps du document
   est intact octet pour octet (hors lignes de marqueurs).
2. Marqueur dans un bloc de code clôturé → traité comme contenu.
3. Fichier CRLF → réécrit en CRLF ; fichier avec BOM → BOM préservé.
4. JSON malformé → préservé, exposé `malformed`.
5. Commentaire sur le dernier bloc, sur un titre, après un tableau, après une
   liste imbriquée, sur un bloc de code.
6. Deux commentaires sur le même bloc → deux marqueurs consécutifs, ordre stable.
7. `deleteComment` ne laisse pas de triple ligne vide.
8. Texte utilisateur contenant `-->` → neutralisé en `-- >` à l'écriture.
9. Document vide / document sans commentaire / marqueur en toute fin sans \n final.
10. Champs inconnus dans le JSON → préservés après `setStatus`.
