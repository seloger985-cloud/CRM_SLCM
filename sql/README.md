# sql/ — le schéma de la base, versionné

Ce dossier existe pour une raison précise : **toute la sécurité du CRM repose
sur le RLS de Supabase.**

La clé anon publiée dans `assets/js/config.js` est publique par construction —
elle est servie à chaque navigateur, on ne peut pas la cacher. Ce n'est pas un
secret, c'est un identifiant de projet. Ce qui protège réellement les données,
ce sont les politiques `row level security` déclarées côté base.

Tant que ces politiques ne vivent que dans le tableau de bord Supabase :

- personne ne peut les relire sans y avoir accès ;
- rien ne signale qu'une politique a été désactivée ou modifiée ;
- le projet n'est pas reconstructible s'il est perdu ;
- toute question sur le schéma exige un aller-retour manuel dans le dashboard.

## Les fichiers

| Fichier | Rôle |
|---|---|
| `00_introspection.sql` | Ne modifie rien. Lit la base et régénère les deux fichiers ci-dessous. |
| `01_schema.sql` | Tables, colonnes, contraintes, index. |
| `02_rls.sql` | Activation du RLS et politiques de sécurité. C'est le fichier que `config.js` cite en référence. |
| `05_activity_outcome.sql` | **Migration** — donne à une activité son issue et sa suite. À jouer AVANT d'utiliser le bloc « Suite » du formulaire. |
| `06_property_matching.sql` | **Migration** — rend une fiche bien du CRM rapprochable : `rent_sale`, `bedrooms`, `furnished`, et `shared_listings.listing_id` élargi en `text`. |
| `03_demands.sql` | **Migration** — sort les critères de recherche de la fiche client vers une table `demands`. Contrairement aux autres, ce fichier modifie la base. |
| `04_property_types.sql` | **Migration** — élargit `properties_type_check` aux onze types du site. À jouer AVANT d'enregistrer un bien d'un type autre que maison ou appartement. |

## Mettre à jour après un changement de schéma

1. Dashboard Supabase → projet **`dukwtseqticijlvrmkgz`**
   (le CRM — **pas** `hozlyddiqodvjguqywty`, qui est la base du site public).
2. **SQL Editor → New query**, coller `00_introspection.sql`, **Run**.
3. Exporter le résultat, puis recopier les lignes dans `01_schema.sql`
   (séquences 1 à 3) et `02_rls.sql` (séquences 4 et 5).
4. Committer. Le dépôt redevient la source de vérité.

## Deux projets Supabase, à ne pas confondre

| Projet | Référence | Contenu | Accès depuis le CRM |
|---|---|---|---|
| CRM | `dukwtseqticijlvrmkgz` | clients, biens, activités, tâches, paiements, factures, historique d'envois | lecture / écriture, session authentifiée |
| Site | `hozlyddiqodvjguqywty` | annonces publiques de selogercm.com | lecture seule, via `assets/js/site.js` |

Ce dossier ne décrit **que** la base du CRM. Les annonces du site ne sont jamais
copiées dans le CRM : elles sont lues en direct (voir l'en-tête de `site.js`).

## Migrations

Les fichiers numérotés à partir de `03_` **modifient** la base, contrairement
à `00`–`02` qui la décrivent. Après en avoir joué un : relancer
`00_introspection.sql`, remplacer `01_schema.sql` et `02_rls.sql`, puis
`node tests/run.js` — sans quoi `check-columns` compare le code à un schéma
périmé et dit le contraire de la réalité.

## Écarts entre le code et le schéma — au 31/08/2026

Relevés en comparant l'export à `assets/js/app.js`. Le détail est en fin de
`01_schema.sql`.

- **`payments` : bloquant.** `TABLE_COLS.payments` réclame des colonnes
  `accompte` et `reste` qui n'existent pas. PostgREST rejette donc toute
  lecture de la table : l'écran Paiements est toujours vide, le chiffre
  d'affaires du tableau de bord vaut toujours 0, et aucune relance de
  paiement n'est jamais proposée. Le formulaire propose en plus les statuts
  `accompte` et `reste`, que `payments_status_check` refuse.
- **`clients` : cosmétique.** `address`, `district` et `niu` existent, sont
  renseignées par `facture.html`, mais n'apparaissent pas dans le formulaire
  client du CRM. Aucune perte de données.
- **`invoices` : à savoir.** Seule table sans `owner_id`.

## Points confirmés

- `properties_type_check` élargie aux onze types du site (31/08/2026,
  migration `04` jouée). Le portefeuille ne comptait alors que des
  appartements et des maisons : aucune donnée à reprendre, la contrainte
  ayant été élargie et non restreinte.

- La table `demands` (31/08/2026) : treize colonnes, types et valeurs par
  défaut confirmés par introspection. `owner_id` a bien `auth.uid()` en
  défaut, `active` est `not null default true`, `created_at` porte le fuseau.

- `shared_listings` est correctement construite : `owner_id` par défaut à
  `auth.uid()`, index `uniq_shared` unique sur `(owner_id, client_id,
  listing_id)` — condition technique du `onConflict` de `match.js` — et une
  politique unique, réellement cloisonnée par agent.
- `activities` accepte bien le type `visit`, contrairement à ce qu'indique
  l'ancien README à la racine du dépôt.
- Le RLS est actif sur les sept tables.
- `properties` est protégée contre l'import en double d'une même annonce par
  l'index partiel `uniq_properties_listing`.
