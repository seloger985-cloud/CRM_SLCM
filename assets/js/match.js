/* ═══════════════════════════════════════════════════════════════════
   MATCH — Rapprochement demandes clients ↔ annonces selogercm.com
           + partage d'une annonce à un client par WhatsApp

   Dépendances : config.js, site.js, ui.js  (charger avant app.js)

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

  /* ─────────────── Correspondance d'un bien à une demande ─────────────── */

  /* Transaction : explicite si renseignée, sinon déduite du type de client. */
  function wantedTransaction(client) {
    if (client.rent_sale) return client.rent_sale;
    if (client.type === 'buyer') return 'sale';
    if (client.type === 'renter') return 'rent';
    return null; // vendeur ou non renseigné : pas de matching
  }

  function norm(v) {
    return String(v == null ? '' : v).trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Évalue un bien face à une demande.
   * Retourne null si un critère bloquant échoue, sinon { score, reasons }.
   *
   * Le score sert uniquement au tri : un match à 100 n'est pas « meilleur »
   * qu'un match à 70, il est simplement plus proche de ce qui a été demandé.
   */
  function evaluate(listing, client) {
    if (listing.status !== 'active') return null;

    const tx = wantedTransaction(client);
    if (!tx || listing.rent_sale !== tx) return null;

    const reasons = [];
    let score = 40; // socle : la transaction correspond

    /* Type de bien — bloquant si une liste est renseignée */
    const types = (client.wanted_types || []).filter(Boolean);
    if (types.length) {
      if (types.indexOf(listing.type) === -1) return null;
      score += 20;
      reasons.push('type recherché');
    }

    /* Quartier — bloquant si une liste est renseignée */
    const districts = (client.wanted_districts || []).filter(Boolean);
    if (districts.length) {
      const d = norm(listing.district);
      if (!districts.some(x => norm(x) === d)) return null;
      score += 20;
      reasons.push(listing.district);
    }

    /* Budget — bloquant. Une annonce sans prix reste proposée :
       « prix sur demande » est fréquent et ne doit pas exclure. */
    const price = Number(listing.price) || 0;
    if (client.budget && price > 0) {
      if (price > Number(client.budget)) return null;
      score += 15;
      /* Bonus de proximité : un bien à 90 % du budget correspond mieux
         qu'un bien à 30 %, qui sera souvent en deçà des attentes. */
      const ratio = price / Number(client.budget);
      if (ratio >= 0.6) score += 5;
      reasons.push('dans le budget');
    }
    if (client.budget_min && price > 0 && price < Number(client.budget_min)) return null;

    /* Chambres — bloquant */
    if (client.min_bedrooms) {
      const b = Number(listing.bedrooms) || 0;
      if (b < Number(client.min_bedrooms)) return null;
      score += 10;
      reasons.push(b + ' ch.');
    }

    /* Meublé — bloquant si exigé */
    if (client.wants_furnished === true) {
      if (listing.furnished !== true) return null;
      score += 10;
      reasons.push('meublé');
    }

    /* Fraîcheur : une annonce récente passe devant, à score égal */
    const age = (Date.now() - new Date(listing.created_at).getTime()) / 86400000;
    if (age <= 14) score += 5;

    return { score: Math.min(score, 100), reasons };
  }

  /** Vrai si la fiche client porte au moins un critère exploitable. */
  function hasDemand(client) {
    return client.matching_active !== false && !!(
      client.budget || client.budget_min || client.min_bedrooms ||
      client.wants_furnished === true ||
      (client.wanted_types && client.wanted_types.length) ||
      (client.wanted_districts && client.wanted_districts.length)
    );
  }

  /**
   * Calcule tous les rapprochements.
   * @param {array} clients
   * @param {array} listings
   * @param {Set}   alreadySent  clés "clientId|listingId" déjà partagées
   */
  function computeMatches(clients, listings, alreadySent) {
    const out = [];
    clients.filter(hasDemand).forEach(client => {
      const hits = [];
      listings.forEach(listing => {
        if (alreadySent && alreadySent.has(client.id + '|' + listing.id)) return;
        const r = evaluate(listing, client);
        if (r) hits.push({ listing, score: r.score, reasons: r.reasons });
      });
      if (!hits.length) return;
      hits.sort((a, b) => b.score - a.score);
      out.push({ client, hits: hits.slice(0, 8), total: hits.length });
    });
    /* Les clients avec le meilleur match remontent en premier */
    out.sort((a, b) => (b.hits[0].score - a.hits[0].score) || (b.total - a.total));
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
    evaluate, hasDemand, computeMatches,
    shareMessage, listingUrl, markShared, loadShared,
    wantedTransaction
  };
})();
