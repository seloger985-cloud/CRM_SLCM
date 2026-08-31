-- ════════════════════════════════════════════════════════════════════
--  02_rls.sql — Politiques de sécurité de la base CRM.
--
--  Projet Supabase : dukwtseqticijlvrmkgz
--  Relevé le 31/08/2026 avec 00_introspection.sql.
--
--  C'est le fichier que cite assets/js/config.js. Il décrit ce qui
--  protège réellement les données : la clé anon publiée dans le
--  JavaScript est publique par construction, elle n'est pas un secret.
--  Ce qui filtre l'accès, c'est ce qui suit.
--
--  Ce fichier DÉCRIT l'état de la base, il ne la modifie pas.
-- ════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────
--  1 · RLS actif sur les huit tables
--
--  Une table sans RLS et lisible par la clé anon serait ouverte à tout
--  visiteur qui ouvre le code source du CRM. Aucune ne l'est.
-- ────────────────────────────────────────────────────────────────────

alter table public.clients         enable row level security;
alter table public.properties      enable row level security;
alter table public.activities      enable row level security;
alter table public.tasks           enable row level security;
alter table public.payments        enable row level security;
alter table public.invoices        enable row level security;
alter table public.demands         enable row level security;
alter table public.shared_listings enable row level security;


-- ────────────────────────────────────────────────────────────────────
--  2 · Politiques
--
--  ── Comment lire ce qui suit ────────────────────────────────────────
--
--  Deux jeux de politiques cohabitent sur six des sept tables :
--
--    · X_auth_select / insert / update / delete → using (true)
--      Tout compte authentifié, aucun filtre.
--
--    · X_owner_all → using (owner_id = auth.uid())
--      Chacun ne voit que ses propres lignes.
--
--  Les politiques PERMISSIVE d'une même commande se combinent avec OU,
--  pas avec ET. Sur une table qui porte les deux jeux, le résultat est
--  donc « true OU propriétaire », c'est-à-dire true : les politiques
--  X_owner_all n'ont aucun effet. Elles sont neutralisées par les
--  X_auth_*, qui sont plus larges.
--
--  Ce n'est pas un problème dans l'usage actuel — le CRM a un seul
--  utilisateur, et les colonnes owner_id restent correctement remplies
--  par auth.uid(), donc rien n'est perdu. C'est simplement à savoir :
--
--    · le jour où un second agent est créé, il verra tout, et les
--      X_owner_all ne l'en empêcheront pas ;
--    · pour cloisonner, il faudra SUPPRIMER les X_auth_*, pas en
--      ajouter d'autres.
--
--  Le seul réglage qui compte vraiment aujourd'hui n'est pas ici mais
--  dans Authentication → Sign In / Providers : si l'inscription libre
--  par email est activée, n'importe qui possédant la clé anon — donc
--  n'importe quel visiteur du CRM — peut se créer un compte, devenir
--  `authenticated`, et lire clients, paiements et factures. Vérifier
--  que « Allow new users to sign up » est bien désactivé.
--
--  shared_listings est la seule table cloisonnée pour de bon : elle ne
--  porte qu'une politique, la owner_all.
-- ────────────────────────────────────────────────────────────────────

-- ── clients ──
create policy clients_auth_select on public.clients as permissive for select to authenticated using (true);
create policy clients_auth_insert on public.clients as permissive for insert to authenticated with check (true);
create policy clients_auth_update on public.clients as permissive for update to authenticated using (true) with check (true);
create policy clients_auth_delete on public.clients as permissive for delete to authenticated using (true);
create policy clients_owner_all   on public.clients as permissive for all    to authenticated using ((owner_id = auth.uid())) with check ((owner_id = auth.uid()));

-- ── properties ──
create policy properties_auth_select on public.properties as permissive for select to authenticated using (true);
create policy properties_auth_insert on public.properties as permissive for insert to authenticated with check (true);
create policy properties_auth_update on public.properties as permissive for update to authenticated using (true) with check (true);
create policy properties_auth_delete on public.properties as permissive for delete to authenticated using (true);
create policy properties_owner_all   on public.properties as permissive for all    to authenticated using ((owner_id = auth.uid())) with check ((owner_id = auth.uid()));

