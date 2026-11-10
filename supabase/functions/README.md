# supabase/functions/ — le code qui ne tourne pas dans le navigateur

Le CRM est un site statique : tout s'exécute chez l'agent. Une seule chose ne
le peut pas — appeler l'API Anthropic, qui exige une clé secrète. Une clé
placée dans `assets/js/` serait servie à chaque visiteur.

D'où ce dossier. **Quatre fonctions**, déployées chacune à part.

| Fonction | Rôle |
|---|---|
| `understand-inbox` | Un message reçu d'un confrère devient une proposition de fiche bien. N'écrit rien. |
| `understand-note` | Une note dictée après une visite devient une proposition de saisie rapide : nom, téléphone, type (WhatsApp compris depuis la version `2026-11-10-b`), issue, suite, date. Modèle léger `claude-haiku-5-5`. N'écrit rien ; le CRM ne remplit que les champs laissés vides. Mêmes secrets, même réglage « Verify JWT » désactivé. Facultative : sans elle, seul le bouton « Remplir depuis ma note » échoue. |
| `daily-digest` | Le rappel Telegram du matin et du soir. Appelée par `pg_cron`, pas par le CRM ; secret partagé au lieu d'une session ; lit avec la clé service en filtrant par agent. N'écrit que dans `notif_log`. Voir « Rappels Telegram » plus bas. |
| `capture-annonces` | Un paquet de 25 messages de groupe (export WhatsApp) : offre ou non, et la fiche de chaque offre. Modèle léger `claude-haiku-5-5`. N'écrit rien : le CRM range le résultat dans `annonces_captees`. Mêmes secrets, même réglage « Verify JWT » désactivé. |

## Vérifier QUELLE version tourne

La fonction porte un marqueur `VERSION`, journalisé à chaque appel et renvoyé
dans chaque réponse :

```
[understand-inbox] version 2026-09-03-c
```

**À incrémenter dès qu'on touche le fichier.** C'est la seule façon fiable de
savoir si un déploiement a pris — et son absence a coûté trois diagnostics
successifs le 03/09/2026, tous portant sur du code qui n'était pas déployé.

Les signes qu'un déploiement n'a pas pris :

- les journaux montrent `server started` → c'est encore le gabarit Supabase ;
- le marqueur de version est absent des journaux ;
- la trace d'erreur pointe toujours **la même ligne** alors que le fichier a
  changé de longueur ;
- le message affiché dans le CRM est celui d'avant la correction.

## Le réglage qui décide de tout

**« Verify JWT » doit être DÉSACTIVÉ** sur la fonction (Edge Functions →
`understand-inbox` → paramètres).

La fonction vérifie le jeton elle-même, avec le client Supabase agissant « en
tant que » l'appelant — c'est le gabarit de KWEKA, qui tourne depuis des mois.
Laisser en plus la passerelle vérifier ajoute un point de défaillance qu'on ne
voit pas : elle répond 401 **avant** d'appeler le code, donc les journaux de la
fonction ne montrent rien d'autre qu'un démarrage sain.

C'est exactement ce qui a coûté trois allers-retours le 03/09/2026 : des
journaux propres, `booted (time: 61ms)`, aucun `console.error` — et un 401 dans
le navigateur. Quand les journaux d'une fonction sont muets alors qu'elle
démarre, c'est la passerelle qui a répondu.

## Déployer

Par le dashboard, pas par le CLI :

1. Dashboard Supabase → projet **`dukwtseqticijlvrmkgz`** → **Edge Functions**
2. **Deploy a new function**, nom : `understand-inbox`
3. Coller le contenu de `understand-inbox/index.ts` **en entier**
4. Deploy

Un seul fichier, aucun import local : le dashboard ne sait pas résoudre
`../_shared/…`. C'est la raison pour laquelle la fonction se répète un peu
plutôt que de partager du code.

## Les secrets

| Nom | Rôle |
|---|---|
| **`CRM_SLCM`** | La clé API Anthropic. `ANTHROPIC_API_KEY` fonctionne en repli. |
| **`CRM_SLCM_WORKSPACE`** | L'identifiant de l'espace de travail Anthropic. **Obligatoire si la clé est personnelle ou de compte de service**, facultatif sinon. `ANTHROPIC_WORKSPACE_ID` en repli. |

Une clé personnelle donne accès à plusieurs espaces de travail : l'API exige
alors de savoir dans lequel la requête agit, et répond sinon
`anthropic-workspace-id is required when authenticating with an
identity-linked API key`. L'identifiant se trouve dans la Console Anthropic,
Paramètres → Workspaces.

La fonction reconnaît ce message et répond `workspace_manquant` avec la marche
à suivre — un défaut qui se corrige en ajoutant un secret ne doit pas obliger
à relire le code.

`SUPABASE_URL` et `SUPABASE_ANON_KEY` sont injectées automatiquement — rien
à faire.

## Rappels Telegram — `daily-digest`

