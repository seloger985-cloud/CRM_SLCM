-- ═══════════════════════════════════════════════════════════════════
-- 19 — LE BILAN DE LA SEMAINE, LE SAMEDI À 18H00 (10/11/2026)
-- À jouer dans le SQL Editor du CRM (projet dukwtseqticijlvrmkgz). Rejouable.
--
-- DÉPEND DE sql/18 (extensions pg_cron et pg_net, secret du cron dans le
-- coffre) et de la version 2026-11-10-b de `daily-digest`, la première qui
-- sait faire le bilan. Avec une version plus ancienne, la fonction répond
-- `kind_inconnu` et rien ne part — sans dégât.
-- ═══════════════════════════════════════════════════════════════════
--
-- POURQUOI :
-- Le samedi, Armand veut compiler la semaine : interactions, nouveaux
-- clients, visites et leur issue, suites faites ou en souffrance,
-- signatures, encaissements — et ce qu'il faut reprendre lundi. L'écran
-- « Bilan de la semaine » le montre ; ce message le lui apporte, sans
-- montant (un bot Telegram n'est pas chiffré de bout en bout).
--
-- HORAIRE : samedi 18h00 à Douala = 17h00 UTC → '0 17 * * 6'.
-- Le message du soir (lundi → vendredi) ne part pas le samedi : pas de
-- doublon. Pour changer l'heure, modifier la chaîne et rejouer le fichier ;
-- cron.schedule remplace la tâche du même nom.
-- ═══════════════════════════════════════════════════════════════════

select cron.schedule('daily-digest-semaine', '0 17 * * 6', $cron$
  select net.http_post(
    url     := 'https://dukwtseqticijlvrmkgz.supabase.co/functions/v1/daily-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                        where name = 'daily_digest_cron_secret')),
    body    := jsonb_build_object('kind', 'semaine'),
    timeout_milliseconds := 30000
  );
$cron$);


-- ─────────────────────────────────────────────────────────────────
-- CONTRÔLE — attendu : « 3 » : les tâches du matin, du soir et du samedi.
-- ─────────────────────────────────────────────────────────────────
select count(*) as taches
from cron.job
where jobname in ('daily-digest-matin', 'daily-digest-soir', 'daily-digest-semaine');
