# CRM SE LOGER CM

Back-office de l'agence immobilière SE LOGER CM, à Douala. Un seul agent
l'utilise. Pas de build, pas de dépendances à installer : trois pages HTML,
six fichiers JavaScript, une feuille de style. On ouvre, ça marche.

Il accompagne le site public [selogercm.com](https://selogercm.com), dont il
lit les annonces en direct — sans jamais les recopier.

## Ce qu'il fait

| Écran | Rôle |
|---|---|
| **Tableau de bord** | Ce qui attend, ce qui entre, ce qui est engagé, ce qui est encaissé. |
| **Clients** | Fiches, statut dans le pipeline, critères de recherche, contact WhatsApp. |
| **Biens** | Les annonces publiées sur le site *et* les saisies internes, fusionnées. |
| **Activités** | Journal des appels, rendez-vous, e-mails et visites. |
| **Paiements** | Encaissements rattachés à un client et à un bien. |
| **Factures** | Page dédiée (`facture.html`), numérotation automatique, export PDF. |
| **Tâches** | Ce qu'il reste à faire, avec échéance. |
| **Automatisation** | Relances suggérées : visites proches, paiements en retard, clients sans activité. |
| **Pipeline** | Vue kanban, glisser-déposer pour faire avancer un client. |
| **Rapprochements** | Confronte les demandes des clients aux annonces en ligne. |

## Démarrer

Aucune installation. Ouvrir `index.html` dans un navigateur, ou servir le
dossier en statique. La page redirige vers `login.html` tant qu'aucune session
Supabase n'est ouverte.

Les identifiants du projet Supabase sont dans `assets/js/config.js`. **La clé
anon qui s'y trouve n'est pas un secret** : elle est servie à chaque
navigateur, on ne peut pas la cacher. C'est un identifiant de projet. Ce qui
protège réellement les données, c'est le RLS — voir [`sql/`](sql/).

## Comment c'est fait

```
index.html          le CRM
login.html          connexion
facture.html        facturation (autonome, avec son propre style)
assets/css/style.css
assets/js/
  config.js         client Supabase — source unique des identifiants
  auth.js           garde de session : pas de session, pas de page
  site.js           pont lecture seule vers la base du site public
  match.js          rapprochement demandes ↔ annonces, partage WhatsApp
  ui.js             toasts, modales, thème, autocomplétion
  app.js            les écrans
sql/                le schéma et les politiques de sécurité, versionnés
```

L'ordre de chargement des scripts est impératif : `config` → `auth` → `site`
→ `match` → `ui` → `app`. `app.js` attend l'événement `slcm:auth-ready`
avant d'interroger la base ; sans session, le RLS bloque tout et l'écran
resterait vide sans explication.

## Deux projets Supabase

| Projet | Référence | Contenu | Accès |
|---|---|---|---|
| CRM | `dukwtseqticijlvrmkgz` | clients, biens, activités, tâches, paiements, factures | lecture / écriture, session requise |
| Site | `hozlyddiqodvjguqywty` | annonces publiques de selogercm.com | lecture seule, via `site.js` |

**Les annonces ne sont jamais copiées dans le CRM.** Un second client Supabase,
en lecture seule, interroge directement la base du site. Aucune
synchronisation à maintenir, aucune donnée périmée : une annonce modifiée sur
le site l'est instantanément ici.

Quand un bien a besoin de données propres au CRM — commission, contact
propriétaire, historique de négociation — on crée une fiche `properties`
portant `listing_id` et `listing_slug`. La fiche **pointe** vers l'annonce,
elle ne la duplique pas.

## Base de données

Le schéma, les contraintes, les index et les politiques RLS sont versionnés
dans [`sql/`](sql/), avec la requête qui permet de les régénérer depuis le
tableau de bord Supabase. **Ces fichiers font foi** — pas ce README.

Sept tables : `clients`, `properties`, `activities`, `tasks`, `payments`,
`invoices`, `shared_listings`. Le RLS est actif sur toutes.

## Ce que le CRM ne fait pas

À savoir avant de chercher le bouton :

- **Rien ne se supprime, et c'est voulu.** Aucune fonction de suppression
  n'existe, pour aucune table. Sur des données de facturation, ne pas pouvoir
  effacer d'un clic est une sécurité plutôt qu'une limite.

  En pratique : une fiche créée par erreur se **corrige**, elle ne s'efface
  pas. En dernier recours, elle se retire depuis le *Table Editor* du
  tableau de bord Supabase.

  Le point de bascule à surveiller : une fiche erronée continue de compter
  dans les statistiques du tableau de bord — total clients, taux de
  conversion. Le jour où ces chiffres deviennent faux, la réponse n'est pas
  d'ajouter un `DELETE` mais une colonne `archived_at` : la fiche sort des
  listes et des calculs, la donnée reste.
- **Pas de suivi acompte / solde.** Un paiement porte un montant et un statut
  (`pending` ou `paid`), rien de plus. Une tentative avait été amorcée côté
  interface sans jamais atteindre la base ; elle a été retirée le 31/08/2026.
- **Pas d'envoi automatique.** L'écran Automatisation *propose* des relances ;
  c'est toujours l'agent qui déclenche l'envoi WhatsApp. C'est délibéré : un
  message mal ciblé coûte plus cher qu'une relance manquée.
- **Un seul utilisateur.** Les colonnes `owner_id` sont remplies et les
  politiques `owner_all` existent, mais des politiques plus larges les
  neutralisent. Le passage au multi-agent demande de supprimer ces dernières —
  voir l'en-tête de `sql/02_rls.sql`.

## Sur mobile

La mise en page bascule à 768 px : la barre latérale devient une rangée
horizontale et les grilles passent sur une colonne. Utilisable, mais la
navigation à dix entrées occupe plusieurs rangées — c'est le prochain
chantier d'ergonomie.
