# tests/ — les contrôles qui tiennent le CRM

```bash
node tests/run.js
```

Node seul, aucune dépendance à installer, aucun navigateur. Sort en code 1 si
un contrôle échoue. À lancer avant chaque commit.

## Ce que chacun surveille, et pourquoi

Ces quatre contrôles ne sont pas génériques : chacun existe parce qu'un bug
précis est passé au travers d'une relecture humaine.

| Contrôle | Le bug qui l'a fait naître |
|---|---|
| **Syntaxe** | `node --check` sur les six fichiers servis au navigateur. Une erreur de syntaxe ne se voit qu'à l'exécution, écran blanc à la clé. |
| **check-columns** | `TABLE_COLS.payments` réclamait des colonnes `accompte` et `reste` inexistantes. PostgREST rejetait **toute** lecture de la table : écran Paiements vide, chiffre d'affaires à zéro, alertes muettes — sans une seule erreur visible. Quatre relectures n'avaient rien vu. |
| **check-handlers** | Le bouton « Rapprochements » était câblé `onclick="navTo(this, showMatching)"`. Or `navTo` *fabrique* un gestionnaire, elle ne navigue pas : le clic partait dans le vide, sans erreur en console, et tout l'écran était inaccessible. |
| **test-escaping** | Les valeurs de la base étaient injectées brutes dans `innerHTML`. Un client nommé « Ets \<Nkolo\> & Fils » disparaissait de l'écran sans un mot. |
| **test-matching** | `match.js` est le seul endroit où une décision métier est *calculée*. Une régression y est invisible : le CRM continue de fonctionner, il propose simplement moins bien — ou trop. |
| **test-suggestions** | Les suggestions ne devinent rien, elles rappellent ce qui a déjà été saisi. Une variante — « Bonaprisso » pour « Bonapriso » — suffit à rendre un bien introuvable au rapprochement, sans erreur ni message. |
| **test-screens** | Le bouton « Annuler » de la boîte de réception a été livré avec `${back === …}` dans un écran qui ne reçoit aucun `back` : ReferenceError en production, écran « Erreur », fonctionnalité inaccessible. `node --check` ne pouvait pas le voir — la syntaxe était valide — et les autres contrôles non plus, puisqu'ils testent des fonctions pures alors que le bug vivait dans un gabarit HTML. Il fallait **exécuter** le rendu. |
| **test-followups** | « Echec : pas disponible », « en attente retour clt sur négo » — l'agent écrivait l'issue et la suite en prose dans les notes. Le CRM ne pouvait donc pas savoir qu'une visite avait échoué. Si ces contrôles cèdent, le tableau de bord ment sur ce qui reste à faire. |
| **test-duplicates** | Le tableau de bord affichait « M. Dicka » deux fois, le même jour. Les biens sont protégés du double import par un index unique ; les clients ne l'étaient par rien. Et comme le CRM ne sait pas supprimer, une fiche en double reste — et fausse le total clients comme le taux de conversion. |

## Trois principes

**Exécuter vaut mieux que relire.** `test-screens` charge `app.js` entier dans
un faux navigateur et construit chaque écran. Il ne vérifie pas que l'écran est
joli : il vérifie qu'il se construit. C'est le contrôle le moins exigeant
possible de toute la suite, et c'est celui qui a manqué le plus longtemps.


**Le critère est l'effet, pas la forme.** `test-escaping` ne cherche pas la
sous-chaîne « onerror= » : elle peut apparaître sans danger à l'intérieur d'un
`&lt;img` échappé, puisque c'est alors du texte. Il vérifie quelles balises sont
*réellement ouvertes*. Une première version, plus naïve, signalait des faux
positifs sur tout nom contenant un mot suspect.

**Le schéma fait foi.** `check-columns` lit `sql/01_schema.sql`, pas une liste
recopiée à la main. Après toute modification de la base : relancer
`sql/00_introspection.sql`, remplacer le fichier, relancer les tests.

## Ajouter un contrôle

Un fichier qui exporte `run()` renvoyant `{ title, checks: [[libellé, booléen]] }`,
puis son nom dans le tableau de `run.js`. Le libellé est lu par un humain qui
vient de casser quelque chose : qu'il dise ce qui ne va pas, pas ce qui était
attendu.
