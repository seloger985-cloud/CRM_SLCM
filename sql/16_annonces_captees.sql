-- ═══════════════════════════════════════════════════════════════════
-- 16 — ANNONCES CAPTÉES DANS LES GROUPES WHATSAPP (02/11/2026)
-- À jouer dans le SQL Editor du CRM (projet dukwtseqticijlvrmkgz). Rejouable.
-- ═══════════════════════════════════════════════════════════════════
--
-- POURQUOI :
-- Les confrères partagent chaque jour des biens dans les groupes de travail.
-- Seuls ceux que l'agent choisit deviennent une fiche (bouton « Depuis un
-- message »). Le reste disparaît dans le flot. Le site garde la mémoire des
-- biens publiés ; il manquait celle de tout ce qui a circulé.
--
-- CHOIX : une table À PART, pas des lignes de `properties`. Des centaines
-- d'annonces de confrères noieraient le portefeuille et fausseraient le
-- tableau de bord. Une annonce captée devient une fiche sur décision de
-- l'agent (`property_id` la relie alors à sa fiche).
--
-- CHOIX : capture par EXPORT de discussion (WhatsApp → Exporter la
-- discussion → Sans médias), importé dans le CRM. WhatsApp n'offre aucun
-- accès officiel aux groupes ; les robots qui les lisent sont interdits et
-- font bannir le numéro.
--
-- CHOIX : le confrère n'est PAS figé sur l'annonce. L'export nomme l'auteur
-- comme le téléphone de l'agent le connaît : par son nom s'il est enregistré,
-- sinon par son numéro. Le lien auteur → confrère se résout à l'affichage
-- (numéro, ou `confreres.wa_alias`). Relier un auteur une fois relie toutes
-- ses annonces, passées comme futures.
-- ═══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────
-- 1 · LE NOM D'UN CONFRÈRE DANS LES EXPORTS
--
-- « Paul Logpom » dans le répertoire du téléphone, « Paul Ekwalla » dans le
-- CRM. Sans cet alias, ses annonces resteraient orphelines.
-- ─────────────────────────────────────────────────────────────────
alter table public.confreres add column if not exists wa_alias text;


-- ─────────────────────────────────────────────────────────────────
-- 2 · LES ANNONCES
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.annonces_captees (
  id           serial primary key,

  -- Le message tel quel : c'est la mémoire. L'extraction peut se tromper,
  -- le texte d'origine fait foi.
  message      text not null,
  -- Empreinte du texte normalisé, calculée par le CRM (capture.js). Le même
  -- bien reposté, ou partagé dans deux groupes, n'est gardé qu'une fois.
  empreinte    text not null,
  posted_at    timestamptz,               -- date du message dans l'export
  groupe       text,                      -- le groupe d'où vient l'export
  auteur       text,                      -- tel qu'écrit dans l'export : nom ou numéro

  -- a_analyser → analysee | pas_un_bien | erreur ; puis promue | ecartee.
  statut       text not null default 'a_analyser',

  -- Ce que l'analyse a lu dans le message. Mêmes formes que `properties`.
  title        text,
  type         text,
  rent_sale    text,
  price        bigint,
  price_m2     integer,
  surface_m2   integer,
  district     text,
  address      text,
  bedrooms     integer,
  furnished    boolean,
  contact      text,                      -- numéro cité DANS le message, s'il y en a
  manquant     text[],
  erreur       text,                      -- motif, si l'analyse a échoué

  -- La fiche créée depuis cette annonce. « set null » : la fiche reste maître.
  property_id  integer references public.properties(id) on delete set null,

  owner_id     uuid default auth.uid(),
  created_at   timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'annonces_captees_statut_check') then
    alter table public.annonces_captees add constraint annonces_captees_statut_check
      check (statut in ('a_analyser', 'analysee', 'pas_un_bien', 'erreur', 'promue', 'ecartee'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'annonces_captees_rent_sale_check') then
    alter table public.annonces_captees add constraint annonces_captees_rent_sale_check
      check (rent_sale is null or rent_sale in ('rent', 'sale'));
  end if;
end $$;

-- Le dédoublonnage repose sur la BASE, pas sur le navigateur : réimporter
-- le même export (ou l'export suivant, qui contient l'ancien) ne crée rien.
-- Sur l'empreinte seule, sans owner_id : le CRM n'a qu'un utilisateur, et
-- l'import s'appuie sur `on conflict (empreinte)`.
create unique index if not exists uniq_annonces_captees_empreinte
  on public.annonces_captees (empreinte);

create index if not exists idx_annonces_captees_posted
  on public.annonces_captees (posted_at desc);
create index if not exists idx_annonces_captees_statut
  on public.annonces_captees (statut);


-- ─────────────────────────────────────────────────────────────────
-- 3 · ACCÈS — même schéma que les autres tables (voir 02_rls.sql)
-- ─────────────────────────────────────────────────────────────────
alter table public.annonces_captees enable row level security;

do $$
declare a text;
begin
  foreach a in array array['select', 'insert', 'update', 'delete'] loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'annonces_captees' and policyname = 'annonces_captees_auth_' || a
    ) then
      execute format(
        'create policy %I on public.annonces_captees as permissive for %s to authenticated %s',
        'annonces_captees_auth_' || a, a,
        case a
          when 'insert' then 'with check (true)'
          when 'update' then 'using (true) with check (true)'
          else 'using (true)'
        end
      );
    end if;
  end loop;
end $$;


-- Contrôle : « 1, 23, 1, 4 » — la colonne wa_alias, les 23 colonnes de la
-- table, l'index d'unicité, les 4 politiques.
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'confreres' and column_name = 'wa_alias') as alias,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'annonces_captees') as colonnes,
  (select count(*) from pg_indexes
    where schemaname = 'public' and indexname = 'uniq_annonces_captees_empreinte') as unicite,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'annonces_captees') as politiques;
