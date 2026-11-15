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
//
//  ── Mode « rediger » (15/11/2026) ──
//
//  { mode: 'rediger', biens: [{ id, texte, type, rent_sale, interdits }] }
//  rend, pour chaque bien, le TEXTE PUBLIC de son annonce sur selogercm.com,
//  réécrit depuis le message d'origine sans rien de ce qui concerne
//  l'annonceur. Appelé à la publication seulement (quelques biens par jour),
//  jamais sur tout ce que les groupes déversent. Voir assets/js/texte-public.js.
// ════════════════════════════════════════════════════════════════════

/* Même version épinglée que understand-inbox : c'est celle qui tourne. */
import Anthropic from 'npm:@anthropic-ai/sdk@0.123.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.0';

/* À incrémenter dès qu'on touche ce fichier. Voir README, « Vérifier QUELLE
   version tourne ». */
const VERSION = '2026-11-15-a';

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

5. district est le QUARTIER seul, sans la ville. Quartiers fréquents : Bonapriso, Bali, Bonanjo, Bonamoussadi, Makepe, Logpom, Logbessou, Akwa, Deido, Kotto, Bonabéri, Yassa, Youpwe, Ndogbong, Nyalla, Lendi, PK14.
   Un SECTEUR n'est pas un quartier : c'est une partie d'un quartier. Secteurs connus : Denver et Santa Barbara (à Bonamoussadi), Cité Chirac (à Yassa). Pour un secteur, district reçoit le QUARTIER et address commence par le secteur.
   Exemple : « Terrain à Denver » donne district: "Bonamoussadi", address: "Denver".
   Exemple : « Villa Cité Chirac, Yassa » donne district: "Yassa", address: "Cité Chirac".
   Un lieu que tu ne sais pas rattacher à un quartier va dans address, et district reste null — ne devine pas le quartier.

6. Un message qui propose PLUSIEURS biens : décris le premier, et ajoute « plusieurs_biens » à « manquant ».

7. Le titre se lit seul dans une liste : « Appartement 3 chambres meublé, Bonapriso », « Terrain 591 m², Logpom ».`;

/* ═══════════ Mode « rediger » : le texte public d'une annonce ═══════════
   Un lot de publication compte au plus 20 fiches (CRM, « Publier les ventes
   sur le site »). */
const REDIGER_MAX = 20;

const OUTIL_REDIGER = {
  name: 'rediger_textes',
  description: "Rend le texte public de CHAQUE bien reçu, une entrée par bien, dans l'ordre.",
  input_schema: {
    type: 'object' as const,
    properties: {
      textes: {
        type: 'array',
        items: {
          type: 'object' as const,
          properties: {
            id: { type: 'integer', description: "L'identifiant du bien, recopié tel quel." },
            texte_public: {
              type: ['string', 'null'],
              description: "Le texte de l'annonce, ou null si le message ne dit rien du bien lui-même."
            }
          },
          required: ['id', 'texte_public'],
          additionalProperties: false
        }
      }
    },
    required: ['textes'],
    additionalProperties: false
  }
};

const CONSIGNE_REDIGER = `Tu rédiges le texte public d'annonces immobilières pour selogercm.com, le site de l'agence SE LOGER CM à Douala, au Cameroun. Chaque bien t'arrive encadré par <bien id="…" type="…" mode="…">, avec le message d'origine d'un CONFRÈRE (un autre agent) qui l'a proposé dans un groupe WhatsApp. L'annonce sera publiée au nom de l'agence : le visiteur ne doit JAMAIS pouvoir identifier ni joindre le confrère.

Pour CHAQUE bien, rends une entrée avec le même id, en appelant une seule fois l'outil rediger_textes.

1. GARDE les faits sur le bien, et seulement eux :
   · terrain : surface, nature des papiers (titre foncier, morcellement, certificat de propriété…), accès et route, distance au goudron, viabilisation (eau, électricité), relief, environnement, repères de situation ;
   · logement en location : pièces, standing, équipements, eau et électricité (compteurs), parking, gardiennage, étage, conditions de bail (caution, avance en mois de loyer) ;
   · bien bâti à vendre : papiers, surface du terrain et du bâti, niveaux, pièces, équipements, état.

2. ENLÈVE tout ce qui concerne l'annonceur ou les intermédiaires : noms et prénoms de personnes, numéros de téléphone, agences et leurs noms, liens, adresses e-mail, « contactez-moi », « inbox », « en privé », « mp », « me laisser la visite », « visite avec moi », « collaboration », « partage », commission, frais de visite, frais de signature, frais de dossier, frais d'agence, honoraires, « propriétaire direct », mentions de groupe.

3. LE PRIX N'Y FIGURE PAS : ni prix total, ni prix au m², ni loyer. Le site les affiche à part ; un prix recopié ici pourrait le contredire.

4. N'INVENTE RIEN. Pas un mot sur ce que le message ne dit pas : ni « bien sécurisé », ni « quartier calme », ni « idéal pour investir », si le message ne le dit pas.

