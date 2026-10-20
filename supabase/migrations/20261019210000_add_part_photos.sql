alter table public.pecas_carro
  add column if not exists imagem_url text;

alter table public.pecas_carro enable row level security;

drop policy if exists "Authenticated users can insert car parts"
  on public.pecas_carro;
create policy "Authenticated users can insert car parts"
  on public.pecas_carro
  for insert
  to authenticated
  with check (true);

drop policy if exists "Authenticated users can update car parts"
  on public.pecas_carro;
create policy "Authenticated users can update car parts"
  on public.pecas_carro
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated users can delete car parts"
  on public.pecas_carro;
create policy "Authenticated users can delete car parts"
  on public.pecas_carro
  for delete
  to authenticated
  using (true);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'pecas-carro-images',
  'pecas-carro-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated users can upload own part photos"
  on storage.objects;
create policy "Authenticated users can upload own part photos"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'pecas-carro-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Authenticated users can delete own part photos"
  on storage.objects;
create policy "Authenticated users can delete own part photos"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'pecas-carro-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
