// ════════════════════════════════════════════════════════════════════
//  understand-inbox — un message reçu devient une proposition de fiche.
//
//  À DÉPLOYER depuis le dashboard Supabase du projet dukwtseqticijlvrmkgz :
//  Edge Functions → Deploy a new function → coller ce fichier entier.
//  Un seul fichier, aucun import local : le dashboard ne sait pas
//  résoudre `../_shared/…`.
//
//  Secret attendu : CRM_SLCM (la clé API Anthropic).
//
//  ── Ce qu'elle fait ──
//
//  L'agent colle ce qu'un confrère lui a envoyé — typiquement un message
//  d'un groupe WhatsApp. Le modèle en extrait le bien décrit, aux formes
//  exactes de la table `properties`.
//
//  ── Ce qu'elle ne fait PAS, délibérément ──
//
//  · Elle N'ÉCRIT RIEN en base. Elle propose, l'agent valide. Même
//    principe que le rapprochement : un enregistrement erroné coûte plus
//    cher qu'une saisie manuelle, et le CRM ne sait pas supprimer.
//
//  · Elle N'ENVOIE JAMAIS le portefeuille au modèle. Seul le message collé
//    sort d'ici. Le rapprochement avec l'existant se fait ensuite
//    localement, par des règles — voir findDuplicates() dans app.js.
//
//  · Elle NE DEVINE PAS. Un champ absent du message revient à null et
//    figure dans `manquant`, pour que l'interface le signale plutôt que
//    de laisser croire à une information vérifiée.
//  ── Au moment de deployer ──
//
//  Le contenu de index.ts doit etre REMPLACE EN ENTIER. Le gabarit par
//  defaut de Supabase (`withSupabase({ auth: ["publishable","secret"] })`,
//  avec sa ligne console.info("server started")) refuse un jeton de session
//  utilisateur : il n'accepte qu'une cle publishable ou secrete. Laisse en
//  place, il repond 401 sans rien journaliser — les journaux ne montrent
//  alors qu'un demarrage sain, ce qui egare le diagnostic.
//
//  Reperer que le gabarit est encore la : chercher « server started » dans
//  les journaux. Cette fonction-ci ne l'ecrit jamais.
// ════════════════════════════════════════════════════════════════════

/* Version épinglée et VÉRIFIÉE publiée (0.123.0, la dernière au 03/09/2026).
   Une version inventée fait échouer le démarrage de la fonction, et l'erreur
   ressemble alors à un refus d'accès. Au moment de redéployer, vérifier :
   npm view @anthropic-ai/sdk version */
import Anthropic from 'npm:@anthropic-ai/sdk@0.123.0';
/* Même version que celle qui tourne dans KWEKA : ce gabarit-là fonctionne. */
import { createClient } from 'npm:@supabase/supabase-js@2.49.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });

/* Le vocabulaire des types est celui de la base du site, repris à
   l'identique dans properties.type et demands.wanted_types. Une valeur
   inventée ici ne produirait aucune erreur : elle rendrait simplement le
   rapprochement muet. D'où l'enum, et la validation à la sortie. */
const TYPES = [
  'apartment', 'studio', 'villa', 'house', 'duplex', 'building',
  'plots-of-land', 'warehouse', 'office', 'shop', 'commercial'
] as const;

const OUTIL = {
  name: 'proposer_bien',
  description:
    "Propose une fiche de bien à partir du message. N'appeler cet outil que " +
    "si le message décrit effectivement un bien immobilier à louer ou à vendre.",
  strict: true,
  input_schema: {
    type: 'object' as const,
    properties: {
      title: {
        type: ['string', 'null'],
        description: "Titre court et factuel, par exemple « Appartement 3 chambres meublé, Bonapriso »."
      },
      type: { type: ['string', 'null'], enum: [...TYPES, null] },
      rent_sale: {
        type: ['string', 'null'], enum: ['rent', 'sale', null],
        description: "« rent » pour une location, « sale » pour une vente."
      },
      price: {
        type: ['integer', 'null'],
        description: "Montant en FCFA, entier, sans séparateur. Loyer MENSUEL pour une location. « 350k » vaut 350000."
      },
      address: { type: ['string', 'null'], description: 'Localisation telle que donnée.' },
      district: { type: ['string', 'null'], description: 'Le quartier seul, sans la ville.' },
      bedrooms: { type: ['integer', 'null'], description: 'Nombre de chambres.' },
      furnished: { type: ['boolean', 'null'], description: 'true seulement si le message dit meublé.' },
      description: { type: ['string', 'null'], description: 'Le reste : état, atouts, conditions.' },
      contact: { type: ['string', 'null'], description: 'Numéro ou nom du confrère, si présent.' },
      manquant: {
        type: 'array', items: { type: 'string' },
        description: "Les champs que le message ne permet pas de renseigner."
      }
    },
    required: [
      'title', 'type', 'rent_sale', 'price', 'address', 'district',
      'bedrooms', 'furnished', 'description', 'contact', 'manquant'
    ],
    additionalProperties: false
  }
};

