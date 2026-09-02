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
| **Clients** | Fiches, statut dans le pipeline, contact WhatsApp, et leurs **recherches**. |
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
tests/              les contrôles — `node tests/run.js`
```

L'ordre de chargement des scripts est impératif : `config` → `auth` → `site`
→ `match` → `ui` → `app`. `app.js` attend l'événement `slcm:auth-ready`
avant d'interroger la base ; sans session, le RLS bloque tout et l'écran
resterait vide sans explication.

## Tests

```bash
node tests/run.js
```

Node seul, rien à installer. À lancer avant chaque commit. Les six contrôles
ne sont pas génériques : chacun existe parce qu'un bug précis est passé au
travers d'une relecture. Voir [`tests/`](tests/).

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

Huit tables : `clients`, `demands`, `properties`, `activities`, `tasks`,
`payments`, `invoices`, `shared_listings`. Le RLS est actif sur toutes.

**Un seul vocabulaire de types de biens**, partagé par les annonces du site
(`listings.type`, hors de notre main), les fiches biens du CRM
(`properties.type`) et les critères d'une recherche (`demands.wanted_types`) :
appartement, studio, villa, maison, duplex, immeuble, terrain, entrepôt,
bureau, boutique, local commercial. Une divergence d'orthographe ne produit
aucune erreur — elle rend simplement le rapprochement muet, ce qui est pire.
`tests/check-columns.js` vérifie que le formulaire ne propose rien que la
contrainte refuse.

**Les quartiers de Douala sont proposés en liste, pas imposés.** Le formulaire
de recherche accepte aussi des quartiers libres — Yaoundé, Kribi, Bafoussam —
séparés par des virgules. Les deux se fondent dans la même colonne, sans
doublonner : « bonapriso » saisi à la main ne s'ajoute pas à côté de
« Bonapriso » coché.

**Un client peut porter plusieurs recherches.** Un studio pour lui, un
deux-chambres pour sa mère : ce sont deux lignes de `demands`, avec chacune
son budget, ses quartiers et son état. Jusqu'au 31/08/2026 la recherche vivait
dans la fiche client — une fiche, une recherche — et le seul contournement
était de créer deux fiches au même nom. Le rapprochement évalue désormais une
**recherche** face à une annonce, ce qui est plus juste : c'est la recherche
qui a un budget, pas la personne.

Une recherche ne se supprime pas, elle se met en pause : elle sort alors du
rapprochement sans que son historique disparaisse.

**Enregistrer un client enchaîne sur sa recherche.** C'est au moment où le
client appelle qu'on sait ce qu'il veut ; ne pas le lui demander là revient à
ne jamais le noter. Le formulaire de recherche s'ouvre donc juste après la
création, avec un bouton « Passer, sans recherche » pour les vendeurs et les
apporteurs. En modification, non : la fiche rappelle ses recherches en lecture
seule et renvoie vers l'écran dédié.

Deux champs de texte libre, deux rôles à ne pas confondre : les **notes du
client** décrivent la personne ; le **besoin en clair**, sur la recherche,
garde ce que le client a dit avec ses mots, à côté des critères.

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

La mise en page bascule à 768 px : les grilles passent sur une colonne et la
barre latérale devient une rangée horizontale qui **défile**. Les dix entrées
tiennent sur une seule ligne au lieu de s'enrouler sur quatre, et l'entrée
active est ramenée dans le champ de vision.

Rien n'est replié derrière un menu, délibérément : masquer trois écrans
supposerait de savoir lesquels sont secondaires, et cela dépend de la façon
dont l'agence travaille, pas du CSS.

## Aide à la saisie

Deux conforts, sans intelligence artificielle non plus.

**Les suggestions rappellent, elles ne devinent pas.** L'adresse d'un bien
propose les adresses déjà saisies et les quartiers connus du rapprochement ;
le champ « Précisez » d'une source propose ce qui y a déjà été écrit. Le but
n'est pas de taper plus vite, c'est d'éviter les variantes : « Bonaprisso »
écrit une fois suffit à rendre un bien introuvable au rapprochement, sans
erreur ni message.

**Le dernier choix devient le défaut suivant.** Type d'activité, type et
statut d'un bien, statut d'un paiement : la valeur retenue est reprise à la
**création** suivante — jamais en modification, où elle écraserait une donnée
existante par une habitude. Ce repère vit dans le navigateur : c'est une
habitude de saisie, pas une donnée du CRM.

## Doublons

À l'enregistrement d'un client, le CRM signale les fiches qui lui ressemblent —
même numéro, ou même nom une fois les civilités et les accents retirés. **Sans
intelligence artificielle, délibérément** : rapprocher deux numéros se décide
par des règles, c'est gratuit, instantané, et ça ne se trompe pas de façon
imprévisible.

Rien n'est bloquant : on signale, l'agent tranche. Deux homonymes existent, et
un couple peut partager un téléphone. Mais la question est posée **avant**
l'écriture — une fois la fiche créée, la corriger coûte plus cher que d'y
renoncer, puisque le CRM ne sait pas supprimer.

## Saisie contextuelle

Les formulaires d'activité et de paiement acceptent un pré-remplissage :

```javascript
showActivityForm(activity, draft, back)
```

`activity` distingue modification et création, `draft` porte les valeurs de
départ, `back` indique l'écran de retour. C'est ce qui permet aux raccourcis
des lignes client et bien d'ouvrir un formulaire déjà rattaché à la bonne
fiche — et d'y ramener après l'enregistrement, plutôt que d'éjecter l'agent
dans une liste qu'il n'était pas en train de lire.