Le matin à 07h30 (du lundi au samedi) et le soir à 18h00 (du lundi au
vendredi), heure de Douala, un message Telegram arrive :

- **matin** : la dernière journée travaillée, les clients **sans suite**, ce
  qui est en retard et pour aujourd'hui, et le lien `…/index.html#aujourdhui` ;
- **soir** : « Qui as-tu vu aujourd'hui ? », les visites du jour sans issue,
  et le lien `…/index.html#saisie-rapide`.

- **samedi** (`kind: "semaine"`, depuis la version `2026-11-10-b`, planifié
  par `sql/19`) : le bilan du lundi au samedi — interactions, nouveaux
  clients, visites, suites, signatures, **nombre** d'encaissements (le
  montant n'est même pas lu), ce qu'il faut reprendre lundi — et le lien
  `…/index.html#bilan`.

Il part **toujours**, même court : c'est l'habitude qu'on installe.

**Ce qui ne part jamais** : numéro de téléphone, montant, pièce d'identité,
texte des notes. Un bot Telegram n'est pas chiffré de bout en bout. Les
noms sont raccourcis (« Paul E. ») et toute suite de chiffres d'un intitulé
est masquée.

**Différences avec les deux autres fonctions** : elle est appelée par
`pg_cron`, pas par le CRM. Pas de session utilisateur : elle exige un secret
partagé dans l'en-tête `x-cron-secret`, et lit la base avec la clé service —
**en filtrant chaque requête par `owner_id`**, puisque la clé service ignore
le RLS. Elle n'écrit que dans `notif_log`, qui empêche un double envoi.

Ses règles sont une **copie volontaire** d'une partie de l'écran
« Aujourd'hui » (mêmes constantes, mêmes seuils). `tests/test-digest.js`
exécute cette copie et la compare à l'écran : si l'une change sans l'autre,
la suite échoue.

### Secrets de la fonction

| Nom | Rôle |
|---|---|
| **`TELEGRAM_BOT_TOKEN`** | Le jeton donné par @BotFather. Qui l'a peut écrire au nom du bot. |
| **`CRON_SECRET`** | Une longue chaîne au hasard, la même que celle rangée dans le coffre de la base (étape 6). |
| **`CRM_URL`** | L'adresse du CRM, **sans** `index.html` ni `/` final. Sert aux liens du message. |

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont **injectées
automatiquement** par Supabase dans toute fonction Edge : rien à copier, et
la clé service n'a jamais à passer par un copier-coller.

### Mise en route, pas à pas

L'ordre compte : la base appelle la fonction, la fonction appelle Telegram.
On construit donc de Telegram vers la base.

1. **Créer le bot.** Dans Telegram, ouvrir **@BotFather**, envoyer
   `/newbot`, choisir un nom (« Rappels SE LOGER ») puis un identifiant qui
   finit par `bot`. BotFather répond avec un **jeton** : le garder pour
   l'étape 4, ne le montrer à personne.
2. **Lui écrire le premier.** Ouvrir la conversation avec le nouveau bot et
   envoyer `/start`. *Pourquoi* : un bot Telegram n'a pas le droit d'écrire
   le premier à quelqu'un ; tant qu'on ne lui a pas parlé, ses messages
   sont refusés.
3. **Trouver son `chat_id`.** Dans le navigateur, ouvrir
   `https://api.telegram.org/bot<LE_JETON>/getUpdates` (le jeton collé à la
   place de `<LE_JETON>`, sans espace). Chercher `"chat":{"id":` — le nombre
   qui suit est le `chat_id`. Si la page affiche `"result":[]`, renvoyer un
   message au bot et recharger.
4. **Poser les trois secrets** : Edge Functions → **Secrets** →
   `TELEGRAM_BOT_TOKEN`, `CRON_SECRET` (inventer une longue chaîne, 40
   caractères au hasard), `CRM_URL`.
5. **Déployer la fonction** : Deploy a new function, nom `daily-digest`,
   coller `daily-digest/index.ts` en entier, Deploy. Puis **désactiver
   « Verify JWT »** dans ses paramètres.
6. **Ranger le secret du cron dans le coffre de la base** : SQL Editor,
   exécuter la seule ligne
   `select vault.create_secret('LA_MEME_CHAINE_QUE_CRON_SECRET', 'daily_digest_cron_secret');`
   — *pourquoi le coffre* : la tâche planifiée doit envoyer ce secret, et le
   coffre évite qu'il soit écrit en clair dans le dépôt ou dans la liste des
   tâches.
7. **Jouer `sql/18_notifications_telegram.sql`**. Contrôle attendu :
   `2, 2, 1, 2, 1`, puis le diagnostic `0, 0, 0`.
8. **S'inscrire** : SQL Editor, avec son e-mail de connexion au CRM et le
   `chat_id` de l'étape 3 :

   ```sql
   insert into public.notif_prefs (owner_id, telegram_chat_id)
   select id, '123456789' from auth.users where email = 'VOTRE_EMAIL'
   on conflict (owner_id) do update set telegram_chat_id = excluded.telegram_chat_id, actif = true;
   ```

