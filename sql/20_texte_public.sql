-- ═══════════════════════════════════════════════════════════════════
-- 20 — LE TEXTE PUBLIC D'UNE FICHE (15/11/2026)
-- À jouer dans le SQL Editor du CRM (projet dukwtseqticijlvrmkgz). Rejouable.
-- ═══════════════════════════════════════════════════════════════════
--
-- POURQUOI :
-- À la publication sur selogercm.com, la description de l'annonce est
-- désormais rédigée depuis le MESSAGE D'ORIGINE de l'annonceur, sans rien
-- de ce qui le concerne (capture-annonces, mode « rediger »). Ce texte est
-- gardé ici : rédigé une fois, retouchable, réutilisé si l'on republie.
--
-- `description` reste ce qu'elle était : la note INTERNE, qui contient le
-- message brut du confrère, son numéro, sa commission. Les deux ne se
-- mélangent jamais.
--
-- ORDRE : sans danger dans un sens comme dans l'autre. Le CRM lit et écrit
-- cette colonne à part (assets/js/texte-public.js) : avant la migration, la
-- rédaction marche, simplement sans mémoire.
-- ═══════════════════════════════════════════════════════════════════

alter table public.properties add column if not exists texte_public text;

comment on column public.properties.texte_public is
  'Texte public de l''annonce sur selogercm.com, rédigé depuis le message d''origine sans rien de l''annonceur (sql/20).';


-- ─────────────────────────────────────────────────────────────────
-- CONTRÔLE — attendu : « 1 ».
-- ─────────────────────────────────────────────────────────────────
select count(*) as colonne
from information_schema.columns
where table_schema = 'public' and table_name = 'properties' and column_name = 'texte_public';
