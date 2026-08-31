-- ════════════════════════════════════════════════════════════════════
--  03_demands.sql — Un client peut chercher plusieurs choses.
--
--  À JOUER dans le SQL Editor du projet dukwtseqticijlvrmkgz.
--  Contrairement à 01 et 02, ce fichier MODIFIE la base.
--
--  ── Le problème ──
--
--  Les critères de recherche vivent aujourd'hui dans la fiche client :
--  budget, budget_min, rent_sale, wanted_types, wanted_districts,
--  min_bedrooms, wants_furnished, matching_active. Une fiche, une demande.
--
--  Or un client cherche couramment deux choses à la fois — un studio pour
--  lui, un deux-chambres pour sa mère. Le seul contournement possible était
--  de créer deux fiches au même nom. C'est ce qui s'est passé pour
--  « M. Dicka », qu'on avait d'abord pris pour un doublon.
--
--  Ce n'était pas une erreur de saisie : c'était le modèle qui débordait par
--  le seul endroit disponible.
--
--  ── Le correctif ──
--
--  Une table `demands`, une ligne par recherche, rattachée au client.
--  Le rapprochement évalue alors une DEMANDE face à une annonce, et non
--  plus un client — ce qui est de toute façon plus juste : c'est la
--  recherche qui a un budget, pas la personne.
--
--  ── Ce que ce fichier NE fait PAS ──
--
--  Il ne supprime aucune colonne de `clients`. Les anciens champs restent
--  en place, ignorés, le temps que le code bascule. Le nettoyage est en
--  partie 3, à jouer PLUS TARD — jamais dans la même session.
-- ════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────
--  1 · La table
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.demands (
  id               bigserial primary key,
  client_id        integer not null references public.clients(id) on delete cascade,
  owner_id         uuid default auth.uid(),

  /* Libellé libre et facultatif — « pour sa mère », « investissement ».
     Quand il est vide, l'interface fabrique un libellé à partir des
     critères : « location · studio · Akwa · ≤ 150 000 FCFA ». */
  label            text,

  rent_sale        text,
  wanted_types     text[],
  wanted_districts text[],
  budget           bigint,
  budget_min       bigint,
  min_bedrooms     integer,
  wants_furnished  boolean,

  /* Une demande satisfaite ne disparaît pas : elle sort du rapprochement.
     Le CRM ne supprime rien — voir le README. */
  active           boolean not null default true,
  notes            text,
  created_at       timestamptz not null default now(),

  /* Dans le CREATE TABLE plutôt qu'en ALTER : `if not exists` la couvre,
     et le fichier reste rejouable sans erreur. */
  constraint demands_rent_sale_check
    check (rent_sale is null or rent_sale in ('rent', 'sale'))
);

create index if not exists idx_demands_client on public.demands using btree (client_id);
create index if not exists idx_demands_owner  on public.demands using btree (owner_id);
/* Le rapprochement ne balaie que les demandes vivantes. */
create index if not exists idx_demands_active on public.demands using btree (active)
  where (active = true);


-- ────────────────────────────────────────────────────────────────────
--  2 · Sécurité — calquée sur les six autres tables
-- ────────────────────────────────────────────────────────────────────

alter table public.demands enable row level security;

/* `create policy` n'accepte pas `if not exists` : sans ces drop, rejouer le
   fichier échoue au second passage. */
drop policy if exists demands_auth_select on public.demands;
drop policy if exists demands_auth_insert on public.demands;
drop policy if exists demands_auth_update on public.demands;
drop policy if exists demands_auth_delete on public.demands;
drop policy if exists demands_owner_all   on public.demands;

create policy demands_auth_select on public.demands as permissive for select to authenticated using (true);
create policy demands_auth_insert on public.demands as permissive for insert to authenticated with check (true);
create policy demands_auth_update on public.demands as permissive for update to authenticated using (true) with check (true);
create policy demands_auth_delete on public.demands as permissive for delete to authenticated using (true);
create policy demands_owner_all   on public.demands as permissive for all    to authenticated using ((owner_id = auth.uid())) with check ((owner_id = auth.uid()));


-- ────────────────────────────────────────────────────────────────────
--  3 · Reprise de l'existant
--
--  Chaque fiche client portant au moins un critère donne UNE demande.
--  Les fiches sans critère n'en produisent aucune : elles n'entraient pas
--  dans le rapprochement, rien ne change pour elles.
--
--  Rejouable sans dommage : le `not exists` empêche de dupliquer une
--  reprise déjà faite.
-- ────────────────────────────────────────────────────────────────────

insert into public.demands
  (client_id, owner_id, rent_sale, wanted_types, wanted_districts,
   budget, budget_min, min_bedrooms, wants_furnished, active, created_at)
select
  c.id,
  c.owner_id,
  /* La transaction était déduite du type de client quand elle n'était pas
     renseignée. On fige cette déduction ici, une bonne fois. */
  coalesce(c.rent_sale,
           case c.type when 'buyer' then 'sale'
                       when 'renter' then 'rent'
                       else null end),
  c.wanted_types,
  c.wanted_districts,
  c.budget,
  c.budget_min,
  c.min_bedrooms,
  c.wants_furnished,
  coalesce(c.matching_active, true),
  c.created_at
from public.clients c
where (
  c.budget is not null or c.budget_min is not null or c.min_bedrooms is not null
  or c.wants_furnished is true
  or (c.wanted_types is not null and array_length(c.wanted_types, 1) > 0)
  or (c.wanted_districts is not null and array_length(c.wanted_districts, 1) > 0)
)
and not exists (select 1 from public.demands d where d.client_id = c.id);


-- ────────────────────────────────────────────────────────────────────
--  Vérification — à lire avant de considérer la reprise réussie
-- ────────────────────────────────────────────────────────────────────

select
  (select count(*) from public.clients)                        as clients,
  (select count(*) from public.demands)                        as demandes_reprises,
  (select count(*) from public.demands where active)           as demandes_actives,
  (select count(*) from public.demands where rent_sale is null) as sans_transaction;

/* `sans_transaction` doit valoir 0 ou presque : une demande sans transaction
   ne peut pas être rapprochée — c'est le premier critère bloquant de
   match.js. Si le compte n'est pas nul, il s'agit de clients de type
   « seller », qui n'ont pas de recherche : à vérifier au cas par cas. */


-- ════════════════════════════════════════════════════════════════════
--  PARTIE 3 — NETTOYAGE, À NE JOUER QUE PLUS TARD
--
--  Une fois le code basculé sur `demands` ET quelques jours d'usage
--  passés sans surprise, les anciennes colonnes de `clients` deviennent
--  du bruit — et surtout une seconde source de vérité, qui finira par
--  diverger.
--
--  Ne pas jouer ces lignes dans la même session que la reprise : tant
--  qu'elles sont là, un retour en arrière reste possible.
--
--    alter table public.clients
--      drop column rent_sale,
--      drop column wanted_types,
--      drop column wanted_districts,
--      drop column budget,
--      drop column budget_min,
--      drop column min_bedrooms,
--      drop column wants_furnished,
--      drop column matching_active;
--
--  Puis relancer sql/00_introspection.sql et remplacer 01_schema.sql
--  et 02_rls.sql, sans quoi tests/check-columns.js dira le contraire
--  de la réalité.
-- ════════════════════════════════════════════════════════════════════
