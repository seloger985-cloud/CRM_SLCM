/* ═══════════════ TEXTE PUBLIC D'UNE ANNONCE (15/11/2026) ═══════════════

   À la publication sur selogercm.com, la description vient désormais du
   MESSAGE D'ORIGINE de l'annonceur (l'offre captée dans un groupe, sinon la
   description de la fiche), réécrit par capture-annonces (mode « rediger »)
   sans rien de ce qui le concerne : nom, numéro, agence, commission, frais
   de visite, « me laisser la visite »…

   Jusqu'ici le texte public était reconstruit depuis les seuls champs —
   « Appartement, 3 chambres à Bonapriso. » — par prudence : le message du
   confrère porte son numéro. La prudence reste, en trois couches :
     1. la consigne du modèle (tout ce qui concerne l'annonceur sort) ;
     2. la fonction efface numéros, liens et adresses e-mail, et refuse un
        texte qui cite encore le confrère (`interdits`) ;
     3. ici, `trace()` revérifie avant publication — y compris un texte
        retouché à la main.
   Le site efface de son côté tout numéro (crm-publier).

   Le texte rédigé est gardé sur la fiche (`properties.texte_public`, sql/20) :
   rédigé une fois, retouchable, réutilisé si l'on republie. Sans la colonne
   (migration pas encore jouée), tout marche, simplement sans mémoire.

   Partagé par index.html (publication avec photos) et par la page visuel
   (terrains, lots des groupes). Fonctions pures testées sous Node
   (tests/test-texte-public.js). */
