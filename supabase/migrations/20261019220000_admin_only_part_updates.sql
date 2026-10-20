begin;

drop policy if exists "Authenticated users can update car parts"
  on public.pecas_carro;
drop policy if exists "Admins can update car parts"
  on public.pecas_carro;
drop policy if exists "Only admins can update car parts"
  on public.pecas_carro;

revoke update on table public.pecas_carro from public, anon;
grant update on table public.pecas_carro to authenticated;

create policy "Admins can update car parts"
  on public.pecas_carro
  as permissive
  for update
  to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Only admins can update car parts"
  on public.pecas_carro
  as restrictive
  for update
  to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

commit;
