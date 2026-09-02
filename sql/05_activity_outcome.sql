-- ════════════════════════════════════════════════════════════════════
--  05_activity_outcome.sql — Une activité a une issue, et une suite.
--
--  À JOUER dans le SQL Editor du projet dukwtseqticijlvrmkgz,
--  AVANT d'utiliser les nouveaux champs. Ce fichier MODIFIE la base.
--
--  ── Le problème ──
--
--  Une activité portait `type`, `notes`, `date`. Rien d'autre. Or l'agent
--  écrit systématiquement deux choses de plus dans les notes :
--
--    « Visite — Meublés 04 chs Bonanjo. ECHEC : pas disponible »
--    « Visite — Bonapriso, Hôtel de l'air (EN ATTENTE retour clt sur négo) »
--
--  Comment ça s'est terminé, et ce qu'il reste à faire. Deux informations
--  capitales, rédigées en prose, donc illisibles par la machine.
--
--  Conséquence : le CRM ne peut pas savoir qu'une visite a échoué ni qu'un
--  client attend une réponse. Les trois règles de l'écran Automatisation —
--  rappel de visite, paiement en retard, client sans activité — tournent
--  déjà, mais sont aveugles à l'essentiel.
--
--  ── Le correctif ──
--
--  Quatre colonnes. Pas une de plus, et chacune gagne sa place :
--
--    outcome       comment ça s'est terminé — pour que le journal se lise
--    next_step     ce qu'il reste à faire, en clair
--    next_date     quand
--    next_done_at  null tant que ce n'est pas fait
--
--  Aucune tâche n'est créée automatiquement : la suite vit sur l'activité
--  où elle a été écrite. Dupliquer l'information dans `tasks` obligerait à
--  synchroniser deux endroits, et l'un des deux finirait par mentir.
--
--  ── Aucune donnée touchée ──
--
--  On ajoute des colonnes nullables. Les activités existantes restent
--  valides, avec une issue vide — ce qui est exact : on ne la connaît pas.
--  Rejouable sans dommage.
-- ════════════════════════════════════════════════════════════════════

alter table public.activities
  add column if not exists outcome      text,
  add column if not exists next_step    text,
  add column if not exists next_date    date,
  add column if not exists next_done_at timestamptz;

alter table public.activities drop constraint if exists activities_outcome_check;

alter table public.activities add constraint activities_outcome_check
  check (outcome is null or outcome in (
    'done',     -- s'est bien passé, rien à ajouter
    'pending',  -- en attente d'un retour
    'failed',   -- n'a pas abouti
    'no_show'   -- le rendez-vous n'a pas eu lieu
  ));

/* Le tableau de bord ne balaie que les suites encore ouvertes. Index
   partiel : il ne porte que sur les lignes concernées, pas sur tout
   l'historique. */
create index if not exists idx_activities_next
  on public.activities using btree (next_date)
  where (next_step is not null and next_done_at is null);


-- ────────────────────────────────────────────────────────────────────
--  Vérification
-- ────────────────────────────────────────────────────────────────────

select
  count(*)                                          as activites,
  count(*) filter (where outcome is not null)       as avec_issue,
  count(*) filter (where next_step is not null)     as avec_suite,
  count(*) filter (where next_step is not null
                     and next_done_at is null)      as suites_ouvertes
from public.activities;

/* Au premier passage : avec_issue et avec_suite valent 0. C'est normal —
   l'information existe, mais en prose dans `notes`. Elle se reprendra au
   fil des consultations, pas par script : personne ne peut deviner de
   façon fiable si « pas disponible » veut dire échec ou report. */
