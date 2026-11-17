-- ═══════════════════════════════════════════════════════════════════
-- 21 — CORRECTIONS YAOUNDÉ (16/11/2026)
-- À jouer dans le SQL Editor du CRM (projet dukwtseqticijlvrmkgz). Rejouable.
-- ⚠ Le site porte les mêmes fiches : jouer aussi
--   corrections_yaounde_20261116.sql dans le SQL Editor du SITE.
-- ═══════════════════════════════════════════════════════════════════
--
-- 1. CF26-DLA-332 → CF26-YDE-332. Le terrain d'angle titré de Mendong a été
--    créé avant que le CRM ne connaisse les quartiers de Yaoundé : son
--    adresse ne disait pas « Yaoundé », property_city_code() a écrit DLA.
--    Le numéro est conservé ; l'ancien code va dans `ancien_code`, comme
--    en 14, pour qu'une recherche par l'ancien code retrouve la fiche.
--
-- 2. « Esos » → « Essos » dans le titre et la description de la fiche
--    CF26-YDE-352 (immeuble de 600 m²). Le quartier, lui, est déjà Essos.

begin;

update public.properties
   set ancien_code = coalesce(ancien_code, code),
       code = 'CF26-YDE-332'
 where code = 'CF26-DLA-332'
   and not exists (select 1 from public.properties where code = 'CF26-YDE-332');

update public.properties
   set title       = regexp_replace(title, '\mEsos\M', 'Essos', 'g'),
       description = regexp_replace(description, '\mEsos\M', 'Essos', 'g')
 where code = 'CF26-YDE-352'
   and (title ~ '\mEsos\M' or description ~ '\mEsos\M');

commit;

-- Contrôle : CF26-YDE-332 (ancien code CF26-DLA-332), et le titre de 352.
select id, code, ancien_code, district, title
  from public.properties
 where code in ('CF26-YDE-332', 'CF26-DLA-332', 'CF26-YDE-352')
 order by code;
