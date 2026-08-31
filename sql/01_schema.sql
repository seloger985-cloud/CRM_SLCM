-- ════════════════════════════════════════════════════════════════════
--  01_schema.sql — Tables, contraintes et index du CRM.
--
--  Projet Supabase : dukwtseqticijlvrmkgz
--  Relevé le 31/08/2026 avec 00_introspection.sql.
--
--  Ce fichier DÉCRIT la base, il ne la modifie pas. Ne pas le rejouer
--  sur la base de production : il sert à relire le schéma sans ouvrir
--  le dashboard, et à reconstruire le projet s'il était perdu.
--
--  Les politiques de sécurité sont dans 02_rls.sql.
--  Après toute modification du schéma : relancer 00_introspection.sql
--  et remplacer ce fichier.
-- ════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────
--  1 · TABLES
-- ────────────────────────────────────────────────────────────────────

-- Fiches clients. Les colonnes budget/wanted_*/min_bedrooms/wants_furnished
-- alimentent le rapprochement avec les annonces du site (assets/js/match.js).
-- address, district et niu sont renseignées par la page facture, pas par le
-- formulaire client du CRM.
create table public.clients (
  id integer not null default nextval('clients_id_seq'::regclass),
  name text not null,
  phone text,
  email text,
  type text,
  notes text,
  created_at timestamp without time zone default now(),
  status text not null default 'nouvelle demande'::text,
  source text,
  source_detail text,
  address text,
  district text,
  niu text,
  owner_id uuid default auth.uid(),
  budget bigint,
  budget_min bigint,
  rent_sale text,
  wanted_types text[],
  wanted_districts text[],
  min_bedrooms integer,
  wants_furnished boolean,
  matching_active boolean default true
);

-- Biens. Deux natures cohabitent :
--   listing_id / listing_slug renseignés  → fiche rattachée à une annonce
--                                           publiée sur selogercm.com
--   listing_id null                       → saisie purement interne
-- L'annonce n'est jamais copiée ici : la fiche pointe vers elle.
create table public.properties (
  id integer not null default nextval('properties_id_seq'::regclass),
  title text not null,
  address text not null,
  type text,
  price integer,
  status text default 'available'::text,
  description text,
  created_at timestamp without time zone default now(),
  district text,
  ref text,
  owner_id uuid default auth.uid(),
  listing_id uuid,
  listing_slug text,
  source text default 'crm'::text
);

create table public.activities (
  id integer not null default nextval('activities_id_seq'::regclass),
  type text not null,
  client_id integer,
  property_id integer,
  notes text not null,
  date date not null,
  created_at timestamp without time zone default now(),
  owner_id uuid default auth.uid()
);

create table public.tasks (
  id integer not null default nextval('tasks_id_seq'::regclass),
  title text not null,
  description text,
  due_date date,
  status text default 'pending'::text,
  created_at timestamp without time zone default now(),
  owner_id uuid default auth.uid()
);

-- ATTENTION : voir « Écarts entre le code et le schéma » plus bas.
-- Cette table n'a PAS de colonnes accompte / reste, contrairement à ce
-- que suppose TABLE_COLS dans assets/js/app.js.
create table public.payments (
  id integer not null default nextval('payments_id_seq'::regclass),
  client_id integer,
  property_id integer,
  amount numeric(12,2) not null,
  status text not null default 'pending'::text,
  payment_date date not null default CURRENT_DATE,
  notes text,
  created_at timestamp with time zone default now(),
  owner_id uuid default auth.uid()
);

-- Factures (page facture.html). Seule table à clé uuid et à horodatage
-- avec fuseau. Les lignes de facturation sont stockées en jsonb plutôt
-- qu'en table fille : une facture émise ne bouge plus, on la fige.
-- Note : pas de colonne owner_id, contrairement aux six autres tables.
create table public.invoices (
  id uuid not null default gen_random_uuid(),
  invoice_number text not null,
  client_name text not null,
  client_phone text,
  client_email text,
  client_address text,
  client_district text,
  property_type text,
  property_ref text,
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(15,0) not null default 0,
  discount numeric(15,0) not null default 0,
  total numeric(15,0) not null default 0,
  notes text,
  status text not null default 'emise'::text,
  payment_date date,
  invoice_date date not null default CURRENT_DATE,
  due_date date,
  issued_by text,
  internal_notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  invoice_number_source text default 'auto'::text,
  client_niu text,
  client_id integer
);

-- Historique des annonces déjà envoyées à un client, pour ne jamais
-- reproposer deux fois le même bien (assets/js/match.js).
-- owner_id n'est jamais envoyé par le code : il compte sur auth.uid().
create table public.shared_listings (
  id bigint not null default nextval('shared_listings_id_seq'::regclass),
  owner_id uuid default auth.uid(),
  client_id bigint,
  listing_id uuid not null,
  listing_slug text,
  channel text default 'whatsapp'::text,
  created_at timestamp with time zone default now()
);


-- ────────────────────────────────────────────────────────────────────
--  2 · CONTRAINTES
--
--  Les CHECK sont la documentation exécutable des valeurs autorisées.
--  Tout écart entre une liste déroulante du CRM et un CHECK ci-dessous
--  produit une erreur 23514 à l'enregistrement — silencieuse pour qui
--  ne lit pas la console.
-- ────────────────────────────────────────────────────────────────────

alter table public.clients add constraint clients_pkey PRIMARY KEY (id);
alter table public.clients add constraint clients_type_check CHECK ((type = ANY (ARRAY['buyer'::text, 'seller'::text, 'renter'::text])));
alter table public.clients add constraint clients_rent_sale_check CHECK (((rent_sale IS NULL) OR (rent_sale = ANY (ARRAY['rent'::text, 'sale'::text]))));

