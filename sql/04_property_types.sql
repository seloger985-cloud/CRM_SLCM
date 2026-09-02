-- ════════════════════════════════════════════════════════════════════
--  04_property_types.sql — Un bien n'est pas forcément une maison
--                          ou un appartement.
--
--  À JOUER dans le SQL Editor du projet dukwtseqticijlvrmkgz,
--  AVANT d'utiliser les nouveaux types dans le CRM.
--  Ce fichier MODIFIE la base.
--
--  ── Le problème ──
--
--  properties_type_check n'autorisait que 'house' et 'apartment'. Le
--  formulaire Biens ne proposait donc que ces deux-là, alors que l'agence
--  traite aussi des studios, des terrains, des boutiques, des entrepôts —
--  et que le site selogercm.com les publie déjà.
--
--  ── Une seule liste de types, partout ──
--
--  Les valeurs retenues sont EXACTEMENT celles de la base du site
--  (colonne listings.type). Ce n'est pas un détail de cohérence : le
--  rapprochement compare `listing.type` aux types recherchés d'une
--  demande. Une divergence d'orthographe ne produit aucune erreur —
--  elle rend simplement le rapprochement muet, ce qui est bien pire.
--
--  Le même vocabulaire sert donc désormais aux trois endroits :
--    · les annonces du site        (listings.type, hors de notre main)
--    · les fiches biens du CRM     (properties.type, cette contrainte)
--    · les critères d'une recherche (demands.wanted_types)
--
--  ── Aucune donnée touchée ──
--
--  On élargit une contrainte, on n'en restreint aucune : les biens
--  existants restent valides. Rejouable sans dommage.
-- ════════════════════════════════════════════════════════════════════

alter table public.properties drop constraint if exists properties_type_check;

alter table public.properties add constraint properties_type_check
  check (type is null or type in (
    'apartment',      -- appartement
    'studio',         -- studio
    'villa',          -- villa
    'house',          -- maison
    'duplex',         -- duplex
    'building',       -- immeuble
    'plots-of-land',  -- terrain
    'warehouse',      -- entrepôt
    'office',         -- bureau
    'shop',           -- boutique
    'commercial'      -- local commercial
  ));


-- ────────────────────────────────────────────────────────────────────
--  Vérification
-- ────────────────────────────────────────────────────────────────────

select pg_get_constraintdef(oid) as contrainte
from pg_constraint
where conrelid = 'public.properties'::regclass
  and conname = 'properties_type_check';

/* Doit lister les onze types. Si la requête ne renvoie rien, la contrainte
   a été supprimée sans être recréée : rejouer ce fichier. */

select type, count(*) as biens
from public.properties
group by type
order by biens desc;

/* Aucun type ne doit être absent de la liste ci-dessus. Comme on élargit,
   c'est acquis — cette requête sert à voir ce que contient réellement le
   portefeuille. */
