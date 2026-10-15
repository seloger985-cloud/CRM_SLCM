-- ═══════════════════════════════════════════════════════════════════
-- 08 — LES COLONNES QUE facture.html ÉCRIT RÉELLEMENT
--
-- À jouer dans le SQL Editor de dukwtseqticijlvrmkgz. Rejouable sans risque :
-- chaque ajout est conditionné par `if not exists`, donc seules les colonnes
-- réellement absentes sont créées.
--
-- POURQUOI :
-- Le 15/10/2026, la sauvegarde d'une facture échouait en HTTP 400. PostgREST
-- refuse l'insertion entière quand UNE colonne du payload n'existe pas — sans
-- rien dire d'utile côté navigateur, exactement comme le défaut
-- `accompte`/`reste` qui avait vidé l'écran Paiements.
--
-- `facture.html` écrit `property_id`, que `sql/01_schema.sql` ne liste pas sur
-- `invoices`. Le fichier de schéma a été complété à la main (voir son
-- avertissement en tête) et a divergé de la base. On ne sait donc plus lequel
-- des deux a raison — d'où cette migration qui aligne la base sur ce que le
-- code écrit, et la requête de vérification en fin de fichier.
--
-- APRÈS CETTE MIGRATION : rejouer `sql/00_introspection.sql` et remplacer
-- `01_schema.sql` par son résultat. Un schéma tenu à la main re-divergera.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Identité et numérotation ───
alter table public.invoices add column if not exists invoice_number        text;
alter table public.invoices add column if not exists invoice_number_source text default 'auto';
alter table public.invoices add column if not exists invoice_date          date default current_date;
alter table public.invoices add column if not exists status                text default 'emise';
alter table public.invoices add column if not exists issued_by             text;

-- ─── Le client, recopié sur la facture ───
-- Recopié ET lié : une facture doit rester lisible même si la fiche client
-- change plus tard. `client_id` sert au rapprochement, pas à l'affichage.
alter table public.invoices add column if not exists client_name     text;
alter table public.invoices add column if not exists client_phone    text;
alter table public.invoices add column if not exists client_email    text;
alter table public.invoices add column if not exists client_address  text;
alter table public.invoices add column if not exists client_district text;
alter table public.invoices add column if not exists client_id       integer;

-- ─── Le bien ───
alter table public.invoices add column if not exists property_type text;
alter table public.invoices add column if not exists property_ref  text;
alter table public.invoices add column if not exists property_id   integer;

-- ─── Les montants ───
alter table public.invoices add column if not exists line_items jsonb          default '[]'::jsonb;
alter table public.invoices add column if not exists subtotal   numeric(15,0)  default 0;
alter table public.invoices add column if not exists discount   numeric(15,0)  default 0;
alter table public.invoices add column if not exists total      numeric(15,0)  default 0;
alter table public.invoices add column if not exists notes      text;

-- ─── Clés étrangères ───
-- ON DELETE SET NULL, comme client_id : le CRM ne supprime rien aujourd'hui,
-- mais une facture ne doit jamais empêcher la suppression d'un bien le jour
-- où ça changera. La facture garde property_type et property_ref en clair.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_property_id_fkey') then
    alter table public.invoices
      add constraint invoices_property_id_fkey
      foreign key (property_id) references public.properties(id) on delete set null;
  end if;
end $$;

create index if not exists idx_invoices_client_id   on public.invoices (client_id);
create index if not exists idx_invoices_property_id on public.invoices (property_id);

-- ═══════════════ VÉRIFICATION ═══════════════
-- Doit renvoyer UNE SEULE ligne, « manquantes » vide.
-- Si une colonne y figure encore, c'est que le code écrit un nom que cette
-- migration ignore : me le donner tel quel.
with attendues(nom) as (
  values ('invoice_number'),('invoice_number_source'),('invoice_date'),('status'),
         ('issued_by'),('client_name'),('client_phone'),('client_email'),
         ('client_address'),('client_district'),('client_id'),('property_type'),
         ('property_ref'),('property_id'),('line_items'),('subtotal'),
         ('discount'),('total'),('notes'),('payment_date'),('payment_method')
)
select
  coalesce(string_agg(a.nom, ', '), '') as manquantes,
  (select count(*) from information_schema.columns where table_name = 'invoices') as colonnes_totales
from attendues a
where not exists (
  select 1 from information_schema.columns
  where table_name = 'invoices' and column_name = a.nom
);
