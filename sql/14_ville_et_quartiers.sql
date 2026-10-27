-- ═══════════════════════════════════════════════════════════════════
-- 14 — VILLE DU CODE ET QUARTIERS ALIGNÉS SUR LE SITE (27/10/2026)
-- À jouer dans le SQL Editor du CRM (projet dukwtseqticijlvrmkgz). Rejouable.
-- ═══════════════════════════════════════════════════════════════════
--
-- 1. LA VILLE DU CODE. property_city_code() (sql/13) lit la ville dans
--    l'ADRESSE, texte libre. Une adresse « Yassa, route de Yaoundé »
--    donnait YDE : CF26-YDE-035 pour un terrain à Douala. Une route, un axe,
--    une direction ne sont pas la ville du bien : on retire ces itinéraires
--    avant de chercher. Ne vaut que pour les codes À VENIR.
--
-- 2. CF26-YDE-035 → CF26-DLA-035. Le numéro est conservé, comme en 13 ;
--    l'ancien code va dans `ancien_code`, pour qu'une recherche par l'ancien
--    code retrouve encore la fiche. Recodage CIBLÉ, volontairement : un code
--    est figé à la création et peut déjà figurer sur le site, un visuel, un
--    message WhatsApp. Les autres codes que la règle corrigée écrirait
--    autrement sont seulement LISTÉS en fin de fichier, pour décision.
--    ⚠ Le site porte la même référence : jouer aussi corrections_crm_site.sql
--    dans le SQL Editor du SITE.
--
-- 3. QUARTIERS : « Beedi » prend l'orthographe du site, « Béedi ». Le site
--    compare les quartiers lettre pour lettre : sans cela, l'immeuble de
--    Beedi n'était trouvé ni par le filtre ni par la barre de recherche.

begin;

create or replace function public.property_city_code(adresse text, quartier text)
returns text
language sql
immutable
as $$
  select case
    when t ~ 'yaound'      then 'YDE'
    when t ~ 'bafoussam'   then 'BFS'
    when t ~ 'garoua'      then 'GRE'
    when t ~ 'maroua'      then 'MRW'
    when t ~ 'bamenda'     then 'BDA'
    when t ~ 'ngaound'     then 'NGD'
    when t ~ 'bertoua'     then 'BTA'
    when t ~ 'ebolowa'     then 'EBW'
    when t ~ 'kribi'       then 'KBI'
    else 'DLA'
  end
  from (
    -- « route de Yaoundé », « axe Douala-Yaoundé », « direction Kribi »… :
    -- un itinéraire, pas la ville du bien.
    select regexp_replace(
             lower(coalesce(adresse, '') || ' ' || coalesce(quartier, '')),
             '(route|rte|axe|direction|sortie|entr[ée]e|vers|p[ée]age|carrefour)[[:space:]]+(de[[:space:]]+|du[[:space:]]+|d'')?[a-zàâçéèêëîïôûùüÿ'' -]*(yaound|bafoussam|kribi|ebolowa|bertoua|ngaound|bamenda|garoua|maroua)[[:alpha:]]*',
             ' ', 'g') as t
  ) x;
$$;

update public.properties
   set ancien_code = coalesce(ancien_code, code),
       code = 'CF26-DLA-035'
 where code = 'CF26-YDE-035'
   and not exists (select 1 from public.properties where code = 'CF26-DLA-035');

update public.properties set district = 'Béedi' where district in ('Beedi', 'beedi', 'BEEDI');

commit;

-- Contrôle : la fiche 035 en CF26-DLA-035 (ancien code CF26-YDE-035), et
-- la ou les fiches de Béedi.
select id, code, ancien_code, district, address
  from public.properties
 where code like '%-035' or district = 'Béedi'
 order by id;

-- Pour décision, sans rien changer : les codes dont la ville diffère de ce
-- que la règle corrigée écrirait aujourd'hui.
select id, code, address, district,
       public.property_city_code(address, district) as ville_selon_la_regle
  from public.properties
 where code ~ '^(CF|SL)[0-9]{2}-[A-Z]{3}-[0-9]{3,}$'
   and substring(code from '^[A-Z]{2}[0-9]{2}-([A-Z]{3})-') <> public.property_city_code(address, district)
 order by id;
