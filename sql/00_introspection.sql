-- ════════════════════════════════════════════════════════════════════
--  00_introspection.sql — Relève l'état réel de la base CRM.
--
--  Ce fichier ne modifie rien. Il lit les catalogues système de
--  PostgreSQL et recrache le schéma sous forme d'instructions SQL.
--
--  À quoi il sert
--  --------------
--  Le schéma et les politiques de sécurité du CRM ne vivent que dans
--  le tableau de bord Supabase. Personne ne peut les relire dans le
--  dépôt, détecter qu'une politique a été désactivée, ni reconstruire
--  le projet s'il est perdu. Ce fichier est l'antidote : il permet de
--  régénérer 01_schema.sql et 02_rls.sql à la demande, sans mot de
--  passe, sans outil à installer.
--
--  Comment s'en servir
--  -------------------
--  1. Dashboard Supabase → projet dukwtseqticijlvrmkgz (le CRM,
--     PAS hozlyddiqodvjguqywty qui est le site public).
--  2. SQL Editor → New query → coller ce fichier → Run.
--  3. Exporter le résultat en CSV.
--  4. Recopier les lignes dans 01_schema.sql et 02_rls.sql, en gardant
--     l'ordre de la colonne `seq`.
--
--  À relancer après toute modification du schéma, pour que le dépôt
--  ne redevienne pas obsolète.
--
--  La colonne `seq` donne l'ordre de rejeu :
--    1 = tables      2 = contraintes   3 = index
--    4 = activation RLS                5 = politiques
-- ════════════════════════════════════════════════════════════════════

with cols as (
  select
    c.relname as tbl,
    format(
      E'create table public.%I (\n  %s\n);',
      c.relname,
      string_agg(
        format('%I %s%s%s',
          a.attname,
          format_type(a.atttypid, a.atttypmod),
          case when a.attnotnull then ' not null' else '' end,
          case when ad.adbin is not null
               then ' default ' || pg_get_expr(ad.adbin, ad.adrelid)
               else '' end
        ),
        E',\n  ' order by a.attnum
      )
    ) as line
  from pg_class c
  join pg_namespace n  on n.oid = c.relnamespace
  join pg_attribute a  on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef ad on ad.adrelid = c.oid and ad.adnum = a.attnum
  where n.nspname = 'public' and c.relkind = 'r'
  group by c.relname
)

-- 1 · Les tables
select 1 as seq, tbl as objet, line
from cols

union all

-- 2 · Clés primaires, clés étrangères, contraintes uniques et CHECK
select 2, rel.relname,
  format('alter table public.%I add constraint %I %s;',
         rel.relname, con.conname, pg_get_constraintdef(con.oid))
from pg_constraint con
join pg_class rel   on rel.oid = con.conrelid
join pg_namespace n on n.oid = rel.relnamespace
where n.nspname = 'public' and con.contype in ('p', 'f', 'u', 'c')

union all

-- 3 · Index (ceux des clés primaires et contraintes uniques
--     apparaissent aussi en 2 : garder une seule des deux formes)
select 3, tablename, indexdef || ';'
from pg_indexes
where schemaname = 'public'

union all

-- 4 · Tables où le RLS est actif
select 4, c.relname,
  format('alter table public.%I enable row level security;', c.relname)
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relkind = 'r'
  and c.relrowsecurity

union all

-- 5 · Politiques de sécurité — le cœur de la protection des données
select 5, tablename,
  format('create policy %I on public.%I as %s for %s to %s%s%s;',
         policyname, tablename, permissive, cmd,
         array_to_string(roles, ', '),
         coalesce(' using (' || qual || ')', ''),
         coalesce(' with check (' || with_check || ')', ''))
from pg_policies
where schemaname = 'public'

order by 1, 2, 3;
