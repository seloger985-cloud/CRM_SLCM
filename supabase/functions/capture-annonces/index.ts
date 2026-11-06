// ════════════════════════════════════════════════════════════════════
//  capture-annonces — un paquet de messages de groupe devient des fiches.
//
//  À DÉPLOYER depuis le dashboard Supabase du projet dukwtseqticijlvrmkgz :
//  Edge Functions → Deploy a new function → nom « capture-annonces » →
//  coller ce fichier entier. Puis, dans ses paramètres, DÉSACTIVER
//  « Verify JWT » (même réglage que understand-inbox, voir README).
//
//  Secrets : les mêmes que understand-inbox (CRM_SLCM, CRM_SLCM_WORKSPACE).
//
//  ── Ce qu'elle fait ──
//
//  Le CRM a lu un export de groupe WhatsApp (assets/js/capture.js) et retenu
//  les messages qui ressemblent à des offres. Il les envoie ici par paquets
//  d'au plus 25. Pour chacun, le modèle dit s'il s'agit vraiment d'une offre
//  et en extrait la fiche, aux formes exactes de la table `properties`.
//
//  C'est la sœur de understand-inbox, pour le volume : 400 à 1 200 messages
//  par jour sur 4 groupes. D'où le modèle léger, et le paquet : la consigne
//  n'est envoyée qu'une fois pour 25 messages.
//
//  ── Ce qu'elle ne fait PAS, délibérément ──
//
//  · Elle N'ÉCRIT RIEN en base. Le CRM range le résultat dans
//    `annonces_captees` — jamais dans le portefeuille, qui ne reçoit une
//    fiche que sur décision de l'agent.
//  · Elle NE DEVINE PAS. Champ absent → null, et son nom dans `manquant`.
//  · Elle ne reçoit QUE les messages du paquet. Ni le portefeuille, ni les
//    confrères, ni les clients ne sortent du CRM.
// ════════════════════════════════════════════════════════════════════

/* Même version épinglée que understand-inbox : c'est celle qui tourne. */
import Anthropic from 'npm:@anthropic-ai/sdk@0.123.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.0';

/* À incrémenter dès qu'on touche ce fichier. Voir README, « Vérifier QUELLE
   version tourne ». */
const VERSION = '2026-11-06-a';

/* Choix du 02/11/2026 : le modèle léger. Estimation pour 4 groupes, 400 à
   1 200 messages par jour : 1 à 4 $ par mois. Le modèle de understand-inbox
   coûterait environ quarante fois plus pour ce volume. */
const MODELE = 'claude-haiku-5-5';

/* Bornes de dépense : un paquet ne peut pas dépasser ce que le CRM envoie
   normalement. Un appel détourné ne fait pas tourner le compteur. */
const PAQUET_MAX = 25;
/* En dessous, un montant de VENTE est un frais ou un prix au m², pas un prix. */
const PRIX_VENTE_MIN = 1000000;
const MESSAGE_MAX = 4000;

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

/* Le vocabulaire de la base du site, comme dans understand-inbox. */
const TYPES = [
  'apartment', 'studio', 'villa', 'house', 'duplex', 'building',
  'plots-of-land', 'warehouse', 'office', 'shop', 'commercial'
] as const;

/* Une entrée par message. Pas de `strict` : la nullabilité est structurelle
   (voir understand-inbox, même raisonnement) — la validation de sortie
   ci-dessous fait le travail, et elle vérifie le contenu. */
const ANNONCE = {
  type: 'object' as const,
  properties: {
    id: { type: 'integer', description: "L'identifiant du message, recopié tel quel." },
    est_une_offre: {
      type: 'boolean',
      description: "true seulement si le message PROPOSE un bien à louer ou à vendre. Une demande (« je cherche »), une question, une salutation : false."
    },
    title: { type: ['string', 'null'], description: "Titre court : type, chambres ou surface, quartier." },
    type: { type: ['string', 'null'], enum: [...TYPES, null] },
    rent_sale: { type: ['string', 'null'], enum: ['rent', 'sale', null] },
    price: { type: ['integer', 'null'], description: 'FCFA, entier. Loyer MENSUEL pour une location.' },
    price_m2: { type: ['integer', 'null'], description: 'Prix au m² en FCFA, si annoncé ainsi.' },
    surface_m2: { type: ['integer', 'null'], description: 'Surface en m². « 1 ha » vaut 10000.' },
    district: { type: ['string', 'null'], description: 'Le quartier seul.' },
    address: { type: ['string', 'null'], description: 'Localisation telle que donnée.' },
    bedrooms: { type: ['integer', 'null'] },
    furnished: { type: ['boolean', 'null'], description: 'true seulement si le message dit meublé.' },
    contact: { type: ['string', 'null'], description: 'Numéro (et nom) cité DANS le message, s’il y en a un.' },
    frais: {
      type: ['string', 'null'],
      description: "Les coûts ANNEXES cités, tels quels : « Signature 300 000 FCFA », « Commission 5 % », « Bornage à la charge de l'acheteur ». Jamais le prix du bien."
    },
    manquant: { type: 'array', items: { type: 'string' } }
  },
  required: ['id', 'est_une_offre'],
  additionalProperties: false
};

