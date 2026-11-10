-- ═══════════════════════════════════════════════════════════════════
-- 18 — RAPPELS TELEGRAM, MATIN ET SOIR (10/11/2026)
-- À jouer dans le SQL Editor du CRM (projet dukwtseqticijlvrmkgz). Rejouable.
--
-- AVANT ce fichier : la fonction Edge `daily-digest` est déployée et ses
-- secrets sont posés (voir supabase/functions/README.md, « Rappels
-- Telegram »), et le secret du cron est rangé dans le coffre (étape 0
-- ci-dessous). Sinon les tâches planifiées tournent dans le vide — sans
-- dégât, mais sans message.
-- ═══════════════════════════════════════════════════════════════════
--
-- POURQUOI :
-- Le 09/11/2026, un client vu en visite n'a jamais été relancé. Tout ce que
-- le CRM sait de « ce qui attend » ne se voit qu'en ouvrant le CRM — et le
-- jour où on ne l'ouvre pas, rien ne se passe. Le rappel doit VENIR à
-- l'agent : un message Telegram le matin (ce qui attend), un le soir (qui
-- as-tu vu aujourd'hui ?).
--
-- CHOIX : Telegram plutôt qu'une notification de navigateur. Le CRM n'a
-- ni manifeste ni service worker, et ces notifications sont capricieuses
-- sur iPhone. Un bot Telegram est un simple appel HTTP.
--
-- CHOIX : pg_cron déclenche, la fonction Edge calcule et envoie. La base
-- ne connaît pas le jeton du bot ; la fonction ne connaît pas l'horaire.
--
-- CONFIDENTIALITÉ : un bot Telegram n'est PAS chiffré de bout en bout. Les
-- messages ne portent que des noms courts et des intitulés d'actions —
-- jamais de numéro de téléphone, de montant, ni de pièce d'identité.
-- ═══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────
-- 0 · LE SECRET DU CRON — À FAIRE UNE FOIS, À LA MAIN, AVANT LE RESTE
--
-- La fonction refuse tout appel qui ne porte pas ce secret : son adresse
-- est publique, sans lui n'importe qui pourrait déclencher des messages.
-- Choisir une longue chaîne au hasard (la même que le secret CRON_SECRET
-- de la fonction), la coller À LA PLACE de COLLER_ICI, et exécuter CETTE
-- SEULE LIGNE, une seule fois :
--
--   select vault.create_secret('COLLER_ICI', 'daily_digest_cron_secret');
--
-- Elle est volontairement en commentaire : la valeur ne doit pas vivre
-- dans le dépôt. Pour la changer plus tard :
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'daily_digest_cron_secret'),
--     'NOUVELLE_VALEUR');
-- ─────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────────
-- 1 · LES RÉGLAGES : qui reçoit, où
--
-- Une ligne par agent. `telegram_chat_id` est l'identifiant de la
-- conversation entre l'agent et le bot (voir README : on le lit avec
-- getUpdates après avoir écrit /start au bot — un bot ne peut pas écrire
-- le premier). `actif` permet de couper sans rien effacer.
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.notif_prefs (
  owner_id          uuid primary key default auth.uid(),
  telegram_chat_id  text not null,
  actif             boolean not null default true,
  created_at        timestamptz not null default now()
);


-- ─────────────────────────────────────────────────────────────────
-- 2 · LE JOURNAL DES ENVOIS
--
-- L'unicité (agent, sorte, jour) empêche un DOUBLE envoi si le cron se
-- déclenche deux fois, ou si on rejoue la fonction à la main : la
-- fonction réserve la ligne AVANT d'envoyer, et s'arrête si elle existe.
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.notif_log (
  id         bigserial primary key,
  owner_id   uuid not null,
  kind       text not null,
  for_date   date not null,
  sent_at    timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'notif_log_kind_check') then
    alter table public.notif_log add constraint notif_log_kind_check
      check (kind in ('matin', 'soir', 'semaine'));
  end if;
end $$;

create unique index if not exists uniq_notif_log_envoi
  on public.notif_log (owner_id, kind, for_date);


