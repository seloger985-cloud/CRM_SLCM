/* ═══════════════════════════════════════════════════════════════════
   MATCH — Rapprochement demandes clients ↔ annonces selogercm.com
           + partage d'une annonce à un client par WhatsApp

   Dépendances : config.js et site.js pour les données, UI pour l'affichage.
   Toutes sont résolues à l'appel, pas au chargement : ce fichier ne fait que
   déclarer des fonctions. L'ordre réel dans index.html — config, auth, site,
   match, ui, app — place donc ui.js APRÈS celui-ci sans que cela pose
   problème. Seule contrainte : charger avant app.js, qui appelle SLCM_MATCH.

   Principe
   --------
   Les annonces ne sont jamais copiées : elles sont lues en direct via
   SLCM_SITE. Le rapprochement se fait en mémoire, dans le navigateur,
   à chaque affichage. Aucune tâche de fond, aucun index à maintenir.

   Un match n'est jamais envoyé automatiquement. Le CRM propose,
   l'agent décide et déclenche l'envoi WhatsApp. C'est délibéré :
   un message mal ciblé coûte plus cher qu'un match manqué.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ─────────────── Correspondance d'un bien à une demande ───────────────

     Depuis le 31/08/2026, l'unité évaluée est une DEMANDE, plus un client.
     Un client peut en porter plusieurs — un studio pour lui, un deux-chambres
     pour sa mère — et c'est la recherche qui a un budget, pas la personne.
     Voir sql/03_demands.sql. */

  /* La transaction n'est plus déduite du type de client : elle est portée par
     la demande, figée au moment de la migration. Une règle implicite en moins. */
  function wantedTransaction(demand) {
    return demand.rent_sale || null;
  }

  function norm(v) {
    return String(v == null ? '' : v).trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  /**
   * Évalue un bien face à une demande.
   * Retourne null si un critère bloquant échoue, sinon { score, reasons }.
   *
   * Le score sert uniquement au tri : un match à 100 n'est pas « meilleur »
   * qu'un match à 70, il est simplement plus proche de ce qui a été demandé.
   */
  function evaluate(listing, demand) {
    if (listing.status !== 'active') return null;

    const tx = wantedTransaction(demand);
    if (!tx || listing.rent_sale !== tx) return null;

    const reasons = [];
    let score = 40; // socle : la transaction correspond

    /* Type de bien — bloquant si une liste est renseignée */
    const types = (demand.wanted_types || []).filter(Boolean);
    if (types.length) {
      if (types.indexOf(listing.type) === -1) return null;
      score += 20;
      reasons.push('type recherché');
    }

    /* Quartier — bloquant si une liste est renseignée */
    const districts = (demand.wanted_districts || []).filter(Boolean);
    if (districts.length) {
      const d = norm(listing.district);
      if (!districts.some(x => norm(x) === d)) return null;
      score += 20;
      reasons.push(listing.district);
    }

    /* Budget — bloquant. Une annonce sans prix reste proposée :
       « prix sur demande » est fréquent et ne doit pas exclure. */
    const price = Number(listing.price) || 0;
    if (demand.budget && price > 0) {
      if (price > Number(demand.budget)) return null;
      score += 15;
      /* Bonus de proximité : un bien à 90 % du budget correspond mieux
         qu'un bien à 30 %, qui sera souvent en deçà des attentes. */
      const ratio = price / Number(demand.budget);
      if (ratio >= 0.6) score += 5;
      reasons.push('dans le budget');
    }
    if (demand.budget_min && price > 0 && price < Number(demand.budget_min)) return null;

    /* Chambres — bloquant */
    if (demand.min_bedrooms) {
      const b = Number(listing.bedrooms) || 0;
      if (b < Number(demand.min_bedrooms)) return null;
      score += 10;
      reasons.push(b + ' ch.');
    }

    /* Meublé — bloquant si exigé */
    if (demand.wants_furnished === true) {
      if (listing.furnished !== true) return null;
      score += 10;
      reasons.push('meublé');
    }

    /* Fraîcheur : une annonce récente passe devant, à score égal */
    const age = (Date.now() - new Date(listing.created_at).getTime()) / 86400000;
    if (age <= 14) score += 5;

    return { score: Math.min(score, 100), reasons };
  }

  /** Vrai si la demande est vivante et porte au moins un critère exploitable. */
  function isLive(demand) {
    return demand.active !== false && !!(
      demand.budget || demand.budget_min || demand.min_bedrooms ||
      demand.wants_furnished === true ||
      (demand.wanted_types && demand.wanted_types.length) ||
      (demand.wanted_districts && demand.wanted_districts.length)
    );
  }

  /* L'historique d'envoi reste indexé sur le CLIENT, pas sur la demande :
     « ne pas envoyer deux fois la même annonce à la même personne » reste
     vrai quel que soit le nombre de ses recherches. */
  function sent(alreadySent, clientId, listingId) {
    return !!(alreadySent && alreadySent.has(clientId + '|' + listingId));
  }

  /** Les annonces qui répondent à UNE demande, meilleures d'abord. */
  function matchesForDemand(demand, listings, alreadySent) {
    if (!isLive(demand)) return [];
    const hits = [];
    listings.forEach(listing => {
      if (sent(alreadySent, demand.client_id, listing.id)) return;
      const r = evaluate(listing, demand);
      if (r) hits.push({ listing, score: r.score, reasons: r.reasons });
    });
    hits.sort((a, b) => b.score - a.score);
    return hits;
  }

  /** L'inverse : les demandes auxquelles répond UNE annonce.
      Même fonction d'évaluation, lue dans l'autre sens — c'est ce qui permet
      d'alerter aussi bien à l'arrivée d'un bien qu'à celle d'une demande. */
  function demandsForListing(listing, demands, alreadySent) {
    const hits = [];
    demands.filter(isLive).forEach(demand => {
      if (sent(alreadySent, demand.client_id, listing.id)) return;
      const r = evaluate(listing, demand);
      if (r) hits.push({ demand, score: r.score, reasons: r.reasons });
    });
    hits.sort((a, b) => b.score - a.score);
    return hits;
  }

  /**
   * Calcule tous les rapprochements, une entrée par demande.
   * @param {array} demands   les demandes, chacune portant son client_id
   * @param {array} listings
   * @param {Set}   alreadySent  clés "clientId|listingId" déjà partagées
   */
  function computeMatches(demands, listings, alreadySent) {
    const out = [];
    demands.filter(isLive).forEach(demand => {
      const hits = matchesForDemand(demand, listings, alreadySent);
      if (!hits.length) return;
      out.push({ demand, hits: hits.slice(0, 8), total: hits.length });
    });
    /* Les demandes avec le meilleur match remontent en premier */
    out.sort((a, b) => (b.hits[0].score - a.hits[0].score) || (b.total - a.total));
    return out;
  }


  /* ─────────────── Veille sur les nouvelles annonces ───────────────

     Une annonce peut apparaître sur selogercm.com sans qu'on touche au CRM.
     Sans repère, elle se noie dans les 24 autres et personne ne la relie à
     la demande qu'elle satisfait. On garde donc la date de la plus récente
     annonce déjà vue, et on signale ce qui est arrivé depuis.

     Le repère vit dans le localStorage : il est propre à ce navigateur, ce
     qui est exactement ce qu'on veut — c'est « ce que MOI j'ai déjà vu »,
     pas un état partagé. */

  const SEEN_KEY = 'slcm-listings-seen';

  function lastSeen() {
    try { return localStorage.getItem(SEEN_KEY) || null; } catch (e) { return null; }
  }

  /** Avance le repère jusqu'à l'annonce la plus récente du lot. */
  function markSeen(listings) {
    const newest = (listings || []).reduce(
      (max, l) => (l.created_at && l.created_at > max ? l.created_at : max), '');
    if (!newest) return;
    try { localStorage.setItem(SEEN_KEY, newest); } catch (e) {}
  }

  /**
   * Les annonces parues depuis le dernier passage QUI correspondent à une
   * demande en cours. Une nouveauté sans preneur n'est pas une alerte.
   * @returns {array} [{ listing, demands: [{demand, score, reasons}] }]
   */
  function freshMatches(demands, listings, alreadySent) {
    const since = lastSeen();

    /* Première utilisation : on pose le repère sans rien signaler. Sinon
       l'agent recevrait une alerte pour tout le stock existant. */
    if (!since) { markSeen(listings); return []; }

    const out = [];
    listings
      .filter(l => l.created_at && l.created_at > since)
      .forEach(listing => {
        const hits = demandsForListing(listing, demands, alreadySent);
        if (hits.length) out.push({ listing, demands: hits });
      });
    return out;
  }

  /* ─────────────── Partage ─────────────── */

  function listingUrl(listing) {
    return listing.slug ? 'https://selogercm.com/annonce/' + listing.slug : null;
  }

  /** Message WhatsApp prêt à envoyer, adapté location / vente. */
  function shareMessage(listing, client) {
    const url = listingUrl(listing);
    const price = Number(listing.price) > 0
      ? Number(listing.price).toLocaleString('fr-FR') + ' FCFA' + (listing.rent_sale === 'rent' ? '/mois' : '')
      : 'prix sur demande';
    const where = [listing.district, listing.city].filter(Boolean).join(', ');
    const bits = [];
    if (listing.bedrooms) bits.push(listing.bedrooms + ' chambres');
    if (listing.furnished) bits.push('meublé');

    return 'Bonjour ' + (client.name || '') + ',\n\n'
      + 'Voici un bien qui correspond à votre recherche :\n\n'
      + (listing.title || 'Bien disponible') + '\n'
      + (where ? where + '\n' : '')
      + (bits.length ? bits.join(' · ') + '\n' : '')
      + price + '\n\n'
      + (url ? 'Photos et détails : ' + url + '\n\n' : '')
      + 'Dites-moi si vous souhaitez le visiter.\n'
      + 'SE LOGER CM';
  }

  /** Trace l'envoi pour ne plus reproposer ce bien à ce client. */
  async function markShared(clientId, listing) {
    try {
      const db = window.SLCM_DB.getClient();
      await db.from('shared_listings').upsert([{
        client_id: clientId,
        listing_id: listing.id,
        listing_slug: listing.slug || null,
        channel: 'whatsapp'
      }], { onConflict: 'owner_id,client_id,listing_id', ignoreDuplicates: true });
    } catch (e) {
      /* L'historique est un confort, pas une condition : on n'empêche
         jamais un envoi parce que la trace a échoué. */
      console.error('[match] markShared:', e && e.message);
    }
  }

  /** Charge l'historique des envois sous forme de clés "clientId|listingId". */
  async function loadShared() {
    try {
      const db = window.SLCM_DB.getClient();
      const { data, error } = await db.from('shared_listings').select('client_id,listing_id');
      if (error) throw error;
      return new Set((data || []).map(r => r.client_id + '|' + r.listing_id));
    } catch (e) {
      console.error('[match] loadShared:', e && e.message);
      return new Set();
    }
  }

  window.SLCM_MATCH = {
    evaluate, isLive, computeMatches,
    matchesForDemand, demandsForListing,
    freshMatches, markSeen, lastSeen,
    shareMessage, listingUrl, markShared, loadShared,
    wantedTransaction
  };
})();
