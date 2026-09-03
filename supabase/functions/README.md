# supabase/functions/ — le code qui ne tourne pas dans le navigateur

Le CRM est un site statique : tout s'exécute chez l'agent. Une seule chose ne
le peut pas — appeler l'API Anthropic, qui exige une clé secrète. Une clé
placée dans `assets/js/` serait servie à chaque visiteur.

D'où ce dossier. **Une seule fonction pour l'instant.**

| Fonction | Rôle |
|---|---|
| `understand-inbox` | Un message reçu d'un confrère devient une proposition de fiche bien. N'écrit rien. |

## Déployer

Par le dashboard, pas par le CLI :

1. Dashboard Supabase → projet **`dukwtseqticijlvrmkgz`** → **Edge Functions**
2. **Deploy a new function**, nom : `understand-inbox`
3. Coller le contenu de `understand-inbox/index.ts` **en entier**
4. Deploy

Un seul fichier, aucun import local : le dashboard ne sait pas résoudre
`../_shared/…`. C'est la raison pour laquelle la fonction se répète un peu
plutôt que de partager du code.

## Le secret

La clé API Anthropic est attendue sous le nom **`CRM_SLCM`**
(Edge Functions → Secrets). `ANTHROPIC_API_KEY` fonctionne aussi, en repli.

`SUPABASE_URL` et `SUPABASE_ANON_KEY` sont injectées automatiquement — rien
à faire.

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