alter table public.properties add constraint properties_pkey PRIMARY KEY (id);
alter table public.properties add constraint properties_type_check CHECK ((type = ANY (ARRAY['house'::text, 'apartment'::text])));
alter table public.properties add constraint properties_status_check CHECK ((status = ANY (ARRAY['available'::text, 'sold'::text, 'rented'::text])));

alter table public.activities add constraint activities_pkey PRIMARY KEY (id);
alter table public.activities add constraint activities_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
alter table public.activities add constraint activities_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id);
alter table public.activities add constraint activities_type_check CHECK ((type = ANY (ARRAY['call'::text, 'meeting'::text, 'email'::text, 'visit'::text])));

alter table public.tasks add constraint tasks_pkey PRIMARY KEY (id);
alter table public.tasks add constraint tasks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text])));

alter table public.payments add constraint payments_pkey PRIMARY KEY (id);
alter table public.payments add constraint payments_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
alter table public.payments add constraint payments_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id);
-- N'autorise que 'pending' et 'paid'. Le formulaire Paiements du CRM
-- propose aussi 'accompte' et 'reste' : voir les écarts en fin de fichier.
alter table public.payments add constraint payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text])));

alter table public.invoices add constraint invoices_pkey PRIMARY KEY (id);
alter table public.invoices add constraint invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
alter table public.invoices add constraint invoices_invoice_number_key UNIQUE (invoice_number);
alter table public.invoices add constraint invoices_status_check CHECK ((status = ANY (ARRAY['emise'::text, 'payee'::text, 'annulee'::text])));
alter table public.invoices add constraint invoices_invoice_number_source_check CHECK ((invoice_number_source = ANY (ARRAY['auto'::text, 'manual'::text])));

alter table public.shared_listings add constraint shared_listings_pkey PRIMARY KEY (id);
alter table public.shared_listings add constraint shared_listings_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;


-- ────────────────────────────────────────────────────────────────────
--  3 · INDEX
--
--  Les index créés automatiquement par les clés primaires et les
--  contraintes UNIQUE ne sont pas répétés ici : ils sont déjà couverts
--  par la section 2.
-- ────────────────────────────────────────────────────────────────────

create index idx_clients_owner    on public.clients using btree (owner_id);
create index idx_clients_district on public.clients using btree (district) where (district is not null);
create index idx_clients_niu      on public.clients using btree (niu) where (niu is not null);

create index idx_properties_owner on public.properties using btree (owner_id);
-- Une référence interne ne peut pas être portée par deux biens…
create unique index idx_properties_ref_unique on public.properties using btree (ref) where (ref is not null);
-- …et une annonce du site ne peut être rattachée qu'à une seule fiche CRM.
-- C'est ce qui empêche l'import en double depuis l'écran Propriétés.
create unique index uniq_properties_listing on public.properties using btree (owner_id, listing_id) where (listing_id is not null);

create index idx_activities_owner on public.activities using btree (owner_id);
create index idx_tasks_owner      on public.tasks using btree (owner_id);
create index idx_payments_owner   on public.payments using btree (owner_id);

create index idx_invoices_client        on public.invoices using btree (client_id);
create index invoices_client_idx        on public.invoices using btree (client_name);
create index invoices_invoice_date_idx  on public.invoices using btree (invoice_date desc);
create index invoices_status_idx        on public.invoices using btree (status);
-- Redondant : invoice_number porte déjà un index unique via la contrainte
-- invoices_invoice_number_key. Deux index sur la même colonne, deux
-- écritures à chaque facture, pour aucune lecture plus rapide.
-- Suppression possible : drop index public.invoices_number_idx;
create index invoices_number_idx        on public.invoices using btree (invoice_number);

create index idx_shared_client on public.shared_listings using btree (client_id);
-- Condition technique du onConflict de markShared() dans match.js :
-- PostgreSQL a besoin d'un index unique sur exactement ces trois colonnes.
create unique index uniq_shared on public.shared_listings using btree (owner_id, client_id, listing_id);


-- ════════════════════════════════════════════════════════════════════
--  ÉCARTS CONNUS ENTRE LE CODE ET LE SCHÉMA — au 31/08/2026
--
--  1. payments : accompte / reste
--     TABLE_COLS.payments dans assets/js/app.js demande les colonnes
--     `accompte` et `reste`, qui n'existent pas dans cette table.
--     PostgREST rejette donc TOUTE lecture de payments (erreur 42703),
--     getAll('payments') retourne un tableau vide, et par conséquent :
--       · l'écran Paiements est toujours vide ;
--       · le chiffre d'affaires du tableau de bord vaut toujours 0 ;
--       · aucune relance de paiement n'est jamais proposée.
--     Le formulaire propose en plus les statuts 'accompte' et 'reste',
--     que payments_status_check refuse.
--     À trancher : retirer ces deux notions du code, ou les ajouter ici
--     (colonnes + élargissement du CHECK).
--
--  2. clients : address, district, niu
--     Ces colonnes existent et sont renseignées par facture.html, mais
--     n'apparaissent ni dans TABLE_COLS.clients ni dans le formulaire
--     client du CRM. Pas de perte de données — les mises à jour du CRM
--     ne touchent pas à ces champs — mais elles sont invisibles côté CRM.
--
--  3. invoices n'a pas de owner_id
--     Contrairement aux six autres tables. Sans conséquence tant que le
--     CRM n'a qu'un utilisateur.
-- ════════════════════════════════════════════════════════════════════