(function (racine) {
  'use strict';

  const cle = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /* Des mots qui reviennent dans les noms d'agences sans désigner personne :
     les interdire bloquerait « Maison de 4 chambres » ou « Douala ». */
  const MOTS_COMMUNS = new Set(['immo', 'immobilier', 'immobiliere', 'agence', 'agent', 'services', 'service',
    'group', 'groupe', 'consulting', 'douala', 'yaounde', 'cameroun', 'cameroon', 'sarl', 'real', 'estate',
    'home', 'homes', 'house', 'maison', 'terrain', 'terrains', 'foncier', 'fonciere', 'habitat', 'logement',
    'location', 'vente', 'invest', 'business', 'bien', 'biens', 'confrere', 'plus', 'pro', 'international']);

  /* Les mots qui désignent l'annonceur : son nom, son alias WhatsApp, son
     agence, l'auteur de l'export. Un numéro n'y figure pas : les numéros
     sont effacés à part, quels qu'ils soient. */
  function interdits(confrere, capture) {
    const sources = [
      confrere && String(confrere.name || '').replace(/^Confrère\s+/i, ''),
      confrere && confrere.wa_alias, confrere && confrere.agency, capture && capture.auteur
    ];
    const mots = new Set();
    sources.forEach(s => {
      if (!s || /^[+\d\s.()-]+$/.test(s)) return;
      cle(s).split(/[^a-z0-9]+/).forEach(m => {
        if (m.length >= 4 && !/^\d+$/.test(m) && !MOTS_COMMUNS.has(m)) mots.add(m);
      });
    });
    return [...mots];
  }

  /* Le premier mot interdit présent dans le texte (mot entier, sans accents
     ni casse), ou '' si le texte est propre. */
  function trace(texte, mots) {
    const t = ' ' + cle(texte).replace(/[^a-z0-9]+/g, ' ') + ' ';
    return (mots || []).find(m => t.indexOf(' ' + m + ' ') !== -1) || '';
  }

  /* Le message d'origine : l'offre captée si la fiche en vient, sinon la
     description de la fiche, débarrassée de la ligne « Vu dans « … » le … »
     que le CRM y ajoute. */
  function messageDOrigine(bien, capture) {
    const m = capture && String(capture.message || '').trim();
    if (m) return m;
    return String((bien && bien.description) || '')
      .replace(/\n*Vu dans « [^»]*» le [^\n]*$/, '')
      .replace(/^Importé depuis selogercm\.com$/, '')
      .trim();
  }

  /* Le texte publié : « Situé : … » d'abord, puis le texte rédigé — ou,
     faute de texte, les lignes de repli (celles du visuel). */
  function description(lieu, texte, repli) {
    return [lieu ? 'Situé : ' + lieu + '.' : '', texte || '', texte ? '' : (repli || []).filter(Boolean).join('\n')]
      .filter(Boolean).join('\n');
  }

  /* ── Ce qui touche la base et la fonction ── */

  /* L'offre captée d'où vient la fiche (la plus ancienne), ou null. */
  async function captureDe(client, propertyId) {
    try {
      const { data } = await client.from('annonces_captees')
        .select('message,groupe,posted_at,auteur,contact').eq('property_id', propertyId)
        .order('posted_at', { ascending: true }).limit(1);
      return (data && data[0]) || null;
    } catch (e) { return null; }
  }

  /* Lus et écrits À PART de TABLE_COLS : sans la colonne (sql/20 pas encore
     jouée), la liste des biens ne doit pas se vider. */
  async function lireTextes(client, ids) {
    const out = new Map();
    if (!ids.length) return out;
    try {
      const { data, error } = await client.from('properties').select('id,texte_public').in('id', ids);
      if (!error) (data || []).forEach(r => { if (r.texte_public) out.set(r.id, r.texte_public); });
    } catch (e) { /* colonne absente : pas de mémoire */ }
    return out;
  }
  async function enregistrer(client, id, texte) {
    try {
      const { error } = await client.from('properties').update({ texte_public: texte || null }).eq('id', id);
      if (error) console.warn('[texte-public] non enregistré (sql/20 jouée ?) :', error.message);
    } catch (e) { /* idem */ }
  }

  /* Rédige le texte public d'une ou plusieurs fiches (20 au plus : un lot).
     `fiches` : [{ id, type, rent_sale, description, confrere_id }]. Rend une
     Map id → { texte } | { erreur }. Les fiches sans message d'origine sont
     rendues avec { erreur: 'sans_message' }, sans appel. */
  async function rediger(client, fiches, confreres) {
    const out = new Map();
    const confParId = new Map((confreres || []).map(c => [c.id, c]));
    const envoi = [];
    for (const f of fiches) {
      const cap = await captureDe(client, f.id);
      const texte = messageDOrigine(f, cap);
      if (!texte) { out.set(f.id, { erreur: 'sans_message' }); continue; }
      envoi.push({ id: f.id, texte: texte.slice(0, 4000), type: f.type || null, rent_sale: f.rent_sale || null,
                   interdits: interdits(confParId.get(f.confrere_id), cap) });
    }
    if (!envoi.length) return out;
    try {
      const { data, error } = await client.functions.invoke('capture-annonces', { body: { mode: 'rediger', biens: envoi } });
      if (error) {
        let motif = error.message;
        try { const j = await error.context.clone().json(); motif = j.error || motif; } catch (e) { /* tant pis */ }
        throw new Error(motif);
      }
      (data && data.resultats || []).forEach(r => out.set(Number(r.id), r.texte ? { texte: r.texte } : { erreur: r.erreur || 'vide' }));
      /* Revérifié ici : la fonction déployée peut être une version ancienne. */
      envoi.forEach(e => {
        const r = out.get(e.id);
        if (!r) out.set(e.id, { erreur: 'absent_de_la_reponse' });
        else if (r.texte && trace(r.texte, e.interdits)) out.set(e.id, { erreur: 'trace_annonceur : ' + trace(r.texte, e.interdits) });
      });
    } catch (e) {
      envoi.forEach(x => out.set(x.id, { erreur: 'redaction_impossible : ' + ((e && e.message) || e) }));
    }
    return out;
  }

  /* Libellé d'un refus, pour l'écran. */
  function motif(erreur) {
    const e = String(erreur || '');
    if (e === 'sans_message') return 'pas de message d’origine';
    if (e.indexOf('trace_annonceur') === 0) return 'le texte citait encore l’annonceur (' + e.split(': ')[1] + ')';
    /* Une version d'avant le 15/11 ne connaît pas `mode` : elle cherche
       des `messages`, n'en trouve pas, et répond « paquet_vide ». */
    if (/mode_inconnu|paquet_vide/.test(e)) return 'fonction capture-annonces à redéployer (version 2026-11-15-a)';
    return e;
  }

  const api = { interdits, trace, messageDOrigine, description, captureDe, lireTextes, enregistrer, rediger, motif };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else racine.SLCM_TEXTE = api;
})(typeof window !== 'undefined' ? window : this);
