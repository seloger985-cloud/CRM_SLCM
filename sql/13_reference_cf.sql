-- ═══════════════════════════════════════════════════════════════════
-- 13 — LA RÉFÉRENCE AU FORMAT DU SITE : CF26-DLA-028 / SL26-DLA-031
--
-- À jouer dans le SQL Editor de dukwtseqticijlvrmkgz. Rejouable.
-- ⚠ DÉPEND DE sql/12_confreres.sql (colonne `code`, séquence, déclencheur).
--
-- POURQUOI :
-- Le code de 12 (T-014, A-015…) portait le TYPE du bien dans sa lettre, et
-- ne ressemblait pas aux références du site (SL26-DLA-170842). Deux familles
-- de références se côtoyaient sur selogercm.com. Décision de l'utilisateur
-- le 24/10/2026 : une seule nomenclature, dont le préfixe dit l'ORIGINE.
--
--   CF{AA}-{VILLE}-{NNN}   bien d'un confrère  (confrere_id renseigné)
--   SL{AA}-{VILLE}-{NNN}   mandat direct de l'agence
--
-- CHOIX : le NUMÉRO est conservé au recodage. T-028 devient CF26-DLA-028 :
-- « le 28 » reste le 28, et le compteur unique de 12 continue de garantir
-- qu'aucun numéro ne sert deux fois, quel que soit le préfixe.
--
-- CHOIX : l'ancien code reste dans `ancien_code`, et le CRM le cherche
-- aussi. Des visuels portant « T-028 » sont déjà partis : un client qui le
-- cite doit toujours être retrouvé.
--
-- CHOIX : préfixe et ville sont figés à la création, comme le numéro. Une
-- référence publiée ne change plus — c'est elle qui relie le client au bien.
--
-- APRÈS CE FICHIER : deux annonces du site portent encore T-028 / T-029.
-- La requête en toute fin, À LANCER SÉPARÉMENT, écrit les ordres SQL à
-- jouer ensuite dans le projet DU SITE.
-- ═══════════════════════════════════════════════════════════════════


alter table public.properties add column if not exists ancien_code text;

-- Prix sur demande (24/10/2026). La fiche GARDE le vrai prix, s'il est
-- connu : il sert aux rapprochements et à la négociation. Seule la
-- publication sur le site le tait — crm-publier.js n'envoie alors aucun
-- prix (NULL sur le site, jamais 0).
alter table public.properties add column if not exists prix_sur_demande boolean not null default false;


-- La ville, lue dans l'adresse. Le CRM n'a pas de colonne ville : l'adresse
-- est du texte libre (« Logpom, Douala »). Mêmes codes que cityCodes dans
-- assets/js/config.js du site. Douala par défaut : c'est l'essentiel du stock.
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
  from (select lower(coalesce(adresse, '') || ' ' || coalesce(quartier, '')) as t) x;
$$;

create or replace function public.property_reference(confrere integer, adresse text, quartier text,
                                                     cree timestamp, numero bigint)
returns text
language sql
immutable
as $$
  select case when confrere is not null then 'CF' else 'SL' end
      || to_char(coalesce(cree, now()::timestamp), 'YY') || '-'
      || public.property_city_code(adresse, quartier) || '-'
      || lpad(numero::text, 3, '0');
$$;

-- Le déclencheur de 12, au nouveau format. Même séquence : les numéros
-- continuent là où ils en étaient.
create or replace function public.property_set_code()
returns trigger
language plpgsql
as $$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := public.property_reference(new.confrere_id, new.address, new.district,
                                          coalesce(new.created_at, now()::timestamp),
                                          nextval('public.property_code_seq'));
  end if;
  return new;
end;
$$;


-- Recodage de l'existant : seulement les codes à l'ancien format (une
-- lettre, un tiret, des chiffres). Rejouable : un code déjà au nouveau
-- format n'est plus touché, et `ancien_code` n'est jamais écrasé.
update public.properties
   set ancien_code = code,
       code = public.property_reference(confrere_id, address, district, created_at,
                                        substring(code from '[0-9]+$')::bigint)
 where code ~ '^[TAMICB]-[0-9]+$';

create index if not exists idx_properties_ancien_code on public.properties (ancien_code);


-- ═══════════════════════════════════════════════════════════════════
-- VÉRIFICATION — doit renvoyer : 2, 0.
-- (catalogue et ancien format seulement : voir tests/check-migrations.js)
-- ═══════════════════════════════════════════════════════════════════
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'properties'
       and column_name in ('ancien_code', 'prix_sur_demande'))               as colonnes_ajoutees,
  (select count(*) from public.properties where code ~ '^[TAMICB]-[0-9]+$') as encore_ancien_format;


-- ═══════════════════════════════════════════════════════════════════
-- ENSUITE, DANS UNE NOUVELLE REQUÊTE (pas dans ce fichier) :
-- elle écrit, pour chaque bien déjà publié, l'ordre à jouer dans le projet
-- Supabase DU SITE (hozlyddiqodvjguqywty). Copier le résultat, le coller
-- dans le SQL Editor du site, l'exécuter.
--
--   select string_agg(format('update public.listings set ref = %L where ref = %L;',
--                            code, ancien_code), E'\n')
--   from public.properties
--   where listing_slug is not null and ancien_code is not null;
-- ═══════════════════════════════════════════════════════════════════
