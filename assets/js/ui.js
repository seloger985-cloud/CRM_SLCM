/* =====================================================================
   ui.js — Composants UX réutilisables pour le CRM
   Exposé via window.UI pour usage simple dans app.js et facture.html
   Aucune dépendance externe.
   ===================================================================== */
(function () {
  'use strict';

  /* ─── Toast container singleton ────────────────────────────────── */
  function ensureToastContainer() {
    let c = document.getElementById('toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toast-container';
      document.body.appendChild(c);
    }
    return c;
  }

  const TOAST_ICONS = {
    success: '✓',
    error:   '✕',
    warning: '!',
    info:    'i'
  };

  /**
   * Affiche un toast en bas à droite.
   * @param {string} message - Texte du toast
   * @param {'success'|'error'|'warning'|'info'} [type='info']
   * @param {number} [duration=3500] - Auto-dismiss en ms. 0 = sticky.
   */
  function toast(message, type, duration) {
    type = type || 'info';
    duration = (duration === undefined) ? 3500 : duration;

    const container = ensureToastContainer();
    const el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.setAttribute('role', 'status');
    el.innerHTML =
      '<span class="toast-icon">' + TOAST_ICONS[type] + '</span>' +
      '<span class="toast-message"></span>' +
      '<button class="toast-close" aria-label="Fermer">×</button>';
    el.querySelector('.toast-message').textContent = message;

    const close = () => {
      if (el.classList.contains('is-leaving')) return;
      el.classList.add('is-leaving');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    };

    el.querySelector('.toast-close').addEventListener('click', close);
    container.appendChild(el);

    if (duration > 0) setTimeout(close, duration);

    return { close };
  }

  /* ─── Modal générique ──────────────────────────────────────────── */

  /**
   * Ouvre une modal. Retourne { close, el }.
   * @param {object} opts
   * @param {string} opts.title
   * @param {string|HTMLElement} opts.body - Contenu (string = textContent, sinon DOM)
   * @param {Array<{label, variant?, onClick?}>} [opts.actions] - Boutons du footer
   * @param {boolean} [opts.closeOnOverlay=true]
   * @param {function} [opts.onClose]
   */
  function modal(opts) {
    opts = opts || {};
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modalEl = document.createElement('div');
    modalEl.className = 'modal';
    modalEl.setAttribute('role', 'dialog');
    modalEl.setAttribute('aria-modal', 'true');

    /* Header */
    const header = document.createElement('div');
    header.className = 'modal-header';
    const title = document.createElement('h3');
    title.className = 'modal-title';
    title.textContent = opts.title || '';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.setAttribute('aria-label', 'Fermer');
    closeBtn.innerHTML = '×';
    header.appendChild(title);
    header.appendChild(closeBtn);

    /* Body */
    const body = document.createElement('div');
    body.className = 'modal-body';
    if (typeof opts.body === 'string') {
      const p = document.createElement('p');
      p.textContent = opts.body;
      body.appendChild(p);
    } else if (opts.body instanceof HTMLElement) {
      body.appendChild(opts.body);
    }

    /* Footer */
    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    const actions = opts.actions || [{ label: 'OK', variant: 'primary' }];

    modalEl.appendChild(header);
    modalEl.appendChild(body);

    let closed = false;
    function close(result) {
      if (closed) return;
      closed = true;
      overlay.classList.add('is-leaving');
      overlay.addEventListener('animationend', () => {
        overlay.remove();
        if (typeof opts.onClose === 'function') opts.onClose(result);
      }, { once: true });
    }

    actions.forEach(action => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-' + (action.variant || 'outline');
      btn.textContent = action.label;
      btn.addEventListener('click', () => {
        if (typeof action.onClick === 'function') {
          const r = action.onClick();
          if (r === false) return; // permet d'annuler la fermeture
        }
        close(action.label);
      });
      footer.appendChild(btn);
    });
    if (actions.length > 0) modalEl.appendChild(footer);

    overlay.appendChild(modalEl);
    document.body.appendChild(overlay);

    /* Wiring */
    closeBtn.addEventListener('click', () => close(null));

    if (opts.closeOnOverlay !== false) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(null);
      });
    }

    /* Esc pour fermer */
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        close(null);
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    return { close, el: modalEl };
  }

  /**
   * Remplace `confirm()` natif. Retourne une Promise<boolean>.
   * @param {string} message
   * @param {object} [opts]
   * @param {string} [opts.title='Confirmer']
   * @param {string} [opts.confirmLabel='Confirmer']
   * @param {string} [opts.cancelLabel='Annuler']
   * @param {boolean} [opts.danger=false] - Style rouge pour destructifs
   */
  function confirm(message, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const m = modal({
        title: opts.title || 'Confirmer',
        body: message,
        closeOnOverlay: false,
        actions: [
          {
            label: opts.cancelLabel || 'Annuler',
            variant: 'outline',
            onClick: () => { resolve(false); }
          },
          {
            label: opts.confirmLabel || 'Confirmer',
            variant: opts.danger ? 'danger' : 'primary',
            onClick: () => { resolve(true); }
          }
        ],
        onClose: (result) => {
          // Si fermé via × ou Esc sans cliquer un bouton, on considère "annulé"
          if (result === null) resolve(false);
        }
      });
    });
  }

  /**
   * Remplace `prompt()` natif. Retourne Promise<string|null>.
   * @param {string} message
   * @param {object} [opts]
   * @param {string} [opts.title='Saisir']
   * @param {string} [opts.placeholder='']
   * @param {string} [opts.defaultValue='']
   */
  function promptInput(message, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const body = document.createElement('div');
      const label = document.createElement('p');
      label.textContent = message;
      label.style.marginBottom = '12px';
      body.appendChild(label);

      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = opts.placeholder || '';
      input.value = opts.defaultValue || '';
      body.appendChild(input);

      let confirmed = false;
      const m = modal({
        title: opts.title || 'Saisir',
        body: body,
        closeOnOverlay: false,
        actions: [
          { label: 'Annuler', variant: 'outline', onClick: () => { confirmed = false; } },
          { label: 'Valider', variant: 'primary', onClick: () => { confirmed = true; } }
        ],
        onClose: () => {
          resolve(confirmed ? input.value : null);
        }
      });

      setTimeout(() => input.focus(), 50);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          confirmed = true;
          m.close('Valider');
        }
      });
    });
  }

  /* ─── Loading state injecté dans un conteneur ─────────────────── */

  /**
   * Affiche un état de chargement dans un container (par défaut #main-content).
   * @param {object} [opts]
   * @param {HTMLElement|string} [opts.target] - Element ou sélecteur
   * @param {'spinner'|'skeleton'} [opts.kind='spinner']
   * @param {string} [opts.message='Chargement…']
   * @param {number} [opts.skeletonRows=4]
   */
  function showLoading(opts) {
    opts = opts || {};
    const target = (typeof opts.target === 'string')
      ? document.querySelector(opts.target)
      : (opts.target || document.getElementById('main-content'));
    if (!target) return;

    const kind = opts.kind || 'spinner';
    if (kind === 'skeleton') {
      const rows = opts.skeletonRows || 4;
      let html = '';
      for (let i = 0; i < rows; i++) {
        html +=
          '<div style="padding: 12px 0; border-bottom: 1px solid var(--border-1);">' +
          '<div class="skeleton skeleton-line short"></div>' +
          '<div class="skeleton skeleton-line"></div>' +
          '</div>';
      }
      target.innerHTML = html;
    } else {
      target.innerHTML =
        '<div class="loading">' +
        '<div class="spinner"></div>' +
        '<div>' + (opts.message || 'Chargement…') + '</div>' +
        '</div>';
    }
  }

  /* ─── handleError : décode codes Supabase + messages génériques ─ */

  const SUPABASE_ERROR_MAP = {
    '23505': 'Cette valeur existe déjà (doublon).',
    '23503': 'Cette opération est bloquée par une référence à une autre table.',
    '23502': 'Un champ obligatoire est manquant.',
    '23514': 'Une valeur saisie ne respecte pas les règles autorisées.',
    '42501': 'Permission refusée pour cette opération.',
    '42P01': 'Table introuvable (erreur de configuration).',
    'PGRST116': 'Aucun résultat trouvé.',
    'PGRST301': 'Session expirée, reconnecte-toi.'
  };

  /**
   * Décode une erreur Supabase / JS et retourne un message lisible (FR).
   * @param {Error|object} error
   * @returns {string}
   */
  function describeError(error) {
    if (!error) return 'Erreur inconnue';

    // Erreur Supabase typique : { code, message, details, hint }
    if (error.code && SUPABASE_ERROR_MAP[error.code]) {
      return SUPABASE_ERROR_MAP[error.code];
    }

    if (error.code === 'PGRST' || (error.message && /JWT/i.test(error.message))) {
      return 'Problème d\'authentification, réessaie ou recharge la page.';
    }

    // Erreur réseau
    if (error.message && /(NetworkError|Failed to fetch|fetch failed)/i.test(error.message)) {
      return 'Pas de connexion au serveur. Vérifie ton réseau.';
    }

    return error.message || error.toString();
  }

  /**
   * Helper : log + toast d'erreur. À appeler dans tous les catch.
   * @param {Error|object} error
   * @param {string} [contextLabel] - libellé contextuel pour le log
   */
  function handleError(error, contextLabel) {
    console.error('[CRM]' + (contextLabel ? ' ' + contextLabel : '') + ':', error);
    toast(describeError(error), 'error', 5000);
  }

  /* ─── Theme toggle (light/dark) ────────────────────────────────── */

  const THEME_STORAGE_KEY = 'crm-theme';

  function getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  }

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch (e) {}

    // Mettre à jour le label du bouton si présent
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.textContent = theme === 'dark' ? '☀️  Mode clair' : '🌙  Mode sombre';
    }
  }

  function toggleTheme() {
    applyTheme(getCurrentTheme() === 'dark' ? 'light' : 'dark');
  }

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem(THEME_STORAGE_KEY); } catch (e) {}
    if (saved === 'dark' || saved === 'light') {
      applyTheme(saved);
    } else {
      // Détection système si pas de préférence stockée
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(prefersDark ? 'dark' : 'light');
    }
  }

  // Appliquer le thème immédiatement (avant le DOMContentLoaded) pour éviter le flash
  initTheme();

  document.addEventListener('DOMContentLoaded', () => {
    // Re-appliquer le label du bouton une fois qu'il est dans le DOM
    applyTheme(getCurrentTheme());
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.addEventListener('click', toggleTheme);
  });

  /* ─── Autocomplete (réutilisable) ──────────────────────────────────
     Crée un dropdown sous un input texte. Source : fonction async
     qui prend le query et retourne un array d'items.

     Usage minimal :
       UI.autocomplete(document.getElementById('client-name'), {
         fetchSuggestions: async (q) => { ... return [{id, label, sublabel, raw}]; },
         onSelect: (item) => { ... },
         minChars: 2,
         debounce: 250
       });

     L'objet retourné expose { destroy() } pour nettoyer si besoin.
     Items attendus : { id, label, sublabel?, raw } — `raw` étant l'objet
     source complet renvoyé au callback onSelect.
  */
  function autocomplete(input, opts) {
    if (!input || !opts || typeof opts.fetchSuggestions !== 'function') {
      console.warn('[UI.autocomplete] input ou fetchSuggestions manquant');
      return { destroy: () => {} };
    }

    const minChars = opts.minChars ?? 2;
    const debounceMs = opts.debounce ?? 250;
    const onSelect = opts.onSelect || (() => {});
    const onClear = opts.onClear || (() => {});

    /* Wrapper pour positionnement relatif du dropdown */
    let wrapper = input.parentElement;
    if (!wrapper.classList.contains('ac-wrapper')) {
      wrapper = document.createElement('div');
      wrapper.className = 'ac-wrapper';
      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);
    }

    let dropdown = null;
    let activeIndex = -1;
    let currentItems = [];
    let debounceTimer = null;
    let lastQuery = '';

    function closeDropdown() {
      if (dropdown) {
        dropdown.remove();
        dropdown = null;
      }
      activeIndex = -1;
      currentItems = [];
    }

    function openDropdown() {
      if (dropdown) return;
      dropdown = document.createElement('div');
      dropdown.className = 'ac-dropdown';
      wrapper.appendChild(dropdown);
    }

    function renderItems(items) {
      currentItems = items;
      activeIndex = -1;
      openDropdown();
      dropdown.innerHTML = '';
      if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'ac-empty';
        empty.textContent = opts.emptyMessage || 'Aucun résultat';
        dropdown.appendChild(empty);
        return;
      }
      items.forEach((item, idx) => {
        const el = document.createElement('div');
        el.className = 'ac-item';
        el.dataset.index = idx;

        const primary = document.createElement('div');
        primary.className = 'ac-item-primary';
        primary.textContent = item.label || '';
        el.appendChild(primary);

        if (item.sublabel) {
          const sub = document.createElement('div');
          sub.className = 'ac-item-secondary';
          sub.textContent = item.sublabel;
          el.appendChild(sub);
        }
        el.addEventListener('mousedown', (e) => {
          // mousedown plutôt que click pour gagner sur le blur de l'input
          e.preventDefault();
          selectItem(idx);
        });
        dropdown.appendChild(el);
      });
    }

    function renderLoading() {
      openDropdown();
      dropdown.innerHTML = '<div class="ac-loading">Recherche…</div>';
    }

    function selectItem(idx) {
      const item = currentItems[idx];
      if (!item) return;
      input.value = item.label || '';
      closeDropdown();
      onSelect(item);
    }

    function highlightActive() {
      if (!dropdown) return;
      Array.from(dropdown.querySelectorAll('.ac-item')).forEach((el, i) => {
        el.classList.toggle('is-active', i === activeIndex);
        if (i === activeIndex) {
          el.scrollIntoView({ block: 'nearest' });
        }
      });
    }

    async function runQuery(q) {
      if (q === lastQuery) return;
      lastQuery = q;
      if (q.length < minChars) {
        closeDropdown();
        return;
      }
      renderLoading();
      try {
        const items = await opts.fetchSuggestions(q);
        if (q !== lastQuery) return; // résultat d'une requête obsolète
        renderItems(items || []);
      } catch (e) {
        console.error('[UI.autocomplete] fetchSuggestions error', e);
        closeDropdown();
      }
    }

    /* Handlers */
    function onInput() {
      clearTimeout(debounceTimer);
      const q = input.value.trim();
      if (q === '') {
        closeDropdown();
        onClear();
        return;
      }
      debounceTimer = setTimeout(() => runQuery(q), debounceMs);
    }

    function onKeyDown(e) {
      if (!dropdown || currentItems.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = (activeIndex + 1) % currentItems.length;
        highlightActive();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = activeIndex <= 0 ? currentItems.length - 1 : activeIndex - 1;
        highlightActive();
      } else if (e.key === 'Enter') {
        if (activeIndex >= 0) {
          e.preventDefault();
          selectItem(activeIndex);
        }
      } else if (e.key === 'Escape') {
        closeDropdown();
      }
    }

    function onBlur() {
      // Petit délai pour permettre au mousedown des items de tirer en premier
      setTimeout(closeDropdown, 100);
    }

    function onFocus() {
      const q = input.value.trim();
      if (q.length >= minChars) {
        runQuery(q);
      }
    }

    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKeyDown);
    input.addEventListener('blur', onBlur);
    input.addEventListener('focus', onFocus);
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');

    return {
      destroy() {
        input.removeEventListener('input', onInput);
        input.removeEventListener('keydown', onKeyDown);
        input.removeEventListener('blur', onBlur);
        input.removeEventListener('focus', onFocus);
        closeDropdown();
      },
      close: closeDropdown,
      refresh: () => runQuery(input.value.trim())
    };
  }

  /* ─── Export public ────────────────────────────────────────────── */
  window.UI = {
    toast,
    modal,
    confirm,
    prompt: promptInput,
    showLoading,
    handleError,
    describeError,
    toggleTheme,
    applyTheme,
    autocomplete
  };

})();
