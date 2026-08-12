/* ═══════════════════════════════════════════════════════════════════
   AUTH — Garde de session.

   Charge après config.js, avant app.js.

   Comportement :
     - pas de session  → redirection vers login.html (avec ?next=)
     - session valide  → window.SLCM_SESSION renseignée, page révélée,
                         événement 'slcm:auth-ready' émis
     - déconnexion depuis un autre onglet → redirection immédiate

   Le <body> est masqué par une règle inline dans le <head> de chaque
   page et n'est révélé qu'ici : sans ça, le contenu du CRM clignote
   à l'écran avant la redirection.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const LOGIN_PAGE = 'login.html';

  function isLoginPage() {
    return /(^|\/)login\.html$/.test(window.location.pathname);
  }

  function reveal() {
    document.body.style.visibility = 'visible';
  }

  function toLogin() {
    const next = window.location.pathname + window.location.search;
    window.location.replace(LOGIN_PAGE + '?next=' + encodeURIComponent(next));
  }

  async function guard() {
    let client;
    try {
      client = window.SLCM_DB.getClient();
    } catch (e) {
      console.error('[auth]', e);
      reveal();
      return;
    }

    const { data, error } = await client.auth.getSession();
    const session = (data && data.session) || null;

    if (error) console.error('[auth] getSession:', error.message);

    if (!session) {
      if (!isLoginPage()) { toLogin(); return; }
      reveal();
      return;
    }

    /* Session valide */
    if (isLoginPage()) {
      const params = new URLSearchParams(window.location.search);
      window.location.replace(params.get('next') || 'index.html');
      return;
    }

    window.SLCM_SESSION = session;
    window.SLCM_USER_EMAIL = session.user && session.user.email;
    reveal();
    document.dispatchEvent(new Event('slcm:auth-ready'));

    /* Déconnexion déclenchée ailleurs (autre onglet, token expiré) */
    client.auth.onAuthStateChange((event, s) => {
      if (!s && event === 'SIGNED_OUT' && !isLoginPage()) toLogin();
    });
  }

  window.SLCM_AUTH = {
    async signOut() {
      try {
        await window.SLCM_DB.getClient().auth.signOut();
      } catch (e) {
        console.error('[auth] signOut:', e);
      }
      window.location.replace(LOGIN_PAGE);
    },
    email() { return window.SLCM_USER_EMAIL || null; }
  };

  if (document.body) guard();
  else document.addEventListener('DOMContentLoaded', guard, { once: true });
})();
