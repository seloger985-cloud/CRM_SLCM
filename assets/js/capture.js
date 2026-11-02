/* ═══════════════════════════════════════════════════════════════════
   CAPTURE — lire un export de discussion WhatsApp (sql/16)

   L'agent exporte un groupe de travail (WhatsApp → Plus → Exporter la
   discussion → Sans médias) et dépose le fichier dans le CRM. Ce fichier
   ne fait que le LIRE : découper en messages, écarter ce qui n'est pas une
   offre, calculer une empreinte par annonce. Aucun réseau, aucun modèle :
   tout ici est une règle, donc testable et prévisible. L'analyse du contenu
   (type, prix, quartier) se fait ensuite, sur les seules annonces retenues,
   par la fonction capture-annonces.

   Chargé avant app.js. Expose window.SLCM_CAPTURE, et module.exports pour
   les tests sous Node.
   ═══════════════════════════════════════════════════════════════════ */
(function (racine) {
  'use strict';

  /* Les marques invisibles que WhatsApp sème dans ses exports (sens
     d'écriture, espace insécable étroit). Elles cassent les expressions
     régulières sans jamais se voir. */
  function nettoyer(t) {
    return String(t || '')
      .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
      .replace(/[\u00a0\u202f]/g, ' ')
      .replace(/\r\n?/g, '\n');
  }

  /* Le début d'un message. Les deux formes rencontrées :
       Android  « 02/11/2026 11:40 - Paul: texte »   (« 02/11/2026 à 11:40 » selon les versions)
       iPhone   « [02/11/2026 11:40:12] Paul: texte »
     Année sur 2 ou 4 chiffres, heure en 24 h ou avec AM/PM. */
  const DEBUT = /^\[?(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4}),?(?:\s+à)?\s+(\d{1,2})[:h.](\d{2})(?:[:.](\d{2}))?(?:\s*([AaPp])\.?\s?[Mm]\.?)?\]?\s*(?:-\s+)?(.*)$/;

  /* Ce qui reste d'une pièce jointe dans un export « sans médias ». */
  const MEDIAS = /<\s*(médias? omis|media omitted|ce message a été modifié|this message was edited)\s*>|\b(image|vidéo|video|audio|gif|sticker|document) (absente?|omitted)\b|\(fichier joint\)/gi;
  const SUPPRIME = /^(ce message a été supprimé|vous avez supprimé ce message|this message was deleted|you deleted this message)\.?$/i;

  /* Une date d'export, lue à la française (jour d'abord). Un mois > 12 trahit
     un export réglé à l'américaine : on inverse. Le Cameroun est à UTC+1
     toute l'année, sans heure d'été : le décalage est fixe. */
  function dateIso(j, m, a, h, mi, s, ampm) {
    let jour = Number(j), mois = Number(m), an = Number(a), heure = Number(h);
    if (mois > 12 && jour <= 12) { const x = jour; jour = mois; mois = x; }
    if (an < 100) an += 2000;
    if (ampm) {
      const pm = /p/i.test(ampm);
      if (pm && heure < 12) heure += 12;
      if (!pm && heure === 12) heure = 0;
    }
    if (!(mois >= 1 && mois <= 12 && jour >= 1 && jour <= 31 && heure < 24)) return null;
    const deux = n => String(n).padStart(2, '0');
    return `${an}-${deux(mois)}-${deux(jour)}T${deux(heure)}:${deux(mi)}:${deux(s || 0)}+01:00`;
  }

  /** Le fichier en messages : [{ posted_at, auteur, texte }].
      Les messages système (« X a ajouté Y », changement de nom du groupe)
      n'ont pas d'auteur : ils sont comptés à part, pas renvoyés. */
  function decouper(texteBrut) {
    const lignes = nettoyer(texteBrut).split('\n');
    const messages = [];
    let courant = null;
    let systeme = 0;

    const clore = () => {
      if (!courant) return;
      const t = courant.lignes.join('\n').replace(MEDIAS, '').trim();
      if (t && !SUPPRIME.test(t)) messages.push({ posted_at: courant.posted_at, auteur: courant.auteur, texte: t });
      courant = null;
    };

    for (const ligne of lignes) {
      const m = ligne.match(DEBUT);
      if (!m) {
        /* Une ligne sans horodatage prolonge le message en cours : une
           annonce s'écrit volontiers sur plusieurs lignes. */
        if (courant) courant.lignes.push(ligne);
        continue;
      }
      clore();
      const reste = m[8];
      const sep = reste.indexOf(': ');
      if (sep <= 0) { systeme++; continue; }
      courant = {
        posted_at: dateIso(m[1], m[2], m[3], m[4], m[5], m[6], m[7]),
        auteur: reste.slice(0, sep).trim(),
        lignes: [reste.slice(sep + 2)]
      };
    }
    clore();
    return { messages, systeme };
  }

  /* ─────────────── Tri : une offre, ou du bavardage ? ───────────────

     Règle volontairement simple, réglée sur les messages des groupes de
     Douala. Elle doit surtout ne pas laisser passer « Bonjour à tous »,
     « Dispo ? », « Envoyé en privé » — chacun coûterait un appel d'analyse.
     Une offre douteuse qui passe sera écartée par l'analyse (« pas un
     bien ») ; une offre réelle écartée ici serait perdue. Dans le doute,
     on garde. */
  const BIEN = /\b(terrains?|parcelles?|lots?|apparts?|appartements?|studios?|chambres?|villas?|duplex|triplex|maisons?|immeubles?|magasins?|boutiques?|bureaux?|entrep[oô]ts?|locaux|local|hangars?|r[ée]sidences?|meubl[ée]e?s?|hectares?|ha|m2|m²|cases?)\b/i;
  const TRANSACTION = /\b(à|a)\s+(vendre|louer)\b|\bvend[sre]?\b|\bloue\b|\blocation\b|\bvente\b|\bdispo(nible)?s?\b|\bbail\b|\btitr[ée]e?\b|\bprix\b|\bloyer\b/i;
  const PRIX = /\d[\d\s.,]*\s*(k|m|mil+e?s?|millions?|mio|fcfa|cfa|frs?|f)\b|\b\d{2,3}[\s.]\d{3}\b/i;
  const SURFACE = /\d\s*(m2|m²|mètres?\s+carrés?|ha\b|hectares?)/i;
  /* Une DEMANDE (« je cherche un 2 chambres à Bonapriso ») ressemble à une
     offre — mêmes mots, souvent un budget. Elle n'en est pas une. */
  const DEMANDE = /\b(je|on|nous|mon client|ma cliente|client|cliente)\s+(cherche|recherche|veut|voudrait)\b|\brecherche\s+(un|une|des)\b|\bbesoin\s+d['’e]|\bqui\s+(a|aurait|dispose)\b/i;

  function ressembleAnnonce(texte) {
    const t = String(texte || '');
    if (t.replace(/\s+/g, ' ').trim().length < 30) return false;
    if (DEMANDE.test(t.slice(0, 120))) return false;
    if (!BIEN.test(t)) return false;
    return TRANSACTION.test(t) || PRIX.test(t) || SURFACE.test(t);
  }

  /* ─────────────── Empreinte ───────────────

     Le même texte, reposté ou partagé dans un autre groupe, doit donner la
     même empreinte, même si les espaces, la casse, les accents ou les émojis
     diffèrent. Deux hachages FNV-1a 32 bits de graines différentes, plus la
     longueur : une collision fortuite entre deux annonces réelles est
     négligeable à l'échelle de quelques milliers de messages. */
  function normaliser(texte) {
    return String(texte || '').toLowerCase()
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function fnv(s, graine) {
    let h = graine >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  function empreinte(texte) {
    const n = normaliser(texte);
    return fnv(n, 2166136261) + fnv(n, 0x9747b28c) + '-' + n.length.toString(36);
  }

  /** Le nom du groupe d'après le nom du fichier exporté. */
  function groupeDepuisFichier(nom) {
    const base = String(nom || '').replace(/\.(txt|zip)$/i, '');
    const m = base.match(/(?:discussion whatsapp avec|whatsapp chat with|chat whatsapp con|conversa do whatsapp com)\s+(.+)$/i);
    const g = (m ? m[1] : base).replace(/^_?chat$/i, '').trim();
    return g || null;
  }

  /** Tout l'export, prêt à enregistrer.
      Renvoie les compteurs pour l'écran, et les annonces retenues — une seule
      par empreinte, la plus ancienne : c'est elle qui date l'offre. */
  function preparer(texteBrut, groupe) {
    const { messages, systeme } = decouper(texteBrut);
    const vues = new Map();
    let ignores = 0;
    for (const m of messages) {
      if (!ressembleAnnonce(m.texte)) { ignores++; continue; }
      const e = empreinte(m.texte);
      if (vues.has(e)) continue;
      vues.set(e, { message: m.texte, empreinte: e, posted_at: m.posted_at, auteur: m.auteur, groupe: groupe || null });
    }
    return { total: messages.length, systeme, ignores, annonces: [...vues.values()] };
  }

  const api = { nettoyer, decouper, ressembleAnnonce, normaliser, empreinte, groupeDepuisFichier, preparer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (racine) racine.SLCM_CAPTURE = api;
})(typeof window !== 'undefined' ? window : null);
