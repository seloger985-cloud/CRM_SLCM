/* ═══════════════════════════════════════════════════════════════════
   CONFIG — Source unique du client Supabase.

   Avant : les credentials étaient déclarés deux fois (app.js ligne 2,
   facture.html ligne 686). Une rotation de clé obligeait à éditer deux
   fichiers, et l'oubli était silencieux. Ici, un seul endroit.

   La clé anon est publique par nature : elle est servie au navigateur,
   on ne peut pas la cacher. Ce n'est pas un secret — c'est un
   identifiant de projet. La sécurité réelle est assurée par le RLS
   (voir sql/02_rls.sql), qui exige une session authentifiée.

   À charger AVANT ui.js, auth.js et app.js.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://dukwtseqticijlvrmkgz.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1a3d0c2VxdGljaWpsdnJta2d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTYzMDIsImV4cCI6MjA5MzU5MjMwMn0.u-FH3WhZxIpE9uJtTDF1IWOOht-ooPgAqwsnyZmUNa4';

  let _client = null;

  function getClient() {
    if (_client) return _client;
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error('supabase-js non chargé : vérifie l\'ordre des <script>.');
    }
    _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'slcm-crm-auth'
      }
    });
    return _client;
  }

  window.SLCM_CONFIG = { SUPABASE_URL: SUPABASE_URL };

  /* Compatibilité avec le code existant : facture.html appelle
     window.SLCM_DB.init() (async), app.js utilise le client direct. */
  window.SLCM_DB = {
    getClient: getClient,
    init: async function () { return getClient(); }
  };
})();
