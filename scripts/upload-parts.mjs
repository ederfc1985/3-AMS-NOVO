import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDirectory = path.join(projectRoot, "data");
const publicDirectory = path.join(projectRoot, "public");
const csvPath = path.join(dataDirectory, "pecas.csv");
const bucketName = "pecas-carro-images";
const expectedHeaders = [
  "sku",
  "nome",
  "categoria",
  "marca",
  "preco",
  "estoque",
  "imagem",
];
const dryRun = process.argv.includes("--dry-run");

dotenv.config({ path: path.join(projectRoot, ".env.local") });
dotenv.config({ path: path.join(projectRoot, ".env"), override: false });

function requireValue(value, name) {
  if (!value?.trim()) {
    throw new Error(
      `Variável ${name} ausente. Configure-a localmente em .env.local; nunca envie a service role key pelo chat.`,
    );
  }
  return value.trim();
}

function parsePrice(value, sku) {
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error(`Preço inválido no SKU ${sku}.`);
  }
  return price;
}

function parseStock(value, sku) {
  const stock = Number(value);
  if (!Number.isInteger(stock) || stock < 0) {
    throw new Error(`Estoque inválido no SKU ${sku}.`);
  }
  return stock;
}

async function loadCatalogue() {
  const csvContent = await readFile(csvPath, "utf8");
  const records = parse(csvContent, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  const headers = Object.keys(records[0] ?? {});
  if (expectedHeaders.some((header) => !headers.includes(header))) {
    throw new Error(`O CSV deve conter as colunas: ${expectedHeaders.join(", ")}.`);
  }
  if (records.length !== 100) {
    throw new Error(`Esperadas 100 peças no CSV; encontradas ${records.length}.`);
  }

  const skuSet = new Set();
  const imageSet = new Set();
  const entries = [];

  for (const row of records) {
    if (!row.sku || !row.nome || !row.categoria || !row.marca || !row.imagem) {
      throw new Error("O CSV contém uma linha com campos obrigatórios vazios.");
    }
    if (skuSet.has(row.sku)) {
      throw new Error(`SKU duplicado no CSV: ${row.sku}.`);
    }
    if (imageSet.has(row.imagem)) {
      throw new Error(`Imagem repetida no CSV: ${row.imagem}.`);
    }
    if (!/^peca_\d{3}\.png$/i.test(row.imagem)) {
      throw new Error(`Nome de imagem inválido para o SKU ${row.sku}.`);
    }

    const imagePath = path.join(publicDirectory, row.imagem);
    const image = await readFile(imagePath);
    const isPng =
      image.length >= 8 &&
      image.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
    if (!isPng) {
      throw new Error(`A imagem do SKU ${row.sku} não é um arquivo PNG válido.`);
    }

    skuSet.add(row.sku);
    imageSet.add(row.imagem);
    const color = row.nome.split(/\s+/).at(-1);
    entries.push({
      sku: row.sku,
      nome: row.nome,
      categoria: row.categoria,
      marca: row.marca,
      descricao: `Marca fictícia: ${row.marca}. Variação de cor: ${color}. Item de demonstração.`,
      preco: parsePrice(row.preco, row.sku),
      estoque: parseStock(row.estoque, row.sku),
      imagem: row.imagem,
      image,
    });
  }

  return entries;
}

async function uploadImage(supabase, entry) {
  const objectPath = `catalogo/${entry.imagem}`;
  const { error } = await supabase.storage
    .from(bucketName)
    .upload(objectPath, entry.image, {
      cacheControl: "3600",
      contentType: "image/png",
      upsert: true,
    });
  if (error) {
    throw new Error(`Falha ao enviar ${entry.imagem}: ${error.message}`);
  }

  return {
    sku: entry.sku,
    nome: entry.nome,
    descricao: entry.descricao,
    preco: entry.preco,
    estoque: entry.estoque,
    categoria_id: entry.categoriaId,
    ativo: true,
    imagem_url: supabase.storage
      .from(bucketName)
      .getPublicUrl(objectPath).data.publicUrl,
  };
}

async function run() {
  const entries = await loadCatalogue();
  const categories = [...new Set(entries.map((entry) => entry.categoria))];

  if (dryRun) {
    console.log(
      JSON.stringify({
        dryRun: true,
        products: entries.length,
        uniqueImages: new Set(entries.map((entry) => entry.imagem)).size,
        categories: categories.length,
        allImagesValidPng: true,
      }),
    );
    return;
  }

  const supabaseUrl = requireValue(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    "NEXT_PUBLIC_SUPABASE_URL",
  );
  const serviceRoleKey = requireValue(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  const parsedUrl = new URL(supabaseUrl);
  if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost") {
    throw new Error("A URL do Supabase deve usar HTTPS.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: existingCategories, error: categoryReadError } =
    await supabase.from("categorias").select("id,nome");
  if (categoryReadError) {
    throw new Error(`Falha ao consultar categorias: ${categoryReadError.message}`);
  }

  const categoryIds = new Map(
    (existingCategories ?? []).map((category) => [category.nome, category.id]),
  );
  const missingCategories = categories.filter(
    (category) => !categoryIds.has(category),
  );

  if (missingCategories.length > 0) {
    const timestamp = new Date().toISOString();
    const { data: insertedCategories, error: categoryInsertError } =
      await supabase
        .from("categorias")
        .insert(
          missingCategories.map((nome) => ({
            nome,
            descricao: `Categoria do catálogo demonstrativo de autopeças.`,
            criado_at: timestamp,
          })),
        )
        .select("id,nome");
    if (categoryInsertError) {
      throw new Error(
        `Falha ao criar categorias do catálogo: ${categoryInsertError.message}`,
      );
    }
    for (const category of insertedCategories ?? []) {
      categoryIds.set(category.nome, category.id);
    }
  }

  if (categories.some((category) => !categoryIds.has(category))) {
    throw new Error("Não foi possível resolver todas as categorias do catálogo.");
  }

  for (const entry of entries) {
    entry.categoriaId = categoryIds.get(entry.categoria);
  }

  const products = [];
  for (let offset = 0; offset < entries.length; offset += 5) {
    const batch = entries.slice(offset, offset + 5);
    products.push(...(await Promise.all(batch.map((entry) => uploadImage(supabase, entry)))));
  }

  const { data: upserted, error: upsertError } = await supabase
    .from("produtos")
    .upsert(products, { onConflict: "sku" })
    .select("sku");
  if (upsertError) {
    throw new Error(
      `Fotos enviadas, mas o catálogo não foi gravado: ${upsertError.message}. Rode supabase/setup.sql e execute novamente.`,
    );
  }

  const skus = entries.map((entry) => entry.sku);
  const { data: verified, error: verifyError } = await supabase
    .from("produtos")
    .select("sku,imagem_url")
    .in("sku", skus);
  if (verifyError) {
    throw new Error(
      `Catálogo gravado, mas não foi possível verificar todos os registros: ${verifyError.message}`,
    );
  }

  if (
    verified?.length !== entries.length ||
    verified.some((product) => !product.imagem_url)
  ) {
    throw new Error(
      `Verificação incompleta: ${verified?.length ?? 0} produtos encontrados para ${entries.length} SKUs.`,
    );
  }

  console.log(
    JSON.stringify({
      productsUpserted: upserted?.length ?? 0,
      imagesUploaded: entries.length,
      categoriesUsed: categories.length,
      verifiedProducts: verified.length,
      bucket: bucketName,
    }),
  );
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