-- ── activities ──
create policy activities_auth_select on public.activities as permissive for select to authenticated using (true);
create policy activities_auth_insert on public.activities as permissive for insert to authenticated with check (true);
create policy activities_auth_update on public.activities as permissive for update to authenticated using (true) with check (true);
create policy activities_auth_delete on public.activities as permissive for delete to authenticated using (true);
create policy activities_owner_all   on public.activities as permissive for all    to authenticated using ((owner_id = auth.uid())) with check ((owner_id = auth.uid()));

-- ── tasks ──
create policy tasks_auth_select on public.tasks as permissive for select to authenticated using (true);
create policy tasks_auth_insert on public.tasks as permissive for insert to authenticated with check (true);
create policy tasks_auth_update on public.tasks as permissive for update to authenticated using (true) with check (true);
create policy tasks_auth_delete on public.tasks as permissive for delete to authenticated using (true);
create policy tasks_owner_all   on public.tasks as permissive for all    to authenticated using ((owner_id = auth.uid())) with check ((owner_id = auth.uid()));

-- ── payments ──
create policy payments_auth_select on public.payments as permissive for select to authenticated using (true);
create policy payments_auth_insert on public.payments as permissive for insert to authenticated with check (true);
create policy payments_auth_update on public.payments as permissive for update to authenticated using (true) with check (true);
create policy payments_auth_delete on public.payments as permissive for delete to authenticated using (true);
create policy payments_owner_all   on public.payments as permissive for all    to authenticated using ((owner_id = auth.uid())) with check ((owner_id = auth.uid()));

-- ── invoices ──
-- Pas de owner_all : la table n'a pas de colonne owner_id.
create policy invoices_auth_select on public.invoices as permissive for select to authenticated using (true);
create policy invoices_auth_insert on public.invoices as permissive for insert to authenticated with check (true);
create policy invoices_auth_update on public.invoices as permissive for update to authenticated using (true) with check (true);
create policy invoices_auth_delete on public.invoices as permissive for delete to authenticated using (true);

-- ── demands ──
create policy demands_auth_select on public.demands as permissive for select to authenticated using (true);
create policy demands_auth_insert on public.demands as permissive for insert to authenticated with check (true);
create policy demands_auth_update on public.demands as permissive for update to authenticated using (true) with check (true);
create policy demands_auth_delete on public.demands as permissive for delete to authenticated using (true);
create policy demands_owner_all   on public.demands as permissive for all    to authenticated using ((owner_id = auth.uid())) with check ((owner_id = auth.uid()));

-- ── shared_listings ──
-- Seule table réellement cloisonnée par agent : une seule politique,
-- owner_id = auth.uid() en lecture comme en écriture.
create policy shared_listings_owner_all on public.shared_listings as permissive for all to authenticated using ((owner_id = auth.uid())) with check ((owner_id = auth.uid()));


-- ════════════════════════════════════════════════════════════════════
--  Si un jour un second agent rejoint le CRM
--
--  Le passage au cloisonnement se fait en supprimant les politiques
--  larges, table par table. Les owner_all déjà en place prennent alors
--  le relais sans autre modification, et les colonnes owner_id sont
--  déjà remplies depuis le début.
--
--    drop policy clients_auth_select on public.clients;
--    drop policy clients_auth_insert on public.clients;
--    drop policy clients_auth_update on public.clients;
--    drop policy clients_auth_delete on public.clients;
--    -- idem pour properties, activities, tasks, payments
--
--  invoices demanderait en plus une colonne owner_id et sa politique.
--
--  À ne faire que le jour venu : tant qu'il n'y a qu'un utilisateur,
--  cloisonner n'apporte rien et complique le débogage.
-- ════════════════════════════════════════════════════════════════════