-- ─────────────────────────────────────────────────────────────────
-- 3 · ACCÈS
--
-- Contrairement aux tables métier (voir 02_rls.sql, section 2), ces deux
-- tables sont cloisonnées POUR DE BON, comme shared_listings : une seule
-- politique, réservée au propriétaire. Le chat Telegram d'un agent est
-- personnel ; le jour où six agents arriveront, chacun ne doit voir que
-- le sien. Le journal ne s'écrit pas depuis le CRM : seule la fonction,
-- avec la clé service, y écrit — et la clé service ignore le RLS, d'où
-- le filtre explicite par owner_id dans la fonction.
-- ─────────────────────────────────────────────────────────────────
alter table public.notif_prefs enable row level security;
alter table public.notif_log   enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'notif_prefs' and policyname = 'notif_prefs_owner_all') then
    create policy notif_prefs_owner_all on public.notif_prefs as permissive for all to authenticated
      using (owner_id = auth.uid()) with check (owner_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'notif_log' and policyname = 'notif_log_owner_select') then
    create policy notif_log_owner_select on public.notif_log as permissive for select to authenticated
      using (owner_id = auth.uid());
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────
-- 4 · LES HORAIRES
--
-- pg_cron compte en UTC. Douala est à UTC+1 toute l'année (pas d'heure
-- d'été), donc on retire une heure :
--
--   matin  lundi → samedi  07h30 à Douala  →  '30 6 * * 1-6'
--   soir   lundi → vendredi 18h00 à Douala  →  '0 17 * * 1-5'
--   rien le dimanche.
--   (Le bilan du samedi soir arrive avec sql/19, au lot 6.)
--
-- Pour changer un horaire : modifier la chaîne ici et rejouer le fichier.
-- cron.schedule remplace la tâche du même nom, il n'en crée pas une
-- seconde.
--
-- Les deux extensions s'activent ici. Si l'éditeur refuse (droits), les
-- activer depuis le tableau de bord : Database → Extensions → pg_cron et
-- pg_net, puis rejouer le fichier.
-- ─────────────────────────────────────────────────────────────────
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule('daily-digest-matin', '30 6 * * 1-6', $cron$
  select net.http_post(
    url     := 'https://dukwtseqticijlvrmkgz.supabase.co/functions/v1/daily-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                        where name = 'daily_digest_cron_secret')),
    body    := jsonb_build_object('kind', 'matin'),
    timeout_milliseconds := 30000
  );
$cron$);

select cron.schedule('daily-digest-soir', '0 17 * * 1-5', $cron$
  select net.http_post(
    url     := 'https://dukwtseqticijlvrmkgz.supabase.co/functions/v1/daily-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                        where name = 'daily_digest_cron_secret')),
    body    := jsonb_build_object('kind', 'soir'),
    timeout_milliseconds := 30000
  );
$cron$);


-- ─────────────────────────────────────────────────────────────────
-- 5 · S'INSCRIRE — à faire une fois, à la main, après avoir trouvé son
--     chat_id (README). Remplacer l'e-mail et le numéro, puis exécuter :
--
--   insert into public.notif_prefs (owner_id, telegram_chat_id)
--   select id, '123456789' from auth.users where email = 'VOTRE_EMAIL'
--   on conflict (owner_id) do update set telegram_chat_id = excluded.telegram_chat_id, actif = true;
--
-- Pour couper les rappels sans rien effacer :
--   update public.notif_prefs set actif = false;
-- ─────────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────────
-- CONTRÔLE — attendu : « 2, 2, 1, 2, 1 »
--   les 2 tables, leurs 2 politiques, l'index d'unicité, les 2 tâches
--   planifiées, le secret du coffre (0 tant que l'étape 0 n'est pas
--   faite). Ne lit que le catalogue et les métadonnées des extensions.
-- ─────────────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name in ('notif_prefs', 'notif_log')) as tables,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename in ('notif_prefs', 'notif_log')) as politiques,
  (select count(*) from pg_indexes
    where schemaname = 'public' and indexname = 'uniq_notif_log_envoi') as unicite,
  (select count(*) from cron.job where jobname in ('daily-digest-matin', 'daily-digest-soir')) as taches,
  (select count(*) from vault.secrets where name = 'daily_digest_cron_secret') as secret;


-- ─────────────────────────────────────────────────────────────────
-- DIAGNOSTIC (lecture seule, ne modifie rien) — attendu : « 0, 0, 0 »
--
-- La fonction filtre par owner_id. Une ligne SANS propriétaire (saisie
-- avant que la colonne existe, ou par un import) serait invisible pour le
-- rappel. Si un chiffre ne vaut pas 0, le dire avant d'aller plus loin :
-- on rattachera ces lignes à l'agent par une mise à jour ciblée.
-- ─────────────────────────────────────────────────────────────────
select
  (select count(*) from public.activities where owner_id is null) as activites_sans_proprietaire,
  (select count(*) from public.clients    where owner_id is null) as clients_sans_proprietaire,
  (select count(*) from public.tasks      where owner_id is null) as taches_sans_proprietaire;
