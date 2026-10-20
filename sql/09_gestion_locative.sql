-- ═══════════════════════════════════════════════════════════════════
-- 09 — GESTION LOCATIVE : baux, échéances, signalements
--
-- À jouer dans le SQL Editor de dukwtseqticijlvrmkgz. Rejouable sans risque.
--
-- MODÈLE RETENU (décidé avec l'utilisateur le 20/10/2026) :
--   · Le locataire paie DIRECTEMENT le propriétaire. L'agence ne tient pas
--     de compte de gérance : elle constate, elle relance, et elle facture sa
--     commission à part avec le module Facture. Un seul flux d'argent.
--   · La commission est un POURCENTAGE du loyer mensuel.
--
-- Ce que ce choix évite : une table de reversements, un solde propriétaire,
-- un relevé de gérance. Tout cela deviendrait nécessaire le jour où l'agence
-- encaisserait — mais le construire « au cas où » coûterait aujourd'hui sans
-- rien rendre.
-- ═══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────
-- 1 · LE PROPRIÉTAIRE BAILLEUR
--
-- `clients.type` n'acceptait que buyer / seller / renter. Le mandant d'une
-- gérance n'est ni l'un ni l'autre : il ne vend pas, il confie. Sans ce type,
-- il faudrait l'enregistrer en 'seller' et toute statistique par type
-- mentirait.
-- ─────────────────────────────────────────────────────────────────
alter table public.clients drop constraint if exists clients_type_check;
alter table public.clients add constraint clients_type_check
  check (type is null or type = any (array[
    'buyer'::text, 'seller'::text, 'renter'::text, 'landlord'::text
  ]));


-- ─────────────────────────────────────────────────────────────────
-- 2 · LE BAIL
--
-- Un bail relie TROIS choses : un bien, un locataire, un propriétaire. Aucune
-- table existante ne pouvait porter ça — `properties` ne connaît pas les
-- personnes, `clients` ne connaît pas les durées.
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.leases (
  id              serial primary key,

  property_id     integer not null references public.properties(id),
  tenant_id       integer not null references public.clients(id),
  -- Le mandant. Nullable : on connaît parfois le bien et le locataire avant
  -- d'avoir créé la fiche du propriétaire, et refuser le bail pour ça
  -- obligerait à saisir dans un ordre imposé.
  landlord_id     integer references public.clients(id),

  start_date      date not null,
  -- Durée en mois plutôt qu'une date de fin : c'est ce qui est écrit dans le
  -- contrat, et la date de fin s'en déduit. Stocker les deux les ferait
  -- diverger. NULL = bail à durée indéterminée, courant en location simple.
  duration_months integer,

  rent_amount     numeric(12,0) not null,
  -- Jour du mois où le loyer est dû. Borné 1–28 volontairement : un bail au
  -- 31 n'aurait pas d'échéance en février, et décaler silencieusement serait
  -- pire que l'interdire à la saisie.
  payment_day     integer not null default 5,

  -- Usages camerounais : la caution est rendue en fin de bail, l'avance est
  -- du loyer payé d'avance. Les deux s'expriment en MOIS, c'est ainsi qu'on
  -- en parle (« deux mois de caution »), et le montant s'en déduit.
  caution_months  integer default 0,
  avance_months   integer default 0,

  -- Part de l'agence, en pourcentage du loyer mensuel.
  commission_rate numeric(5,2) default 0,

  status          text not null default 'active',
  notes           text,

  created_at      timestamp with time zone default now(),
  owner_id        uuid default auth.uid()
);

alter table public.leases drop constraint if exists leases_status_check;
alter table public.leases add constraint leases_status_check
  check (status = any (array['active'::text, 'ended'::text, 'suspended'::text]));

alter table public.leases drop constraint if exists leases_payment_day_check;
alter table public.leases add constraint leases_payment_day_check
  check (payment_day between 1 and 28);

alter table public.leases drop constraint if exists leases_rent_check;
alter table public.leases add constraint leases_rent_check
  check (rent_amount > 0);

-- Un bien ne peut porter qu'UN bail actif à la fois. C'est la règle métier la
-- plus importante du module : deux baux actifs sur le même bien signifient
-- qu'une fin de bail n'a pas été enregistrée, et toutes les échéances
-- générées ensuite seraient fausses. L'index partiel la fait respecter par la
-- base, pas par du JavaScript qu'on peut contourner.
create unique index if not exists uniq_lease_active_property
  on public.leases (property_id) where status = 'active';

create index if not exists idx_leases_tenant   on public.leases (tenant_id);
create index if not exists idx_leases_landlord on public.leases (landlord_id);
create index if not exists idx_leases_status   on public.leases (status);


-- ─────────────────────────────────────────────────────────────────
-- 3 · LES ÉCHÉANCES — greffées sur `payments`, pas à côté
--
-- Une échéance de loyer EST un paiement attendu. `payments` porte déjà
-- client_id, property_id, amount, status ('pending' / 'paid') et
-- payment_date. Le tableau de bord y lit déjà ses retards : tout paiement
-- 'pending' dont la date est dépassée de plus de 7 jours remonte dans
-- « À faire ».
--
-- Y loger les loyers fait donc fonctionner la relance SANS une ligne de code.
-- Une table parallèle aurait obligé à réécrire l'alerte, le chiffre
-- d'affaires et l'écran Paiements en double.
--
-- Deux colonnes manquaient seulement.
-- ─────────────────────────────────────────────────────────────────

-- Le bail dont relève l'échéance. NULL pour tout le reste : un paiement
-- ponctuel, une commission de vente, un encaissement de facture.
alter table public.payments add column if not exists lease_id integer;

-- Le MOIS concerné, toujours au premier du mois. Sans lui « le loyer
-- d'octobre » n'est pas exprimable, et rien n'empêche de générer deux fois la
-- même échéance. Distinct de payment_date, qui est la date d'exigibilité.
alter table public.payments add column if not exists period date;

-- Ce que la ligne représente. L'écran Paiements mêle désormais des loyers,
-- des commissions et des encaissements de facture : sans cette colonne, on ne
-- pourrait plus les distinguer ni filtrer.
alter table public.payments add column if not exists kind text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_lease_id_fkey') then
    alter table public.payments
      add constraint payments_lease_id_fkey
      foreign key (lease_id) references public.leases(id) on delete set null;
  end if;
end $$;

alter table public.payments drop constraint if exists payments_kind_check;
alter table public.payments add constraint payments_kind_check
  check (kind is null or kind = any (array[
    'rent'::text, 'caution'::text, 'avance'::text, 'commission'::text, 'other'::text
  ]));

-- LA garde contre le doublon : un seul loyer par bail et par mois. Générer
-- les échéances est une action qu'on relance sans y penser (« j'ai déjà
-- cliqué ? »), et un loyer d'octobre en double fausserait à la fois la
-- relance et le chiffre d'affaires. La base refuse, le code n'a pas à vérifier.
create unique index if not exists uniq_payment_lease_period
  on public.payments (lease_id, period) where lease_id is not null and period is not null;

