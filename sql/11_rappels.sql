-- ═══════════════════════════════════════════════════════════════════
-- 11 — TRACE DES RELANCES
--
-- À jouer dans le SQL Editor de dukwtseqticijlvrmkgz. Rejouable.
-- Dépend de sql/09 (colonnes de loyer sur `payments`), déjà joué.
--
-- POURQUOI :
-- La règle voulue est « relancer tous les 7 jours ». Sans savoir QUAND la
-- dernière relance est partie, on ne peut que compter les jours depuis
-- l'échéance — ce qui redemande une relance chaque fois qu'on ouvre l'écran,
-- ou n'en redemande jamais. Une seule colonne rend la cadence réelle.
--
-- Elle n'est pas sur `leases` mais sur `payments` : on relance un LOYER
-- précis, pas un bail. Deux mois impayés méritent deux relances distinctes.
-- ═══════════════════════════════════════════════════════════════════

alter table public.payments add column if not exists last_reminder_at date;

-- Retrouver les loyers à relancer sans parcourir toute la table. Partiel :
-- seules les lignes non soldées peuvent appeler une relance.
create index if not exists idx_payments_relance
  on public.payments (last_reminder_at)
  where status <> 'paid';


-- ═══════════════ VÉRIFICATION ═══════════════
-- N'interroge que le catalogue, jamais la colonne qu'elle vérifie : une
-- requête de vérification qui dépend de son propre objet échoue quand l'objet
-- manque, et l'éditeur SQL de Supabase jouant le fichier dans UNE transaction,
-- cette erreur finale annulerait tout ce qui a réussi avant.
select
  (select count(*) from information_schema.columns
     where table_name = 'payments' and column_name = 'last_reminder_at') as colonne,
  (select count(*) from pg_indexes
     where indexname = 'idx_payments_relance') as index_relance;