9. **Essayer sans attendre demain matin** : SQL Editor —

   ```sql
   select net.http_post(
     url     := 'https://dukwtseqticijlvrmkgz.supabase.co/functions/v1/daily-digest',
     headers := jsonb_build_object('Content-Type', 'application/json',
       'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'daily_digest_cron_secret')),
     body    := '{"kind": "matin", "essai": true}'::jsonb);
   ```

   Le message arrive sur Telegram en quelques secondes. `"essai": true`
   envoie **sans noter l'envoi** : le vrai message de demain matin partira
   quand même. `"apercu": true` à la place rend le texte sans rien envoyer.
   La réponse de la fonction se lit ensuite avec
   `select status_code, content from net._http_response order by id desc limit 1;`

### Quand rien n'arrive

| Signe | Cause probable |
|---|---|
| `secret_invalide` | Le secret du coffre (étape 6) et `CRON_SECRET` (étape 4) diffèrent. |
| `config_incomplete` | Un des trois secrets manque côté fonction. |
| `agents: 0` | Aucune ligne active dans `notif_prefs` (étape 8). |
| `Telegram 403 … bot can't initiate conversation` | L'étape 2 (`/start`) n'a pas été faite. |
| `Telegram 400 … chat not found` | `chat_id` erroné (étape 3). |
| `deja_envoye` | Normal : ce message du jour est déjà parti. Utiliser `"essai": true` pour tester. |
| Rien du tout dans les journaux | La tâche planifiée ne tourne pas : `select * from cron.job_run_details order by start_time desc limit 5;` |

## Trois règles que ces fonctions respectent

**Aucune n'écrit en base.** Elles proposent, l'agent valide. Un
enregistrement erroné coûte plus cher qu'une saisie manuelle, et le CRM ne
sait pas supprimer.

**Le portefeuille ne sort jamais.** Seul le message collé part vers le
modèle. Le rapprochement avec l'existant se fait ensuite localement, par des
règles — `findDuplicates()` dans `app.js`.

**Rien n'est deviné.** Un champ absent du message revient `null` et figure
dans `manquant`, pour que l'interface le signale plutôt que de laisser croire
à une information vérifiée. Le modèle a pour consigne explicite de ne pas
estimer un prix, et de ne pas convertir un loyer annuel en mensuel — il
signale, il ne divise pas.

## Le modèle

`claude-opus-5`, à effort `low` : la tâche est une extraction d'une dizaine
de champs depuis quelques lignes, l'effort bas suffit et répond plus vite.

KWEKA utilise `claude-haiku-4-5` pour un travail comparable. Passer à Haiku
ici est une ligne à changer — c'est un arbitrage coût / qualité qui
t'appartient, pas une évidence technique.

## Quand ça échoue

**D'abord les journaux Supabase** : Edge Functions → `understand-inbox` →
onglet **Logs**. Ils donnent le statut réel, la sortie de `console.error`, et
surtout les erreurs de **démarrage** — un import qui ne résout pas fait
échouer la fonction avant toute exécution, et l'erreur ressemble alors à un
refus d'accès.

C'est ce qui s'est produit le 03/09/2026 : le SDK était épinglé sur une
version ancienne, choisie sans vérification. Avant de redéployer :

```bash
npm view @anthropic-ai/sdk version
```

## Lire un 401

Trois refus différents portent le même code HTTP. Le corps de la réponse les
distingue — c'est lui qu'il faut regarder, pas le code :

| `error` | Ce que ça veut dire |
|---|---|
| *(aucun JSON de la fonction)* | La **passerelle** a rejeté avant d'atteindre le code. L'appelant n'envoie pas l'en-tête `apikey`. |
| `jeton_absent` | Pas d'en-tête `Authorization`. |
| `session_invalide` | Le jeton a été refusé par `auth/v1/user` — `detail` donne son code. |
| `config_incomplete` | `SUPABASE_URL` ou la clé publique manque **côté fonction**. Ce n'est pas un refus d'accès, c'est un défaut de configuration. |

Côté CRM, `callFunction()` passe par `supabase.functions.invoke()` plutôt que
par un `fetch` à la main : le client sait poser les deux en-têtes que la
passerelle exige. Un `fetch` maison qui n'envoie que `Authorization` se fait
rejeter avant d'arriver ici.

## Ce qui protège la note

- La fonction exige une session Supabase valide : le point d'entrée est
  public, sans cette vérification n'importe qui connaissant l'URL ferait
  tourner le compteur.
- Un message de plus de 4 000 caractères est refusé : un copier-coller
  malheureux ne doit pas coûter une fortune.
- `response.usage` est renvoyé à l'appelant, pour qu'on puisse regarder ce
  que ça consomme réellement.