create index if not exists idx_payments_lease on public.payments (lease_id);


-- ─────────────────────────────────────────────────────────────────
-- 4 · LES SIGNALEMENTS
--
-- Pourquoi pas une `activity` : une activité est un FAIT daté et clos (un
-- appel a eu lieu). Un signalement a un CYCLE DE VIE — ouvert, en cours,
-- résolu — une urgence, et parfois un coût. Le forcer dans `activities`
-- obligerait à lire son état dans de la prose, exactement le défaut qui avait
-- motivé la colonne `outcome`.
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.incidents (
  id           serial primary key,

  -- Le bien est obligatoire, le bail ne l'est pas : un dégât peut être
  -- signalé entre deux locataires, ou par le propriétaire lui-même.
  property_id  integer not null references public.properties(id),
  lease_id     integer references public.leases(id) on delete set null,

  reported_at  date not null default current_date,
  -- Qui signale. Oriente la réponse : un propriétaire qui signale attend un
  -- devis, un locataire attend une intervention.
  reported_by  text default 'tenant',

  title        text not null,
  description  text,

  urgency      text not null default 'normale',
  status       text not null default 'ouvert',

  -- Coût réel une fois l'intervention faite. NULL tant qu'on ne sait pas :
  -- zéro voudrait dire « gratuit », ce n'est pas la même chose.
  cost         numeric(12,0),
  resolved_at  date,
  resolution   text,

  created_at   timestamp with time zone default now(),
  owner_id     uuid default auth.uid()
);

