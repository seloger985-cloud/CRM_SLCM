-- ════════════════════════════════════════════════════════════════════
--  06_property_matching.sql — Un bien du CRM doit pouvoir être proposé.
--
--  À JOUER dans le SQL Editor du projet dukwtseqticijlvrmkgz.
--  Ce fichier MODIFIE la base.
--
--  ── Le problème ──
--
--  Le rapprochement ne travaille que sur les annonces de selogercm.com.
--  Une fiche saisie dans le CRM n'est proposée à personne, jamais.
--
--  La raison est mécanique : evaluate() dans assets/js/match.js exige
--  `rent_sale`, `bedrooms` et `furnished`, que `properties` ne porte pas —
--  et compare `status` à 'active', là où le CRM écrit 'available'.
--
--  Tant que le portefeuille interne se limitait à des imports du site,
--  cela ne se voyait pas : c'est l'annonce qui était rapprochée, pas la
--  fiche. Mais un bien reçu d'un confrère par WhatsApp n'est PAS sur le
--  site. Il n'aurait jamais trouvé preneur.
--
--  ── Le correctif ──
--
--  Trois colonnes, exactement celles qui manquent. Le vocabulaire est
--  celui du site — même raison qu'en 04 : une divergence d'orthographe ne
--  produit aucune erreur, elle rend le rapprochement muet.
--
--  La correspondance `available` → `active` se fait côté code, dans
--  asListing() : elle n'appartient pas à la base, qui a le droit de
--  nommer ses états comme elle l'entend.
--
--  ── Et l'historique d'envoi ──
--
--  `shared_listings.listing_id` était en `uuid` : les identifiants du
--  site. Un bien du CRM porte un entier. Sans élargissement, tracer son
--  envoi échouerait — silencieusement, puisque markShared() avale ses
--  erreurs par choix délibéré — et le bien serait reproposé à l'infini.
--  On passe donc en `text`, ce qui accepte les deux formes.
-- ════════════════════════════════════════════════════════════════════

alter table public.properties
  add column if not exists rent_sale text,
  add column if not exists bedrooms  integer,
  add column if not exists furnished boolean;

alter table public.properties drop constraint if exists properties_rent_sale_check;

alter table public.properties add constraint properties_rent_sale_check
  check (rent_sale is null or rent_sale in ('rent', 'sale'));

/* uuid → text : élargissement, aucune donnée perdue. Les identifiants du
   site restent lisibles tels quels, ceux du CRM s'y ajoutent préfixés. */
alter table public.shared_listings
  alter column listing_id type text using listing_id::text;


-- ────────────────────────────────────────────────────────────────────
--  Vérification
-- ────────────────────────────────────────────────────────────────────

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'properties'       and column_name in ('rent_sale','bedrooms','furnished'))
    or (table_name = 'shared_listings'  and column_name = 'listing_id'))
order by table_name, column_name;

/* Attendu : bedrooms integer, furnished boolean, rent_sale text pour
   properties, et listing_id text pour shared_listings. */

select
  count(*)                                       as biens_crm,
  count(*) filter (where rent_sale is not null)  as avec_transaction
from public.properties
where listing_id is null;

/* `avec_transaction` vaut 0 au premier passage : les fiches existantes
   n'ont pas de transaction, donc elles ne seront pas rapprochées tant
   qu'on ne l'aura pas renseignée. C'est volontaire — deviner si un bien
   est à louer ou à vendre à partir de son titre serait une invention. */