const CONSIGNE = `Tu extrais une fiche de bien immobilier depuis un message reçu par un agent immobilier à Douala, au Cameroun.

Règles, dans l'ordre :

1. N'INVENTE RIEN. Un champ que le message ne donne pas vaut null, et son nom va dans « manquant ». Un bien sans prix est courant — « prix sur demande » se traduit par price: null, pas par une estimation.

2. Les prix sont en FCFA. « 350k » et « 350.000 » valent 350000. Pour une location, retiens le loyer MENSUEL : si le message annonce un montant annuel ou trimestriel, mets price à null et signale-le dans « manquant », plutôt que de diviser.

3. Distingue le quartier de la ville. « Bonapriso, Douala » donne district: "Bonapriso". Les quartiers de Douala les plus fréquents : Bonapriso, Bali, Bonanjo, Bonamoussadi, Makepe, Logpom, Logbessou, Akwa, Deido, Kotto, Bonabéri, Yassa, Youpwe, Ndogbong.

4. Si le message ne décrit aucun bien — une salutation, une question, une annonce d'autre nature — n'appelle pas l'outil. Réponds en une phrase disant ce que le message contient.

5. Le titre doit se lire seul dans une liste. Type, nombre de chambres et quartier suffisent.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    console.error('[understand-inbox] methode refusee :', req.method);
    return json({ error: 'method_not_allowed' }, 405);
  }

  /* ── Authentification, reprise de KWEKA (_shared/auth.ts) ──

     La fonction vérifie le jeton ELLE-MÊME, avec le client Supabase agissant
     « en tant que » l'appelant. Cela suppose que la vérification de la
     passerelle soit DÉSACTIVÉE pour cette fonction (« Verify JWT », dans ses
     paramètres) — c'est ainsi que KWEKA déploie les siennes.

     Historique, pour qui relira : j'avais d'abord écrit cette vérification à
     la main avec un fetch vers auth/v1/user, puis je l'ai supprimée en pariant
     sur la passerelle. Les deux ont échoué en 401. Le gabarit qui marche
     depuis des mois était à côté, dans l'autre projet. */
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    console.error('[understand-inbox] refus : en-tête Authorization absent');
    return json({ error: 'jeton_absent' }, 401);
  }

  try {
    /* Le projet tourne sur le nouveau runtime Supabase, qui nomme la cle
       publique « publishable » et non plus « anon ». On accepte les deux
       plutot que d'echouer sur un nom de variable. */
    const cle = Deno.env.get('SUPABASE_ANON_KEY')
      ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
    if (!cle) {
      console.error('[understand-inbox] aucune cle publique dans l environnement');
      return json({
        error: 'config_incomplete',
        detail: 'ni SUPABASE_ANON_KEY ni SUPABASE_PUBLISHABLE_KEY'
      }, 500);
    }
    const asUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      cle,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data, error } = await asUser.auth.getUser();
    if (error || !data?.user) {
      console.error('[understand-inbox] jeton refuse :', error?.message ?? 'aucun utilisateur');
      return json({ error: 'session_invalide', detail: error?.message ?? null }, 401);
    }
    console.log('[understand-inbox] appel de', data.user.email);
  } catch (e) {
    console.error('[understand-inbox] verification impossible :', String(e));
    return json({ error: 'auth_indisponible', detail: String(e) }, 503);
  }

  const apiKey = Deno.env.get('CRM_SLCM') ?? Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.error("[understand-inbox] secret CRM_SLCM introuvable dans l'environnement");
    return json({ error: 'secret_absent', detail: 'CRM_SLCM non visible par la fonction' }, 500);
  }

  let body: { message?: string };
  try {
    body = await req.json();
  } catch (_e) {
    console.error('[understand-inbox] corps de requete illisible');
    return json({ error: 'invalid_json' }, 400);
  }

  const message = String(body.message ?? '').trim();
  if (!message) {
    console.error('[understand-inbox] message vide');
    return json({ error: 'empty_message' }, 400);
  }
  /* Un message de groupe dépasse rarement quelques lignes. La borne évite
     qu'un copier-coller malheureux ne coûte une fortune. */
  if (message.length > 4000) {
    console.error('[understand-inbox] message trop long :', message.length);
    return json({ error: 'message_too_long' }, 413);
  }

  const client = new Anthropic({ apiKey });

  /* Une cle personnelle ou de compte de service donne acces a PLUSIEURS
     espaces de travail : l'API exige alors de savoir dans lequel la requete
     agit, via l'en-tete anthropic-workspace-id. Sans lui, elle repond 400
     « anthropic-workspace-id is required when authenticating with an
     identity-linked API key ».

     La syntaxe est celle du SECOND argument de messages.create — pas une
     option du constructeur. Une cle liee a un seul espace n'en a pas besoin :
     le secret reste facultatif. */
  const workspaceId = Deno.env.get('CRM_SLCM_WORKSPACE')
    ?? Deno.env.get('ANTHROPIC_WORKSPACE_ID');
  const options = workspaceId
    ? { headers: { 'anthropic-workspace-id': workspaceId } }
    : undefined;

  try {
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 16000,
      /* Extraction d'une dizaine de champs depuis quelques lignes : la
         tâche est simple, l'effort bas suffit et répond plus vite. */
      output_config: { effort: 'low' },
      system: CONSIGNE,
      tools: [OUTIL],
      messages: [{ role: 'user', content: message }]
    }, options);

    if (response.stop_reason === 'refusal') {
      console.error('[understand-inbox] le modele a decline :', response.stop_details);
      return json({ error: 'refus', detail: response.stop_details ?? null }, 422);
    }

    const appel = response.content.find((b) => b.type === 'tool_use');
    if (!appel) {
      /* Le modèle a jugé que le message ne décrit pas un bien. C'est une
         réponse valide, pas une panne : on rend son explication. */
      const texte = response.content.find((b) => b.type === 'text');
      return json({
        bien: null,
        explication: texte && texte.type === 'text' ? texte.text : 'Aucun bien reconnu dans ce message.'
      });
    }

    const brut = appel.type === 'tool_use' ? (appel.input as Record<string, unknown>) : {};

    /* Ceinture et bretelles. `strict: true` garantit la FORME, pas le
       contenu : on revalide ce qui doit l'être avant de le proposer à
       l'agent — un type hors vocabulaire ou un prix négatif rendrait la
       fiche irrapprochable, sans erreur visible. */
    const entier = (v: unknown) => {
      const n = Number(v);
      return Number.isInteger(n) && n >= 0 ? n : null;
    };
    const texteOuNull = (v: unknown) => {
      const s = typeof v === 'string' ? v.trim() : '';
      return s ? s : null;
    };

    const bien = {
      title: texteOuNull(brut.title),
      type: TYPES.includes(brut.type as typeof TYPES[number]) ? brut.type : null,
      rent_sale: brut.rent_sale === 'rent' || brut.rent_sale === 'sale' ? brut.rent_sale : null,
      price: entier(brut.price),
      address: texteOuNull(brut.address),
      district: texteOuNull(brut.district),
      bedrooms: entier(brut.bedrooms),
      furnished: brut.furnished === true ? true : null,
      description: texteOuNull(brut.description),
      contact: texteOuNull(brut.contact),
      manquant: Array.isArray(brut.manquant) ? brut.manquant.map(String) : []
    };

    /* Sans transaction, le bien ne serait proposé à personne : autant le
       dire ici plutôt que de laisser l'agent le découvrir après coup. */
    if (!bien.rent_sale && !bien.manquant.includes('rent_sale')) {
      bien.manquant.push('rent_sale');
    }

    return json({ bien, usage: response.usage });
  } catch (e) {
    console.error('[understand-inbox]', e);

    /* Ce defaut-la se corrige en ajoutant un secret, pas en relisant le code :
       autant le dire a l'ecran plutot que de renvoyer la trace brute. */
    if (String(e).includes('anthropic-workspace-id')) {
      return json({
        error: 'workspace_manquant',
        detail: "La cle API donne acces a plusieurs espaces de travail. "
          + "Ajouter le secret CRM_SLCM_WORKSPACE avec l'identifiant de "
          + "l'espace (Console Anthropic, Parametres, Workspaces)."
      }, 502);
    }
    return json({ error: 'extraction_impossible', detail: String(e) }, 502);
  }
});