5. Écris en français correct, à la troisième personne, sans émoji, sans majuscules criardes, sans abréviations de messagerie (« ch » devient « chambres », « TF » devient « titre foncier », « sdb » devient « salle de bain »). Deux à cinq phrases courtes. Pas de titre, pas de liste à puces.

6. Si le message ne dit rien du bien lui-même au-delà de son type, de son quartier et de son prix, texte_public vaut null.`;

/* Ce que le code efface, quoi qu'ait écrit le modèle. */
const NUMERO = /\+?\d[\d\s.-]{7,}\d/g;
const LIEN = /\b(?:https?:\/\/|www\.)\S+/gi;
const COURRIEL = /\S+@\S+\.\S+/g;
const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function rediger(biensRecus: unknown, apiKey: string) {
  /* Typage explicite, sans narrowing implicite : le déploiement vérifie
     les types, et un `unknown` mal rétréci le fait échouer. */
  const recus: Array<Record<string, unknown>> = Array.isArray(biensRecus)
    ? (biensRecus as unknown[]).map(b => (b && typeof b === 'object' ? b as Record<string, unknown> : {}))
    : [];
  const biens = recus
    .map((b) => {
      const type = String(b.type ?? '');
      const liste: unknown[] = Array.isArray(b.interdits) ? (b.interdits as unknown[]) : [];
      return {
        id: Number(b.id),
        texte: String(b.texte ?? '').trim(),
        type: (TYPES as readonly string[]).includes(type) ? type : '',
        mode: b.rent_sale === 'rent' ? 'location' : (b.rent_sale === 'sale' ? 'vente' : ''),
        interdits: liste.map((x) => sansAccents(String(x))).filter((x) => x.length >= 4)
      };
    })
    .filter(b => Number.isInteger(b.id) && b.id > 0 && b.texte);
  if (!biens.length) return json({ error: 'paquet_vide', version: VERSION }, 400);
  if (biens.length > REDIGER_MAX) return json({ error: 'paquet_trop_gros', detail: 'au plus ' + REDIGER_MAX }, 413);
  if (biens.some(b => b.texte.length > MESSAGE_MAX)) return json({ error: 'message_too_long' }, 413);

  const workspaceId = Deno.env.get('CRM_SLCM_WORKSPACE') ?? Deno.env.get('ANTHROPIC_WORKSPACE_ID');
  const options = workspaceId ? { headers: { 'anthropic-workspace-id': workspaceId } } : undefined;
  console.log('[capture-annonces] rediger — paquet de', biens.length);

  const contenu = biens
    .map(b => `<bien id="${b.id}" type="${b.type}" mode="${b.mode}">\n${b.texte.replace(/</g, '‹').replace(/>/g, '›')}\n</bien>`)
    .join('\n\n');

  try {
    const response = await new Anthropic({ apiKey }).messages.create({
      model: MODELE,
      max_tokens: 8000,
      output_config: { effort: 'low' },
      system: CONSIGNE_REDIGER,
      tools: [OUTIL_REDIGER],
      tool_choice: { type: 'tool', name: 'rediger_textes' },
      messages: [{ role: 'user', content: contenu }]
    }, options);

    if (response.stop_reason === 'refusal') return json({ error: 'refus', version: VERSION }, 422);
    if (response.stop_reason === 'max_tokens') return json({ error: 'reponse_tronquee', version: VERSION }, 502);

    const appel = response.content.find((b) => b.type === 'tool_use');
    const brut = appel && appel.type === 'tool_use'
      ? (appel.input as { textes?: Array<Record<string, unknown>> }).textes ?? []
      : [];
    const parId = new Map(brut.map(t => [Number(t.id), t]));

    const resultats = biens.map(({ id, interdits }) => {
      const t = parId.get(id);
      if (!t) return { id, erreur: 'absent_de_la_reponse' };
      let texte = typeof t.texte_public === 'string' ? t.texte_public : '';
      texte = texte.replace(LIEN, '').replace(COURRIEL, '').replace(NUMERO, '')
        .replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
      if (!texte) return { id, erreur: 'vide' };
      /* Le nom du confrère, son alias ou son agence encore là : refusé, et
         non « corrigé » — un texte amputé d'un mot au hasard se lit mal. */
      const plat = ' ' + sansAccents(texte).replace(/[^a-z0-9]+/g, ' ') + ' ';
      const reste = interdits.find(m => plat.includes(' ' + m + ' '));
      if (reste) return { id, erreur: 'trace_annonceur : ' + reste };
      return { id, texte };
    });

    console.log('[capture-annonces] rediger usage', JSON.stringify(response.usage));
    return json({ resultats, usage: response.usage, modele: MODELE, version: VERSION });
  } catch (e) {
    console.error('[capture-annonces] rediger', e);
    return json({ error: 'redaction_impossible', detail: String(e), version: VERSION }, 502);
  }
}

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

  let body: { mode?: unknown; biens?: unknown; messages?: Array<{ id?: unknown; texte?: unknown }> };
  try { body = await req.json(); } catch (_e) { return json({ error: 'invalid_json' }, 400); }

  if (body.mode === 'rediger') return await rediger(body.biens, apiKey);
  if (body.mode !== undefined) return json({ error: 'mode_inconnu', version: VERSION }, 400);

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
