"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

const PAGE_SIZE = 12;
const PART_COLUMNS =
  "id,codigo_sku,nome,descricao,categoria,marca_veiculo,modelo_veiculo,ano_compativel";

type Part = {
  id: string;
  codigo_sku: string;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  marca_veiculo: string | null;
  modelo_veiculo: string | null;
  ano_compativel: string | null;
};

type SearchField =
  | "nome"
  | "codigo_sku"
  | "categoria"
  | "marca_veiculo"
  | "modelo_veiculo";

type PartEditForm = Pick<
  Part,
  | "codigo_sku"
  | "nome"
  | "descricao"
  | "categoria"
  | "marca_veiculo"
  | "modelo_veiculo"
  | "ano_compativel"
>;

type PartCreateForm = PartEditForm;

const EMPTY_PART_FORM: PartCreateForm = {
  codigo_sku: "",
  nome: "",
  descricao: "",
  categoria: "",
  marca_veiculo: "",
  modelo_veiculo: "",
  ano_compativel: "",
};

function isSearchField(value: string): value is SearchField {
  return (
    value === "nome" ||
    value === "codigo_sku" ||
    value === "categoria" ||
    value === "marca_veiculo" ||
    value === "modelo_veiculo"
  );
}

function getPartImage(part: Part) {
  const partDescription = `${part.nome} ${part.categoria ?? ""}`.toLowerCase();
  const imageByPart = [
    [/correia/, "/correia-dentada.svg"],
    [/pneu/, "/peca_003.svg"],
    [/disco/, "/peca_008.svg"],
    [/pastilha|freio/, "/peca_006.svg"],
    [/vela|igni/, "/peca_015.svg"],
    [/filtro/, "/peca_018.svg"],
    [/amortecedor|suspens/, "/peca_009.svg"],
    [/bateria/, "/peca_001.png"],
    [/farol/, "/peca_005.svg"],
    [/retrovisor|espelho/, "/peca_001.svg"],
    [/engrenagem|comando/, "/peca_004.svg"],
  ] as const;
  const match = imageByPart.find(([pattern]) =>
    pattern.test(partDescription),
  );

  return match?.[1] ?? null;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = error.message;
    const code = "code" in error ? error.code : undefined;

    if (typeof message === "string") {
      return typeof code === "string"
        ? `Erro do Supabase (${code}): ${message}`
        : message;
    }
  }

  return "Não foi possível carregar as peças. Verifique a conexão com o Supabase.";
}