alter table public.incidents drop constraint if exists incidents_status_check;
alter table public.incidents add constraint incidents_status_check
  check (status = any (array['ouvert'::text, 'en_cours'::text, 'resolu'::text]));

alter table public.incidents drop constraint if exists incidents_urgency_check;
alter table public.incidents add constraint incidents_urgency_check
  check (urgency = any (array['basse'::text, 'normale'::text, 'urgente'::text]));

alter table public.incidents drop constraint if exists incidents_reported_by_check;
alter table public.incidents add constraint incidents_reported_by_check
  check (reported_by = any (array['tenant'::text, 'landlord'::text, 'agency'::text]));

create index if not exists idx_incidents_property on public.incidents (property_id);
create index if not exists idx_incidents_lease    on public.incidents (lease_id);
-- Les signalements non clos, qui sont les seuls qu'on cherche au quotidien.
create index if not exists idx_incidents_ouverts  on public.incidents (status)
  where status <> 'resolu';


-- ─────────────────────────────────────────────────────────────────
-- 5 · RLS — calqué sur les six autres tables
--
-- CRM interne à un seul utilisateur : on autorise tout utilisateur
-- authentifié. Les colonnes owner_id sont posées pour le jour où un second
-- agent arriverait, mais cloisonner aujourd'hui ne protégerait de rien et
-- compliquerait le débogage. Voir sql/02_rls.sql, même raisonnement.
-- ─────────────────────────────────────────────────────────────────
alter table public.leases    enable row level security;
alter table public.incidents enable row level security;

do $$
declare t text; a text;
begin
  foreach t in array array['leases', 'incidents'] loop
    foreach a in array array['select', 'insert', 'update', 'delete'] loop
      if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = t and policyname = t || '_auth_' || a
      ) then
        execute format(
          'create policy %I on public.%I as permissive for %s to authenticated %s',
          t || '_auth_' || a, t, a,
          case a
            when 'insert' then 'with check (true)'
            when 'update' then 'using (true) with check (true)'
            else 'using (true)'
          end
        );
      end if;
    end loop;
  end loop;
end $$;


-- ═══════════════════════════════════════════════════════════════════
-- VÉRIFICATION — doit renvoyer une ligne, « manquant » vide.
-- ═══════════════════════════════════════════════════════════════════
with attendu(objet, present) as (
  select 'table leases',        count(*) from information_schema.tables
    where table_name = 'leases'
  union all
  select 'table incidents',     count(*) from information_schema.tables
    where table_name = 'incidents'
  union all
  select 'payments.lease_id',   count(*) from information_schema.columns
    where table_name = 'payments' and column_name = 'lease_id'
  union all
  select 'payments.period',     count(*) from information_schema.columns
    where table_name = 'payments' and column_name = 'period'
  union all
  select 'payments.kind',       count(*) from information_schema.columns
    where table_name = 'payments' and column_name = 'kind'
  union all
  select 'type landlord',       count(*) from pg_constraint
    where conname = 'clients_type_check' and pg_get_constraintdef(oid) like '%landlord%'
  union all
  select 'un seul bail actif',  count(*) from pg_indexes
    where indexname = 'uniq_lease_active_property'
  union all
  select 'un loyer par mois',   count(*) from pg_indexes
    where indexname = 'uniq_payment_lease_period'
  union all
  select 'politiques RLS',      count(*) from pg_policies
    where tablename in ('leases', 'incidents')
)
select
  coalesce(string_agg(objet, ', ') filter (where present = 0), '') as manquant,
  count(*) filter (where present > 0) as objets_en_place
from attendu;
