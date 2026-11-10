-- ════════════════════════════════════════════════════════════════════
--  17_activity_whatsapp.sql — Une conversation WhatsApp est une activité.
--
--  À JOUER dans le SQL Editor du projet dukwtseqticijlvrmkgz,
--  AVANT de déployer la version du CRM qui propose le type « WhatsApp ».
--  Sans ce fichier, toute activité WhatsApp est refusée par la base —
--  la saisie comme le journal automatique des clics. Rejouable.
--
--  ── Pourquoi ──
--
--  Une bonne part des prospects arrive par WhatsApp : un message sur une
--  annonce du site, quelques échanges, et souvent « je vous reviens ».
--  activities_type_check n'acceptait que call, meeting, email et visit :
--  ces conversations ne pouvaient donc pas être notées comme telles, et
--  leur suite — relancer celui qui devait revenir — n'existait nulle part.
--
--  Le CRM journalise aussi, depuis le 10/11/2026, les contacts WhatsApp
--  et les appels lancés depuis une fiche client (« contact initié depuis
--  le CRM »). Même type, même contrainte.
--
--  ── Aucune donnée touchée ──
--
--  On élargit la contrainte, on n'en restreint aucune : les activités
--  existantes restent valides.
-- ════════════════════════════════════════════════════════════════════

alter table public.activities drop constraint if exists activities_type_check;

alter table public.activities add constraint activities_type_check
  check (type in (
    'call',      -- appel
    'meeting',   -- rendez-vous
    'email',     -- e-mail
    'visit',     -- visite
    'whatsapp'   -- conversation WhatsApp
  ));


-- ────────────────────────────────────────────────────────────────────
--  Vérification : une ligne, qui doit citer les cinq types, whatsapp
--  compris. Si la requête ne renvoie rien, la contrainte a été supprimée
--  sans être recréée : rejouer ce fichier.
-- ────────────────────────────────────────────────────────────────────

select pg_get_constraintdef(oid) as contrainte
from pg_constraint
where conrelid = 'public.activities'::regclass
  and conname = 'activities_type_check';
