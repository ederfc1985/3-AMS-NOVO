begin;

alter table public.produtos
  add column if not exists imagem_url text;

create unique index if not exists produtos_sku_unique_idx
  on public.produtos (sku);

create unique index if not exists categorias_nome_unique_idx
  on public.categorias (nome);

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
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
