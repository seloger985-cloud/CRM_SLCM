-- ═══════════════════════════════════════════════════════════════════
-- 12 — CONFRÈRES ET CODE COURT : savoir à qui appartient un bien publié
--
-- À jouer dans le SQL Editor de dukwtseqticijlvrmkgz. Rejouable.
--
-- POURQUOI :
-- Une campagne de dizaines de terrains, surtout des biens de confrères.
-- Un prospect appelle : « c'est pour le terrain n°4 de Logpom ». Le « 4 »
-- du visuel n'était relié à RIEN, et le confrère qui détient le bien ne
-- vivait que dans la description, en prose (« Contact : … ») — ou dans la
-- mémoire de l'agent.
--
-- CHOIX : le lien bien → confrère vit dans le CRM, là où le bien arrive
-- (souvent par un message du confrère) et où naît le visuel. Une seule
-- source : `ops.html` côté site faisait la même chose à part, il ne doit
-- pas devenir une seconde vérité.
--
-- CHOIX : un CODE COURT par bien (T-014), lisible au téléphone, imprimé sur
-- le visuel. Il ne dit RIEN du confrère : c'est une clé que seul le CRM
-- ouvre. Un visuel qui nommerait le confrère inviterait le prospect à
-- contourner l'agence.
--
-- CHOIX : le code est figé à la création et ne suit pas les changements de
-- type. Un identifiant qui change casse précisément ce qu'il sert à
-- retrouver : un visuel déjà publié.
-- ═══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────
-- 1 · LE RÉPERTOIRE DES CONFRÈRES
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.confreres (
  id         serial primary key,
  name       text not null,
  agency     text,                       -- l'agence ou l'enseigne, s'il en a une
  phone      text,
  whatsapp   text,                       -- si différent du téléphone
  zones      text,                       -- « Logpom, Kotto, PK14 » : là où il a du stock
  notes      text,                       -- conditions habituelles, fiabilité…
  active     boolean not null default true,
  owner_id   uuid default auth.uid(),
  created_at timestamptz not null default now()
);


-- ─────────────────────────────────────────────────────────────────
-- 2 · L'ORIGINE DU BIEN
-- ─────────────────────────────────────────────────────────────────

-- Le confrère qui détient le bien. NULL = bien en direct (mandat de
-- l'agence). « set null » : retirer un confrère ne doit pas emporter ses biens.
alter table public.properties add column if not exists confrere_id integer
  references public.confreres(id) on delete set null;

-- SA référence à lui, pour lui parler de son bien dans ses mots.
alter table public.properties add column if not exists confrere_ref text;

-- Le partage convenu, en clair : « 50/50 », « 5 % acheteur »… Du texte et non
-- un nombre : les arrangements entre confrères ne se réduisent pas à un taux.
alter table public.properties add column if not exists commission text;

-- Le code court public.
alter table public.properties add column if not exists code text;

-- Surface et prix au m² : un terrain se décrit ainsi à Douala (« 591 m² à
-- 140 mille le m² »). Sans ces colonnes, ils finissaient en prose et ni le
-- visuel ni l'annonce du site ne pouvaient être produits depuis la fiche.
-- `price` reste le prix total ; price_m2 est celui qu'on annonce.
alter table public.properties add column if not exists surface_m2 integer;
alter table public.properties add column if not exists price_m2 integer;


-- ─────────────────────────────────────────────────────────────────
-- 3 · LE CODE COURT
--
-- Une lettre pour la famille de bien, puis un numéro unique pour tout le
-- portefeuille : T-014, A-015, M-016. Un seul compteur — deux biens ne
-- peuvent jamais partager un numéro, quelle que soit leur lettre, donc
-- « le 14 » suffit même si l'appelant a oublié la lettre.
-- ─────────────────────────────────────────────────────────────────
create sequence if not exists public.property_code_seq;

create or replace function public.property_code_prefix(t text)
returns text
language sql
immutable
as $$
  select case
    when t = 'plots-of-land'                                     then 'T'
    when t in ('apartment', 'studio')                            then 'A'
    when t in ('house', 'villa', 'duplex')                       then 'M'
    when t = 'building'                                          then 'I'
    when t in ('warehouse', 'office', 'shop', 'commercial')      then 'C'
    else 'B'
  end;
$$;

create or replace function public.property_set_code()
returns trigger
language plpgsql
as $$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := public.property_code_prefix(new.type) || '-'
             || lpad(nextval('public.property_code_seq')::text, 3, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists properties_set_code on public.properties;
create trigger properties_set_code
  before insert on public.properties
  for each row execute function public.property_set_code();

-- Reprise : les biens existants reçoivent un code, du plus ancien au plus
-- récent. Rejouable : seuls les biens encore sans code sont touchés.
do $$
declare r record;
begin
  for r in select id, type from public.properties
           where code is null order by created_at, id
  loop
    update public.properties
       set code = public.property_code_prefix(r.type) || '-'
               || lpad(nextval('public.property_code_seq')::text, 3, '0')
     where id = r.id;
  end loop;
end $$;

create unique index if not exists uniq_properties_code on public.properties (code);
create index if not exists idx_properties_confrere on public.properties (confrere_id);


-- ─────────────────────────────────────────────────────────────────
-- 4 · RLS — calqué sur les autres tables (voir sql/09, même raisonnement)
-- ─────────────────────────────────────────────────────────────────
alter table public.confreres enable row level security;

do $$
declare a text;
begin
  foreach a in array array['select', 'insert', 'update', 'delete'] loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'confreres' and policyname = 'confreres_auth_' || a
    ) then
      execute format(
        'create policy %I on public.confreres as permissive for %s to authenticated %s',
        'confreres_auth_' || a, a,
        case a
          when 'insert' then 'with check (true)'
          when 'update' then 'using (true) with check (true)'
          else 'using (true)'
        end
      );
    end if;
  end loop;
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- VÉRIFICATION — doit renvoyer : 1, 6, 1, 1.
-- Par le catalogue seulement : une requête qui lirait une colonne ajoutée
-- ici peut faire échouer, donc annuler, tout le fichier (tests/check-migrations.js).
-- Pour voir les codes attribués, une fois ce fichier joué :
--   select id, title, type from public.properties order by id desc limit 5;
-- puis la colonne de code dans l'éditeur de tables.
-- ═══════════════════════════════════════════════════════════════════
select
  (select count(*) from information_schema.tables
     where table_schema = 'public' and table_name = 'confreres')                   as table_confreres,
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'properties'
       and column_name in ('code', 'confrere_id', 'confrere_ref', 'commission',
                           'surface_m2', 'price_m2'))                             as colonnes_ajoutees,
  (select count(*) from pg_indexes
     where schemaname = 'public' and indexname = 'uniq_properties_code')            as index_code_unique,
  (select count(*) from pg_trigger where tgname = 'properties_set_code')            as declencheur_code;
