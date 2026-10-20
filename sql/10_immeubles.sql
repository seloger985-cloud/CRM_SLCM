-- ═══════════════════════════════════════════════════════════════════
-- 10 — IMMEUBLES ET LOGEMENTS : un portefeuille qui a une structure
--
-- À jouer dans le SQL Editor de dukwtseqticijlvrmkgz. Rejouable.
--
-- POURQUOI :
-- `properties` était PLAT. Un immeuble de Makepe et l'un de ses appartements
-- y étaient deux lignes sans aucun lien. Impossible de dire « les logements
-- de cet immeuble », impossible de savoir combien sont loués, impossible de
-- présenter un portefeuille par propriétaire.
--
-- Et le propriétaire bailleur n'existait QUE sur le bail (`leases.landlord_id`).
-- Conséquence : un logement vacant n'avait pas de propriétaire — alors que
-- c'est précisément celui-là qu'on veut appeler.
--
-- CHOIX : un immeuble reste une ligne `properties` de type 'building', et
-- chaque logement une ligne `properties` qui pointe vers lui. Pas de table
-- `buildings` séparée : le type existe déjà dans le vocabulaire, et l'immeuble
-- hérite ainsi de l'adresse, du quartier, des activités, des paiements.
--
-- CHOIX : chaque logement est une VRAIE ligne, pas un compteur sur l'immeuble.
-- C'est ce qu'impose le besoin — des loyers différents d'un appartement à
-- l'autre — donc chacun porte son prix, son statut, son bail, son locataire.
-- ═══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────
-- 1 · LA STRUCTURE
-- ─────────────────────────────────────────────────────────────────

-- L'immeuble auquel ce logement appartient. NULL pour un bien isolé : une
-- villa, un terrain, un studio indépendant n'ont pas de parent, et c'est le
-- cas le plus fréquent du portefeuille.
alter table public.properties add column if not exists parent_id integer;

-- Le propriétaire bailleur, porté par le BIEN et non par le bail.
-- Sur un immeuble il vaut pour tout l'ensemble ; chaque logement le reçoit à
-- la création, et peut le surcharger — un immeuble en indivision existe.
alter table public.properties add column if not exists landlord_id integer;

-- 0 = rez-de-chaussée. Un entier plutôt qu'un texte : c'est ce qui permet de
-- trier les logements dans l'ordre du bâtiment plutôt que par ordre
-- alphabétique, où « 10e » précéderait « 2e ».
alter table public.properties add column if not exists floor integer;

-- Le nom d'usage du logement : « App 2 », « Porte gauche », « Boutique A ».
-- Séparé de `title`, qui reste la désignation complète et cherchable.
alter table public.properties add column if not exists unit_label text;

-- Les douches / salles d'eau. `bedrooms` existait, pas celles-ci — or
-- « 02 ch, 02 dch » est la façon dont un bien se décrit ici.
alter table public.properties add column if not exists bathrooms integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'properties_parent_id_fkey') then
    alter table public.properties
      add constraint properties_parent_id_fkey
      foreign key (parent_id) references public.properties(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'properties_landlord_id_fkey') then
    alter table public.properties
      add constraint properties_landlord_id_fkey
      foreign key (landlord_id) references public.clients(id) on delete set null;
  end if;
end $$;

-- Un bien ne peut pas être son propre immeuble. Garde-fou minimal : il ne
-- protège pas d'un cycle à trois, mais le seul moyen d'en créer un serait de
-- l'écrire à la main en SQL — l'interface ne propose jamais qu'un niveau.
alter table public.properties drop constraint if exists properties_parent_not_self;
alter table public.properties add constraint properties_parent_not_self
  check (parent_id is null or parent_id <> id);

create index if not exists idx_properties_parent   on public.properties (parent_id);
create index if not exists idx_properties_landlord on public.properties (landlord_id);


-- ─────────────────────────────────────────────────────────────────
-- 2 · REPRISE — le propriétaire déjà connu par les baux
--
-- Les baux saisis avant cette migration portent un `landlord_id`. Le remonter
-- sur le bien évite de ressaisir ce qu'on sait déjà. Rejouable : on ne touche
-- que les biens qui n'en ont pas encore.
-- ─────────────────────────────────────────────────────────────────
update public.properties p
   set landlord_id = l.landlord_id
  from public.leases l
 where l.property_id = p.id
   and l.landlord_id is not null
   and p.landlord_id is null;


-- ═══════════════════════════════════════════════════════════════════
-- VÉRIFICATION — « manquant » doit être vide.
-- ═══════════════════════════════════════════════════════════════════
with attendu(objet, present) as (
  select 'properties.parent_id',   count(*) from information_schema.columns
    where table_name = 'properties' and column_name = 'parent_id'
  union all
  select 'properties.landlord_id', count(*) from information_schema.columns
    where table_name = 'properties' and column_name = 'landlord_id'
  union all
  select 'properties.floor',       count(*) from information_schema.columns
    where table_name = 'properties' and column_name = 'floor'
  union all
  select 'properties.unit_label',  count(*) from information_schema.columns
    where table_name = 'properties' and column_name = 'unit_label'
  union all
  select 'properties.bathrooms',   count(*) from information_schema.columns
    where table_name = 'properties' and column_name = 'bathrooms'
  union all
  select 'cle etrangere immeuble', count(*) from pg_constraint
    where conname = 'properties_parent_id_fkey'
  union all
  select 'cle etrangere bailleur', count(*) from pg_constraint
    where conname = 'properties_landlord_id_fkey'
)
select
  coalesce(string_agg(objet, ', ') filter (where present = 0), '') as manquant,
  (select count(*) from public.properties where landlord_id is not null) as biens_avec_proprietaire,
  (select count(*) from public.properties where type = 'building')      as immeubles;
