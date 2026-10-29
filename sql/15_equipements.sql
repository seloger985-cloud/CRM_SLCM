-- ═══════════════════════════════════════════════════════════════════
-- 15 — ÉQUIPEMENTS D'UN BIEN, COMME SUR LE SITE (29/10/2026)
-- À jouer dans le SQL Editor du CRM (projet dukwtseqticijlvrmkgz). Rejouable.
-- ═══════════════════════════════════════════════════════════════════
--
-- Le formulaire de publication du site (publish.html) coche sept
-- équipements, chacun une colonne booléenne de `listings`. Le CRM n'en avait
-- aucun : un « parking + groupe électrogène » écrit par le confrère restait
-- enfoui dans la description, et ne partait pas sur le site à la publication.
--
-- MÊMES NOMS que les colonnes du site, pour que la publication les recopie
-- telles quelles (netlify/functions/crm-publier.js du site).
-- NULL = non renseigné (le message n'en disait rien), pas « absent ».
-- Une instruction par colonne : tests/check-columns.js les lit ainsi.

alter table public.properties add column if not exists parking boolean;
alter table public.properties add column if not exists generator boolean;
alter table public.properties add column if not exists pool boolean;
alter table public.properties add column if not exists climatisation boolean;
alter table public.properties add column if not exists forage boolean;
alter table public.properties add column if not exists gardien boolean;
alter table public.properties add column if not exists videosurveillance boolean;

-- Contrôle : 7 lignes.
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'properties'
   and column_name in ('parking', 'generator', 'pool', 'climatisation', 'forage', 'gardien', 'videosurveillance')
 order by column_name;
