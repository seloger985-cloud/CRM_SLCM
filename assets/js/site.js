/* ═══════════════════════════════════════════════════════════════════
   SITE — Pont lecture seule vers la base de selogercm.com

   Le CRM et le site vivent dans deux projets Supabase distincts :
     CRM  : dukwtseqticijlvrmkgz  (données privées, RLS authentifié)
     SITE : hozlyddiqodvjguqywty  (annonces publiques)

   On NE copie PAS les annonces dans le CRM. Un second client Supabase,
   en lecture seule, interroge directement la base du site. Conséquence :
   aucune synchronisation à maintenir, aucune donnée périmée, et une
   annonce modifiée sur le site l'est instantanément dans le CRM.

   Quand un bien du site a besoin de données CRM — commission, contact
   propriétaire, historique de négociation — on crée une fiche dans
   `properties` portant `listing_id` + `listing_slug`. La fiche pointe
   vers l'annonce, elle ne la duplique pas.

   La clé utilisée est la clé anon publique du site : elle est déjà
   servie à tous les visiteurs de selogercm.com. Aucun secret ici.

   À charger APRÈS config.js, AVANT app.js.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const SITE_URL = 'https://hozlyddiqodvjguqywty.supabase.co';
  const SITE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhvemx5ZGRpcW9kdmpndXF5d3R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxNzA1NzcsImV4cCI6MjA4OTc0NjU3N30.nRbbqF9SpwxztK0LI2BWWZwk39phGdCnO9MgIbmcG68';

  /* Colonnes du site (rappel : district, rent_sale, plots-of-land) */
  const COLS = 'id,slug,title,price,district,city,type,rent_sale,bedrooms,status,furnished,created_at';

  const CACHE_MS = 5 * 60 * 1000;
  let _cache = null;
  let _cachedAt = 0;

  /* Client séparé : pas de persistSession, il ne doit jamais écraser
     la session d'authentification du CRM dans le localStorage. */
  let _client = null;
  function client() {
    if (_client) return _client;
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error('supabase-js non chargé.');
    }
    _client = window.supabase.createClient(SITE_URL, SITE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    return _client;
  }

  /**
   * Récupère les annonces du site.
   * @param {object} opts  { status: 'active'|'all', force: bool }
   */
  async function fetchListings(opts) {
    opts = opts || {};
    const now = Date.now();
    if (_cache && !opts.force && (now - _cachedAt) < CACHE_MS) return _cache;

    try {
      let q = client().from('listings').select(COLS).order('created_at', { ascending: false }).limit(500);
      if (opts.status !== 'all') q = q.eq('status', 'active');
      const { data, error } = await q;
      if (error) throw error;
      _cache = data || [];
      _cachedAt = now;
      return _cache;
    } catch (e) {
      console.error('[site] fetchListings:', e && e.message);
      /* Dégradation silencieuse : le CRM reste utilisable sans le site. */
      return _cache || [];
    }
  }

  /** Une annonce précise, par id ou par slug. */
  async function fetchListing(ref) {
    try {
      const col = /^[0-9a-f-]{36}$/i.test(String(ref)) ? 'id' : 'slug';
      const { data, error } = await client().from('listings').select(COLS).eq(col, ref).maybeSingle();
      if (error) throw error;
      return data || null;
    } catch (e) {
      console.error('[site] fetchListing:', e && e.message);
      return null;
    }
  }

  /** Compteurs pour le tableau de bord, sans re-télécharger. */
  async function stats() {
    const rows = await fetchListings();
    const by = (k) => rows.reduce((m, r) => { const v = r[k] || '—'; m[v] = (m[v] || 0) + 1; return m; }, {});
    return { total: rows.length, byType: by('type'), byDistrict: by('district'), byTransaction: by('rent_sale') };
  }

  window.SLCM_SITE = { fetchListings, fetchListing, stats, url: SITE_URL };
})();