const OUTIL = {
  name: 'classer_annonces',
  description: "Rend le résultat pour TOUS les messages du paquet, une entrée par message, dans l'ordre.",
  input_schema: {
    type: 'object' as const,
    properties: { annonces: { type: 'array', items: ANNONCE } },
    required: ['annonces'],
    additionalProperties: false
  }
};

const CONSIGNE = `Tu reçois des messages copiés d'un groupe WhatsApp d'agents immobiliers de Douala, au Cameroun. Chacun est encadré par <message id="…">. Pour CHAQUE message, tu rends une entrée avec le même id, en appelant une seule fois l'outil classer_annonces.

Règles, dans l'ordre :

1. est_une_offre vaut true seulement si le message propose un bien à louer ou à vendre. Une demande (« je cherche », « mon client recherche »), une question, une relance, une salutation : false, et rien d'autre à remplir.

2. N'INVENTE RIEN. Un champ que le message ne donne pas vaut null, et son nom va dans « manquant ». « Prix sur demande » donne price: null.

3. Les prix sont en FCFA. « 350k » et « 350.000 » valent 350000 ; « 45 millions » vaut 45000000. Pour une location, retiens le loyer MENSUEL : un montant annuel ou trimestriel donne price: null, signalé dans « manquant ».

4. Un terrain se vend souvent AU MÈTRE CARRÉ. « 140 mille le m² » va dans price_m2, pas dans price. Ne calcule jamais de total toi-même.

4 bis. Distingue TROIS montants, qui ne se confondent jamais :
   · price : le prix TOTAL du bien ;
   · price_m2 : le prix AU MÈTRE CARRÉ ;
   · frais : les coûts ANNEXES payés en plus aux intervenants du dossier — « signature », « frais de signature », « prix de signature », « frais de dossier », « commission », « frais d'agence », « bornage », « géomètre », « notaire », « mutation », « visite ». Ils vont dans frais, tels quels, et JAMAIS dans price ni dans price_m2.
   Exemple : « Terrain 250 m² à Lendi, 300 mille le m², signature 300 mille » donne price_m2: 300000, price: null, frais: "Signature 300 000 FCFA".
   Exemple : « Terrain 500 m², 25 millions, signature 500k » donne price: 25000000, frais: "Signature 500 000 FCFA".
   Si un montant n'est clairement ni le total ni le prix au m², laisse price à null et ajoute « prix » à manquant plutôt que de deviner.

5. district est le quartier seul, sans la ville. Quartiers fréquents : Bonapriso, Bali, Bonanjo, Bonamoussadi, Makepe, Logpom, Logbessou, Akwa, Deido, Kotto, Bonabéri, Yassa, Youpwe, Ndogbong, Nyalla, PK14.

6. Un message qui propose PLUSIEURS biens : décris le premier, et ajoute « plusieurs_biens » à « manquant ».

7. Le titre se lit seul dans une liste : « Appartement 3 chambres meublé, Bonapriso », « Terrain 591 m², Logpom ».`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  console.log('[capture-annonces] version', VERSION);

  /* ── Authentification : le gabarit de understand-inbox, à l'identique ── */
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'jeton_absent' }, 401);
  try {
    const cle = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
    if (!cle) return json({ error: 'config_incomplete', detail: 'ni SUPABASE_ANON_KEY ni SUPABASE_PUBLISHABLE_KEY' }, 500);
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, cle,
      { global: { headers: { Authorization: authHeader } } });
    const { data, error } = await asUser.auth.getUser();
    if (error || !data?.user) {
      console.error('[capture-annonces] jeton refuse :', error?.message ?? 'aucun utilisateur');
      return json({ error: 'session_invalide', detail: error?.message ?? null }, 401);
    }
  } catch (e) {
    console.error('[capture-annonces] verification impossible :', String(e));
    return json({ error: 'auth_indisponible', detail: String(e) }, 503);
  }

  const apiKey = Deno.env.get('CRM_SLCM') ?? Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'secret_absent', detail: 'CRM_SLCM non visible par la fonction' }, 500);

  let body: { messages?: Array<{ id?: unknown; texte?: unknown }> };
  try { body = await req.json(); } catch (_e) { return json({ error: 'invalid_json' }, 400); }

  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .map(m => ({ id: Number(m.id), texte: String(m.texte ?? '').trim() }))
    .filter(m => Number.isInteger(m.id) && m.id > 0 && m.texte);
  if (!messages.length) return json({ error: 'paquet_vide' }, 400);
  if (messages.length > PAQUET_MAX) return json({ error: 'paquet_trop_gros', detail: 'au plus ' + PAQUET_MAX }, 413);
  if (messages.some(m => m.texte.length > MESSAGE_MAX)) return json({ error: 'message_too_long' }, 413);

  const workspaceId = Deno.env.get('CRM_SLCM_WORKSPACE') ?? Deno.env.get('ANTHROPIC_WORKSPACE_ID');
  const options = workspaceId ? { headers: { 'anthropic-workspace-id': workspaceId } } : undefined;
  console.log('[capture-annonces] workspace lu :', workspaceId ? workspaceId.slice(0, 12) + '...' : 'ABSENT',
    '— paquet de', messages.length);

  /* Les chevrons du texte sont neutralisés : un message ne doit pas pouvoir
     fermer sa propre balise et se faire passer pour un autre. */
  const contenu = messages
    .map(m => `<message id="${m.id}">\n${m.texte.replace(/</g, '‹').replace(/>/g, '›')}\n</message>`)
    .join('\n\n');

  const client = new Anthropic({ apiKey });
  try {
    const response = await client.messages.create({
      model: MODELE,
      max_tokens: 16000,
      /* Extraction de champs depuis des messages courts : l'effort bas suffit. */
      output_config: { effort: 'low' },
      system: CONSIGNE,
      tools: [OUTIL],
      messages: [{ role: 'user', content: contenu }]
    }, options);

    if (response.stop_reason === 'refusal') {
      console.error('[capture-annonces] le modele a decline :', response.stop_details);
      return json({ error: 'refus', detail: response.stop_details ?? null, version: VERSION }, 422);
    }
    if (response.stop_reason === 'max_tokens') {
      /* Réponse tronquée : mieux vaut un échec franc qu'un paquet à moitié lu. */
      return json({ error: 'reponse_tronquee', version: VERSION }, 502);
    }

    const appel = response.content.find((b) => b.type === 'tool_use');
    const brut = appel && appel.type === 'tool_use'
      ? (appel.input as { annonces?: Array<Record<string, unknown>> }).annonces ?? []
      : [];
    const parId = new Map(brut.map(a => [Number(a.id), a]));

    /* Ceinture et bretelles, comme dans understand-inbox : le CONTENU est
       vérifié, pas seulement la forme. */
    const entier = (v: unknown) => {
      const n = Number(v);
      return v !== null && v !== '' && Number.isInteger(n) && n >= 0 ? n : null;
    };
    const texteOuNull = (v: unknown) => {
      const s = typeof v === 'string' ? v.trim() : '';
      return s ? s : null;
    };

    const resultats = messages.map(({ id }) => {
      const a = parId.get(id);
      /* Un message oublié par le modèle n'est pas « pas un bien » : c'est un
         échec, que le CRM saura relancer. */
      if (!a) return { id, erreur: 'absent_de_la_reponse' };
      if (a.est_une_offre !== true) return { id, bien: null };

      const bien = {
        title: texteOuNull(a.title),
        type: TYPES.includes(a.type as typeof TYPES[number]) ? a.type : null,
        rent_sale: a.rent_sale === 'rent' || a.rent_sale === 'sale' ? a.rent_sale : null,
        price: entier(a.price) || null,
        price_m2: entier(a.price_m2) || null,
        surface_m2: entier(a.surface_m2) || null,
        district: texteOuNull(a.district),
        address: texteOuNull(a.address),
        bedrooms: entier(a.bedrooms),
        furnished: a.furnished === true ? true : null,
        contact: texteOuNull(a.contact),
        frais: texteOuNull(a.frais),
        manquant: Array.isArray(a.manquant) ? a.manquant.map(String) : []
      };
      /* Garde-fou (06/11/2026) : un « prix total » de vente sous 1 million de
         FCFA n'est pas un prix de vente à Douala — c'est presque toujours un
         frais (signature, dossier) ou un prix au m² mal rangé. Constaté sur
         un terrain de 250 m² à Lendi publié à « 300 000 FCFA ». On l'écarte
         et on le signale plutôt que de le publier. */
      if (bien.rent_sale === 'sale' && bien.price !== null && bien.price < PRIX_VENTE_MIN) {
        bien.price = null;
        if (!bien.manquant.includes('prix_douteux')) bien.manquant.push('prix_douteux');
      }
      /* Le total d'un terrain vendu au m² : calculé ICI, jamais par le modèle. */
      if (bien.price === null && bien.surface_m2 && bien.price_m2) {
        bien.price = bien.surface_m2 * bien.price_m2;
        bien.manquant = bien.manquant.filter(m => m !== 'price' && m !== 'prix_douteux');
      }
      return { id, bien };
    });

    console.log('[capture-annonces] usage', JSON.stringify(response.usage));
    return json({ resultats, usage: response.usage, modele: MODELE, version: VERSION });
  } catch (e) {
    console.error('[capture-annonces]', e);
    if (String(e).includes('anthropic-workspace-id')) {
      return json({
        version: VERSION, error: 'workspace_manquant',
        detail: "Ajouter le secret CRM_SLCM_WORKSPACE (voir README)."
      }, 502);
    }
    return json({ error: 'extraction_impossible', detail: String(e), version: VERSION }, 502);
  }
});