export default function Home() {
  const [parts, setParts] = useState<Part[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [searchField, setSearchField] = useState<SearchField>("nome");
  const [appliedSearchField, setAppliedSearchField] =
    useState<SearchField>("nome");
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [loadError, setLoadError] = useState("");
  const [catalogRefresh, setCatalogRefresh] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [editingPart, setEditingPart] = useState<Part | null>(null);
  const [editForm, setEditForm] = useState<PartEditForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [editMessage, setEditMessage] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<PartCreateForm>(EMPTY_PART_FORM);
  const [createError, setCreateError] = useState("");
  const [creatingPart, setCreatingPart] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAdmin(session?.user.app_metadata.role === "admin");
      setAuthError("");
      setAuthLoading(false);
    });

    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      setIsAdmin(data.user?.app_metadata.role === "admin");
      setAuthError(
        error && error.name !== "AuthSessionMissingError"
          ? getErrorMessage(error)
          : "",
      );
      setAuthLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadParts() {
      setLoading(true);
      setLoadError("");

      try {
        let query = createClient()
          .from("pecas_carro")
          .select(PART_COLUMNS, { count: "exact" })
          .order("nome")
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

        if (appliedSearch) {
          query = query.ilike(appliedSearchField, `%${appliedSearch}%`);
        }

        const { data, error, count } = await query;
        if (error) throw error;

        if (active) {
          setParts(data ?? []);
          setTotal(count ?? 0);
          if (!appliedSearch || appliedSearchField !== "categoria") {
            setCategories((current) => [
              ...new Set([
                ...current,
                ...(data ?? [])
                  .map((part) => part.categoria)
                  .filter(
                    (category): category is string => Boolean(category),
                  ),
              ]),
            ]);
          }
        }
      } catch (error) {
        if (active) {
          setLoadError(getErrorMessage(error));
          setParts([]);
          setTotal(0);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadParts();
    return () => {
      active = false;
    };
  }, [appliedSearch, appliedSearchField, catalogRefresh, page]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(0);
    setAppliedSearchField(searchField);
    const search = searchText.trim();
    setAppliedSearch(search);
    setSelectedCategory(
      searchField === "categoria" && categories.includes(search) ? search : "",
    );
  }

  function clearSearch() {
    setSearchText("");
    setAppliedSearch("");
    setSelectedCategory("");
    setPage(0);
  }

  async function submitAdminLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoggingIn(true);
    setLoginError("");

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });

      if (error) throw error;

      if (data.user.app_metadata.role !== "admin") {
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) {
          throw new Error(
            "As credenciais foram aceitas, mas esta conta não tem app_metadata.role = admin. A sessão não foi encerrada automaticamente; saia e configure a permissão de administrador no Supabase antes de entrar novamente.",
          );
        }
        setLoginError(
          "As credenciais estão corretas, mas falta a permissão de administrador. No Supabase, defina app_metadata.role como admin para esta conta e entre novamente.",
        );
        return;
      }

      setIsAdmin(true);
      setLoginOpen(false);
      setLoginEmail("");
      setLoginPassword("");
      setLoginError("");
      setAuthError("");
    } catch (error) {
      setLoginError(getErrorMessage(error));
    } finally {
      setLoggingIn(false);
    }
  }

  async function signOutAdmin() {
    const { error } = await createClient().auth.signOut();
    if (error) {
      setAuthError(getErrorMessage(error));
      return;
    }
    setIsAdmin(false);
  }

  function filterByCategory(category: string) {
    setSelectedCategory(category);
    setSearchField("categoria");
    setSearchText(category);
    setAppliedSearchField("categoria");
    setAppliedSearch(category);
    setPage(0);
  }

  function openEdit(part: Part) {
    setEditingPart(part);
    setEditForm({
      codigo_sku: part.codigo_sku,
      nome: part.nome,
      descricao: part.descricao ?? "",
      categoria: part.categoria ?? "",
      marca_veiculo: part.marca_veiculo ?? "",
      modelo_veiculo: part.modelo_veiculo ?? "",
      ano_compativel: part.ano_compativel ?? "",
    });
    setEditError("");
    setEditMessage("");
  }

  function openCreate() {
    setCreateForm(EMPTY_PART_FORM);
    setCreateError("");
    setCreateOpen(true);
  }

  function closeCreate() {
    if (creatingPart) return;
    setCreateOpen(false);
    setCreateError("");
  }

  async function saveNewPart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin) return;

    const values = {
      codigo_sku: createForm.codigo_sku.trim(),
      nome: createForm.nome.trim(),
      descricao: createForm.descricao?.trim() || null,
      categoria: createForm.categoria?.trim() || null,
      marca_veiculo: createForm.marca_veiculo?.trim() || null,
      modelo_veiculo: createForm.modelo_veiculo?.trim() || null,
      ano_compativel: createForm.ano_compativel?.trim() || null,
    };

    if (!values.codigo_sku || !values.nome) {
      setCreateError("Preencha o código SKU e o nome da peça.");
      return;
    }

    setCreatingPart(true);
    setCreateError("");
    setEditMessage("");

    try {
      const { error } = await createClient()
        .from("pecas_carro")
        .insert(values);

      if (error) throw error;

      setCategories((current) =>
        values.categoria && !current.includes(values.categoria)
          ? [...current, values.categoria]
          : current,
      );
      setSearchText("");
      setAppliedSearch("");
      setSelectedCategory("");
      setPage(0);
      setCatalogRefresh((current) => current + 1);
      setCreateOpen(false);
      setCreateForm(EMPTY_PART_FORM);
      setEditMessage("Peça cadastrada com sucesso.");
    } catch (error) {
      setCreateError(getErrorMessage(error));
    } finally {
      setCreatingPart(false);
    }
  }

  function closeEdit() {
    if (savingEdit) return;
    setEditingPart(null);
    setEditForm(null);
    setEditError("");
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingPart || !editForm || !isAdmin) return;

    const values = {
      codigo_sku: editForm.codigo_sku.trim(),
      nome: editForm.nome.trim(),
      descricao: editForm.descricao?.trim() || null,
      categoria: editForm.categoria?.trim() || null,
      marca_veiculo: editForm.marca_veiculo?.trim() || null,
      modelo_veiculo: editForm.modelo_veiculo?.trim() || null,
      ano_compativel: editForm.ano_compativel?.trim() || null,
    };

    if (!values.codigo_sku || !values.nome) {
      setEditError("Preencha o código SKU e o nome da peça.");
      return;
    }

    setSavingEdit(true);
    setEditError("");
    setEditMessage("");

    try {
      const { data, error } = await createClient()
        .from("pecas_carro")
        .update(values)
        .eq("id", editingPart.id)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error(
          "Nenhuma alteração foi salva. Confirme que sua conta tem app_metadata.role = admin e que a política RLS de administradores foi aplicada.",
        );
      }

      setParts((current) =>
        current.map((part) =>
          part.id === editingPart.id ? { ...part, ...values } : part,
        ),
      );
      setEditMessage("Cadastro atualizado com sucesso.");
      setEditingPart(null);
      setEditForm(null);
    } catch (error) {
      setEditError(getErrorMessage(error));
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="AMS Autopeças, início">
          <span className="brand-mark">A</span>
          <span>
            AMS <span className="brand-light">AUTOPEÇAS</span>
          </span>
        </Link>
        <div className="topbar-actions">
          <Link className="topbar-nav-link" href="#catalogo">
            Catálogo
          </Link>
          <span className="topbar-nav-divider" aria-hidden="true" />
          <span className="topbar-label">PEÇAS AUTOMOTIVAS</span>
          {!authLoading &&
            (isAdmin ? (
              <>
                <span className="admin-session-label">ADMINISTRADOR</span>
                <button
                  className="admin-login-button"
                  type="button"
                  onClick={() => void signOutAdmin()}
                >
                  Sair
                </button>
              </>
            ) : (
              <button
                className="admin-login-button"
                type="button"
                onClick={() => {
                  setLoginError("");
                  setLoginOpen(true);
                }}
              >
                Entrar como administrador
              </button>
            ))}
        </div>
      </header>

      <div className="page-content catalog-content">
        {(authError || editMessage) && (
          <p
            className={`feedback ${
              authError ? "feedback-error" : "feedback-success"
            }`}
            role="status"
          >
            {authError || editMessage}
          </p>
        )}

        {loginOpen && (
          <div
            className="edit-dialog-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !loggingIn) {
                setLoginOpen(false);
                setLoginError("");
              }
            }}
          >
            <section
              aria-labelledby="admin-login-title"
              aria-modal="true"
              className="panel admin-login-dialog"
              role="dialog"
            >
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">ÁREA RESTRITA</p>
                  <h2 id="admin-login-title">Acesso do administrador</h2>
                </div>
                <button
                  aria-label="Fechar login"
                  className="button button-secondary"
                  type="button"
                  disabled={loggingIn}
                  onClick={() => {
                    setLoginOpen(false);
                    setLoginError("");
                  }}
                >
                  Fechar
                </button>
              </div>
              <p className="admin-login-description">
                Entre com a conta autorizada para editar os cadastros do
                catálogo.
              </p>
              <form
                className="admin-login-form"
                onSubmit={submitAdminLogin}
              >
                <label className="form-field">
                  <span>E-mail</span>
                  <input
                    autoComplete="username"
                    className="form-input"
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(event) => setLoginEmail(event.target.value)}
                  />
                </label>
                <label className="form-field">
                  <span>Senha</span>
                  <input
                    autoComplete="current-password"
                    className="form-input"
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(event) => setLoginPassword(event.target.value)}
                  />
                </label>
                {loginError && (
                  <p className="feedback feedback-error" role="alert">
                    {loginError}
                  </p>
                )}
                <button
                  className="button button-primary admin-login-submit"
                  type="submit"
                  disabled={loggingIn}
                >
                  {loggingIn ? "Entrando..." : "Entrar"}
                </button>
              </form>
            </section>
          </div>
        )}

        {createOpen && isAdmin && (
          <div className="edit-dialog-backdrop">
            <section
              aria-labelledby="create-part-title"
              aria-modal="true"
              className="panel edit-dialog"
              role="dialog"
            >
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">ADMINISTRADOR</p>
                  <h2 id="create-part-title">Cadastrar peça</h2>
                </div>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={creatingPart}
                  onClick={closeCreate}
                >
                  Fechar
                </button>
              </div>

              <form className="edit-form" onSubmit={saveNewPart}>
                <label className="form-field">
                  <span>Código SKU *</span>
                  <input
                    autoFocus
                    className="form-input"
                    required
                    maxLength={20}
                    value={createForm.codigo_sku}
                    onChange={(event) =>
                      setCreateForm({
                        ...createForm,
                        codigo_sku: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Nome da peça *</span>
                  <input
                    className="form-input"
                    required
                    maxLength={120}
                    value={createForm.nome}
                    onChange={(event) =>
                      setCreateForm({
                        ...createForm,
                        nome: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Categoria</span>
                  <input
                    className="form-input"
                    value={createForm.categoria ?? ""}
                    onChange={(event) =>
                      setCreateForm({
                        ...createForm,
                        categoria: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Marca do veículo</span>
                  <input
                    className="form-input"
                    value={createForm.marca_veiculo ?? ""}
                    onChange={(event) =>
                      setCreateForm({
                        ...createForm,
                        marca_veiculo: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Modelo do veículo</span>
                  <input
                    className="form-input"
                    value={createForm.modelo_veiculo ?? ""}
                    onChange={(event) =>
                      setCreateForm({
                        ...createForm,
                        modelo_veiculo: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Ano compatível</span>
                  <input
                    className="form-input"
                    value={createForm.ano_compativel ?? ""}
                    onChange={(event) =>
                      setCreateForm({
                        ...createForm,
                        ano_compativel: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="form-field edit-description">
                  <span>Descrição</span>
                  <textarea
                    className="form-input form-textarea"
                    rows={3}
                    value={createForm.descricao ?? ""}
                    onChange={(event) =>
                      setCreateForm({
                        ...createForm,
                        descricao: event.target.value,
                      })
                    }
                  />
                </label>

                {createError && (
                  <p
                    className="feedback feedback-error edit-feedback"
                    role="alert"
                  >
                    {createError}
                  </p>
                )}

                <div className="edit-actions">
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={creatingPart}
                    onClick={closeCreate}
                  >
                    Cancelar
                  </button>
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={creatingPart}
                  >
                    {creatingPart ? "Salvando..." : "Cadastrar peça"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {editingPart && editForm && (
          <div className="edit-dialog-backdrop">
            <section
              aria-labelledby="edit-dialog-title"
              aria-modal="true"
              className="panel edit-dialog"
              role="dialog"
            >
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">ADMINISTRADOR</p>
                  <h2 id="edit-dialog-title">Editar cadastro</h2>
                </div>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={savingEdit}
                  onClick={closeEdit}
                >
                  Fechar
                </button>
              </div>

              <form className="edit-form" onSubmit={saveEdit}>
                <label className="form-field">
                  <span>Código SKU *</span>
                  <input
                    className="form-input"
                    required
                    maxLength={20}
                    value={editForm.codigo_sku}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        codigo_sku: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Nome da peça *</span>
                  <input
                    className="form-input"
                    required
                    maxLength={120}
                    value={editForm.nome}
                    onChange={(event) =>
                      setEditForm({ ...editForm, nome: event.target.value })
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Categoria</span>
                  <input
                    className="form-input"
                    value={editForm.categoria ?? ""}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        categoria: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Marca do veículo</span>
                  <input
                    className="form-input"
                    value={editForm.marca_veiculo ?? ""}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        marca_veiculo: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Modelo do veículo</span>
                  <input
                    className="form-input"
                    value={editForm.modelo_veiculo ?? ""}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        modelo_veiculo: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Ano compatível</span>
                  <input
                    className="form-input"
                    value={editForm.ano_compativel ?? ""}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        ano_compativel: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="form-field edit-description">
                  <span>Descrição</span>
                  <textarea
                    className="form-input form-textarea"
                    rows={3}
                    value={editForm.descricao ?? ""}
                    onChange={(event) =>
                      setEditForm({
                        ...editForm,
                        descricao: event.target.value,
                      })
                    }
                  />
                </label>

                {editError && (
                  <p className="feedback feedback-error edit-feedback" role="alert">
                    {editError}
                  </p>
                )}

                <div className="edit-actions">
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={savingEdit}
                    onClick={closeEdit}
                  >
                    Cancelar
                  </button>
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={savingEdit}
                  >
                    {savingEdit ? "Salvando..." : "Salvar cadastro"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        <section className="catalog-hero">
          <div className="catalog-hero-copy">
            <p className="hero-eyebrow">ENGENHARIA EM CADA DETALHE</p>
            <h1>
              Peças de precisão.
              <br />
              Performance para cada jornada.
            </h1>
            <p>
              Encontre componentes para manter seu veículo no melhor caminho.
              Escolha uma categoria e descubra o catálogo AMS.
            </p>
            <a className="hero-cta" href="#catalogo">
              Explorar catálogo
              <span aria-hidden="true">↓</span>
            </a>
          </div>
          <div className="hero-artwork" aria-hidden="true">
            <Image
              alt=""
              className="hero-car-image"
              src="/catalogo-hero.png"
              width={1440}
              height={900}
              priority
            />
            <span className="hero-artwork-index">AMS / 01</span>
          </div>
          <div className="hero-bottomline">
            <span>AMS AUTOPEÇAS</span>
            <span className="hero-bottomline-rule" />
            <span>
              {loading ? "CATÁLOGO ONLINE" : `${total} PEÇAS NO CATÁLOGO`}
            </span>
          </div>
        </section>

        <section
          className="catalog-shop"
          id="catalogo"
          aria-label="Catálogo de peças"
        >
          <div className="shop-heading">
            <div>
              <p className="eyebrow">SELEÇÃO AMS</p>
              <h2>Encontre sua peça</h2>
            </div>
            <div className="shop-heading-actions">
              <div className="connection-pill">
                <span className="connection-dot" />
                Atualizado online
              </div>
              {!authLoading && isAdmin && (
                <button
                  className="button button-primary catalog-create-button"
                  type="button"
                  onClick={openCreate}
                >
                  <span aria-hidden="true">+</span>
                  Cadastrar peça
                </button>
              )}
            </div>
          </div>

          <form className="search-form marketplace-search" onSubmit={submitSearch}>
            <label className="search-field">
              <span className="visually-hidden">Campo para busca</span>
              <select
                className="form-input search-select"
                value={searchField}
                onChange={(event) => {
                  if (isSearchField(event.target.value)) {
                    setSearchField(event.target.value);
                  }
                }}
              >
                <option value="nome">Nome</option>
                <option value="codigo_sku">Código SKU</option>
                <option value="categoria">Categoria</option>
                <option value="marca_veiculo">Marca</option>
                <option value="modelo_veiculo">Modelo</option>
              </select>
            </label>
            <label className="search-field search-text-field">
              <span className="visually-hidden">Buscar peças</span>
              <input
                className="form-input"
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="O que você está procurando?"
              />
            </label>
            <button
              className="button button-primary search-button marketplace-search-button"
              type="submit"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="10.8" cy="10.8" r="6.8" />
                <path d="m16 16 4.5 4.5" />
              </svg>
              Buscar
            </button>
            {appliedSearch && (
              <button
                className="button button-quiet"
                type="button"
                onClick={clearSearch}
              >
                Limpar
              </button>
            )}
          </form>

          {categories.length > 1 && (
            <nav className="category-nav" aria-label="Filtrar por categoria">
              <button
                className={`category-chip ${selectedCategory ? "" : "is-active"}`}
                type="button"
                onClick={clearSearch}
              >
                Todas as peças
              </button>
              {categories.map((category) => (
                <button
                  className={`category-chip ${
                    selectedCategory === category ? "is-active" : ""
                  }`}
                  key={category}
                  type="button"
                  onClick={() => filterByCategory(category)}
                >
                  {category}
                </button>
              ))}
            </nav>
          )}

          {loadError && (
            <div className="feedback feedback-error" role="alert">
              <strong>Não foi possível carregar as peças.</strong>
              <span>{loadError}</span>
            </div>
          )}

          {loading ? (
            <div className="catalog-message" role="status">
              Carregando itens...
            </div>
          ) : parts.length === 0 ? (
            <div className="catalog-message">
              {loadError
                ? "O catálogo ficará disponível quando a conexão for corrigida."
                : appliedSearch
                  ? "Nenhum item corresponde à busca."
                  : "Ainda não há peças cadastradas."}
            </div>
          ) : (
            <div className="catalog-grid">
              {parts.map((part) => {
                const image = getPartImage(part);

                return (
                <article className="catalog-card" key={part.id}>
                  <div className="catalog-card-image">
                    {image ? (
                      <Image
                        alt={`Imagem ilustrativa de ${part.nome}`}
                        className={`part-product-image ${
                          image === "/correia-dentada.svg"
                            ? "part-product-image-full"
                            : ""
                        }`}
                        src={image}
                        width={420}
                        height={420}
                        unoptimized={image.endsWith(".svg")}
                      />
                    ) : (
                      <div className="part-image-placeholder" aria-hidden="true">
                        <svg viewBox="0 0 64 64">
                          <path d="M17 40h30l-3-12a5 5 0 0 0-5-4H25a5 5 0 0 0-5 4l-3 12Z" />
                          <path d="M13 40v8h5m28-8v8h-5M21 34h22M24 47h16" />
                        </svg>
                        <span>AMS AUTOPEÇAS</span>
                      </div>
                    )}
                    <span className="catalog-category">
                      {part.categoria || "Peça automotiva"}
                    </span>
                    <span className="illustrative-label">Imagem ilustrativa</span>
                  </div>
                  <div className="catalog-card-content">
                    <div className="catalog-card-title-row">
                      <h3>{part.nome}</h3>
                      {!authLoading && isAdmin && (
                        <button
                          className="catalog-edit-button"
                          type="button"
                          onClick={() => openEdit(part)}
                          aria-label={`Editar cadastro de ${part.nome}`}
                        >
                          Editar
                        </button>
                      )}
                    </div>
                    <p className="catalog-vehicle">
                      <svg viewBox="0 0 20 20" aria-hidden="true">
                        <path d="M3 12.5 4.5 8a2 2 0 0 1 1.9-1.4h7.2A2 2 0 0 1 15.5 8l1.5 4.5V16h-2v-1.5H5V16H3v-3.5Z" />
                        <path d="M5 11h10M6 13h.01M14 13h.01" />
                      </svg>
                      {[part.marca_veiculo, part.modelo_veiculo]
                        .filter(Boolean)
                        .join(" ") || "Aplicação não informada"}
                      {part.ano_compativel ? ` · ${part.ano_compativel}` : ""}
                    </p>
                    {part.descricao && (
                      <p className="catalog-description">{part.descricao}</p>
                    )}
                    <div className="catalog-card-footer">
                      <span>SKU {part.codigo_sku}</span>
                      <span>Aplicação automotiva</span>
                    </div>
                  </div>
                </article>
                );
              })}
            </div>
          )}

          <div className="pagination">
            <span>
              {total === 0
                ? "Nenhum item"
                : `${page * PAGE_SIZE + 1}–${Math.min(
                    (page + 1) * PAGE_SIZE,
                    total,
                  )} de ${total} itens`}
            </span>
            <div className="pagination-actions">
              <button
                className="button button-secondary pagination-button"
                type="button"
                disabled={page === 0 || loading}
                onClick={() => setPage((current) => current - 1)}
              >
                Anterior
              </button>
              <span className="page-indicator">
                {totalPages === 0 ? 0 : page + 1} / {totalPages}
              </span>
              <button
                className="button button-secondary pagination-button"
                type="button"
                disabled={page + 1 >= totalPages || loading}
                onClick={() => setPage((current) => current + 1)}
              >
                Próxima
              </button>
            </div>
          </div>
        </section>

        <footer className="page-footer">
          AMS Autopeças <span>•</span> Catálogo de peças
        </footer>
      </div>
    </main>
  );
}
