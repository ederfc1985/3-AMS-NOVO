begin;

drop policy if exists "Authenticated users can insert car parts"
  on public.pecas_carro;
drop policy if exists "Admins can insert car parts"
  on public.pecas_carro;
drop policy if exists "Only admins can insert car parts"
  on public.pecas_carro;

revoke insert on table public.pecas_carro from public, anon;
grant insert on table public.pecas_carro to authenticated;

create policy "Admins can insert car parts"
  on public.pecas_carro
  as permissive
  for insert
  to authenticated
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Only admins can insert car parts"
  on public.pecas_carro
  as restrictive
  for insert
  to authenticated
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

commit;
