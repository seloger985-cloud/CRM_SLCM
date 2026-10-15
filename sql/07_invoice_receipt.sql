-- ═══════════════════════════════════════════════════════════════════
-- 07 — ENCAISSEMENT D'UNE FACTURE ET REÇU
--
-- À jouer dans le SQL Editor de dukwtseqticijlvrmkgz. Rejouable.
--
-- POURQUOI :
-- `invoices.status` accepte depuis toujours 'emise', 'payee' et 'annulee',
-- et la colonne `payment_date` existe. Mais facture.html n'écrivait JAMAIS
-- que 'emise' : les deux autres états étaient morts, et aucune facture ne
-- pouvait être marquée encaissée. Le badge « Payée » s'affichait dans le
-- code sans que rien ne puisse le produire.
--
-- Remettre un reçu EST l'acte qui constate le paiement. Le bouton « Reçu »
-- fait donc les deux : il enregistre l'encaissement et imprime la preuve.
--
-- Une seule colonne manquait : par quel moyen l'argent est entré. Sans elle
-- un duplicata de reçu perdrait la mention « en espèces » ou « par Mobile
-- Money » — or un reçu réimprimé doit être identique à l'original.
-- ═══════════════════════════════════════════════════════════════════

alter table public.invoices
  add column if not exists payment_method text;

-- Le vocabulaire de l'encaissement, aligné sur les modalités déjà imprimées
-- au bas de chaque facture (« Mobile Money (Orange / MTN) · Virement
-- bancaire · Espèces »). NULL reste permis : une facture non encaissée n'a
-- pas de moyen de paiement.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoices_payment_method_check'
  ) then
    alter table public.invoices
      add constraint invoices_payment_method_check
      check (payment_method is null or payment_method = any (array[
        'especes'::text, 'mobile_money'::text, 'virement'::text, 'cheque'::text
      ]));
  end if;
end $$;

-- Retrouver les encaissements du mois sans parcourir toute la table.
create index if not exists idx_invoices_payment_date
  on public.invoices (payment_date)
  where payment_date is not null;

-- ─── Vérification ───
-- Doit renvoyer 1 ligne : la colonne existe et la contrainte est posée.
select
  (select count(*) from information_schema.columns
    where table_name = 'invoices' and column_name = 'payment_method') as colonne,
  (select count(*) from pg_constraint
    where conname = 'invoices_payment_method_check') as contrainte,
  (select count(*) from public.invoices where status = 'payee') as deja_encaissees;
