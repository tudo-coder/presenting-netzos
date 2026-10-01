"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "./supabase";
import { makeResourceId, migrateLegacyNetzOSData } from "./netzos-data";
import {
  FiArrowLeft,
  FiBriefcase,
  FiEdit2,
  FiFolder,
  FiPlus,
  FiSearch,
  FiX,
} from "react-icons/fi";

type Organization = {
  id: string;
  name: string;
  createdAt: string;
};

type Workspace = {
  id: string;
  organizationId: string;
  name: string;
  createdAt: string;
};

type OrganizationStore = {
  organizations: Organization[];
  workspaces: Workspace[];
};

type OperationSummary = {
  organizationId: string;
  kind: "task" | "meeting" | "event";
  date: string | null;
  status: string;
};

const EMPTY_STORE: OrganizationStore = { organizations: [], workspaces: [] };

function todayBelem() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Belem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function OrganizationModal({
  initialName = "",
  title,
  description,
  submitLabel,
  onClose,
  onSubmit,
}: {
  initialName?: string;
  title: string;
  description: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (name: string) => void | Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="org-modal-backdrop" onMouseDown={onClose}>
      <section
        className="org-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="org-modal-header">
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose}>
            <FiX aria-hidden="true" />
          </button>
        </header>

        <form
          className="org-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const value = name.trim();
            if (!value || saving) return;
            setSaving(true);
            setError(null);
            try {
              await onSubmit(value);
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Não foi possível salvar no Supabase.",
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          <label>
            <span>Nome</span>
            <input
              autoFocus
              maxLength={150}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Netzcode"
            />
          </label>

          {error && <p className="auth-feedback error">{error}</p>}

          <div className="org-form-actions">
            <button className="org-button secondary" type="button" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button className="org-button primary" type="submit" disabled={saving || !name.trim()}>
              {saving ? "Salvando…" : submitLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function OrganizationsFeature() {
  const [store, setStore] = useState<OrganizationStore>(EMPTY_STORE);
  const [ready, setReady] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "workspaces">("overview");
  const [newOrganizationOpen, setNewOrganizationOpen] = useState(false);
  const [editingOrganization, setEditingOrganization] = useState<Organization | null>(null);
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [operationSummaries, setOperationSummaries] = useState<OperationSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = await getSupabase();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) throw userError;
    if (!user) {
      setStore(EMPTY_STORE);
      setOperationSummaries([]);
      setReady(true);
      return;
    }

    await migrateLegacyNetzOSData(supabase, user.id);

    const [organizationResult, workspaceResult, operationResult] = await Promise.all([
      supabase
        .from("organizations")
        .select("id,name,created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("workspaces")
        .select("id,organization_id,name,created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("operational_items")
        .select("organization_id,kind,date,status"),
    ]);

    const firstError =
      organizationResult.error || workspaceResult.error || operationResult.error;
    if (firstError) throw firstError;

    setStore({
      organizations: (organizationResult.data || []).map((organization) => ({
        id: organization.id,
        name: organization.name,
        createdAt: organization.created_at,
      })),
      workspaces: (workspaceResult.data || []).map((workspace) => ({
        id: workspace.id,
        organizationId: workspace.organization_id,
        name: workspace.name,
        createdAt: workspace.created_at,
      })),
    });

    setOperationSummaries(
      (operationResult.data || []).map((operation) => ({
        organizationId: operation.organization_id,
        kind: operation.kind,
        date: operation.date,
        status: operation.status,
      })),
    );
    setLoadError(null);
    setReady(true);
  }, []);

  useEffect(() => {
    let active = true;

    void refresh().catch((cause) => {
      if (!active) return;
      setLoadError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar suas organizações.",
      );
      setReady(true);
    });

    return () => {
      active = false;
    };
  }, [refresh]);

  const selectedOrganization = useMemo(
    () => store.organizations.find((organization) => organization.id === selectedId) || null,
    [selectedId, store.organizations]
  );

  const filteredOrganizations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return store.organizations;
    return store.organizations.filter((organization) =>
      organization.name.toLocaleLowerCase("pt-BR").includes(query)
    );
  }, [search, store.organizations]);

  const selectedWorkspaces = useMemo(
    () => store.workspaces.filter((workspace) => workspace.organizationId === selectedId),
    [selectedId, store.workspaces]
  );

  const createOrganization = async (name: string) => {
    const supabase = await getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sua sessão expirou.");

    const id = makeResourceId("org");
    const { data, error } = await supabase
      .from("organizations")
      .insert({
        id,
        owner_id: user.id,
        name,
        updated_at: new Date().toISOString(),
      })
      .select("id,name,created_at")
      .single();

    if (error) throw error;

    const organization: Organization = {
      id: data.id,
      name: data.name,
      createdAt: data.created_at,
    };

    setStore((current) => ({
      ...current,
      organizations: [organization, ...current.organizations],
    }));
    setNewOrganizationOpen(false);
    setSelectedId(organization.id);
    setTab("overview");
  };

  const updateOrganization = async (name: string) => {
    if (!editingOrganization) return;

    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("organizations")
      .update({
        name,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editingOrganization.id)
      .select("id,name,created_at")
      .single();

    if (error) throw error;

    setStore((current) => ({
      ...current,
      organizations: current.organizations.map((organization) =>
        organization.id === data.id
          ? { id: data.id, name: data.name, createdAt: data.created_at }
          : organization
      ),
    }));
    setEditingOrganization(null);
  };

  const createWorkspace = async (name: string) => {
    if (!selectedOrganization) return;

    const supabase = await getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sua sessão expirou.");

    const { data, error } = await supabase
      .from("workspaces")
      .insert({
        id: makeResourceId("workspace"),
        owner_id: user.id,
        organization_id: selectedOrganization.id,
        name,
        updated_at: new Date().toISOString(),
      })
      .select("id,organization_id,name,created_at")
      .single();

    if (error) throw error;

    const workspace: Workspace = {
      id: data.id,
      organizationId: data.organization_id,
      name: data.name,
      createdAt: data.created_at,
    };

    setStore((current) => ({
      ...current,
      workspaces: [workspace, ...current.workspaces],
    }));
    setNewWorkspaceOpen(false);
    setTab("workspaces");
  };

  if (!ready) {
    return (
      <section className="org-feature org-loading" aria-label="Carregando organizações">
        <div className="org-loading-line" />
        <div className="org-loading-grid">
          <div />
          <div />
          <div />
        </div>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="org-feature">
        <div className="org-empty compact">
          <FiBriefcase aria-hidden="true" />
          <h3>Não foi possível carregar suas organizações</h3>
          <p>{loadError}</p>
          <button
            className="org-button secondary"
            type="button"
            onClick={() => {
              setReady(false);
              void refresh().catch((cause) => {
                setLoadError(
                  cause instanceof Error
                    ? cause.message
                    : "Não foi possível carregar suas organizações.",
                );
                setReady(true);
              });
            }}
          >
            Tentar novamente
          </button>
        </div>
      </section>
    );
  }

  if (selectedOrganization) {
    return (
      <section className="org-feature">
        <header className="org-detail-header">
          <div className="org-detail-heading">
            <button
              className="org-icon-button"
              type="button"
              aria-label="Voltar para organizações"
              onClick={() => {
                setSelectedId(null);
                setTab("overview");
              }}
            >
              <FiArrowLeft aria-hidden="true" />
            </button>
            <div>
              <span className="org-eyebrow">Organização</span>
              <h1>{selectedOrganization.name}</h1>
            </div>
          </div>

          <button
            className="org-button secondary"
            type="button"
            onClick={() => setEditingOrganization(selectedOrganization)}
          >
            <FiEdit2 aria-hidden="true" />
            Editar
          </button>
        </header>

        <nav className="org-tabs" aria-label="Navegação da organização">
          <button
            className={tab === "overview" ? "active" : ""}
            type="button"
            onClick={() => setTab("overview")}
          >
            Visão geral
          </button>
          <button
            className={tab === "workspaces" ? "active" : ""}
            type="button"
            onClick={() => setTab("workspaces")}
          >
            Workspaces
            <span>{selectedWorkspaces.length}</span>
          </button>
        </nav>

        {tab === "overview" ? (
          <div className="org-overview">
            <section className="org-overview-hero">
              <div>
                <span className="org-eyebrow">Visão geral</span>
                <h2>Sua organização em movimento</h2>
                <p>
                  Workspaces, tarefas, reuniões e agenda vão compartilhar este mesmo contexto.
                </p>
              </div>

              <button
                className="org-button primary"
                type="button"
                onClick={() => setNewWorkspaceOpen(true)}
              >
                <FiPlus aria-hidden="true" />
                Novo workspace
              </button>
            </section>

            <div className="org-stats">
              <article>
                <strong>{selectedWorkspaces.length}</strong>
                <span>Workspaces</span>
              </article>
              <article>
                <strong>
                  {operationSummaries.filter(
                    (item) =>
                      item.organizationId === selectedOrganization.id &&
                      item.kind === "task" &&
                      item.date === todayBelem() &&
                      !["done", "cancelled"].includes(item.status),
                  ).length}
                </strong>
                <span>Tarefas hoje</span>
              </article>
              <article>
                <strong>
                  {operationSummaries.filter(
                    (item) =>
                      item.organizationId === selectedOrganization.id &&
                      item.kind === "meeting" &&
                      item.date === todayBelem() &&
                      item.status !== "cancelled",
                  ).length}
                </strong>
                <span>Reuniões hoje</span>
              </article>
            </div>

            <section className="org-section">
              <div className="org-section-heading">
                <div>
                  <span className="org-eyebrow">Estrutura</span>
                  <h2>Workspaces</h2>
                </div>
                {selectedWorkspaces.length > 0 && (
                  <button className="org-text-button" type="button" onClick={() => setTab("workspaces")}>
                    Ver todos
                  </button>
                )}
              </div>

              {selectedWorkspaces.length === 0 ? (
                <div className="org-empty compact">
                  <FiFolder aria-hidden="true" />
                  <h3>Nenhum workspace ainda</h3>
                  <p>Crie o primeiro espaço de trabalho desta organização.</p>
                  <button className="org-button secondary" type="button" onClick={() => setNewWorkspaceOpen(true)}>
                    <FiPlus aria-hidden="true" />
                    Criar workspace
                  </button>
                </div>
              ) : (
                <div className="workspace-grid">
                  {selectedWorkspaces.slice(0, 4).map((workspace) => (
                    <article className="workspace-card" key={workspace.id}>
                      <span className="workspace-icon">
                        <FiFolder aria-hidden="true" />
                      </span>
                      <strong>{workspace.name}</strong>
                      <small>Workspace</small>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : (
          <section className="org-section org-workspaces-view">
            <div className="org-section-heading">
              <div>
                <span className="org-eyebrow">Organização</span>
                <h2>Workspaces</h2>
                <p>Os workspaces mantêm times e operações separados dentro da mesma organização.</p>
              </div>
              <button className="org-button primary" type="button" onClick={() => setNewWorkspaceOpen(true)}>
                <FiPlus aria-hidden="true" />
                Novo workspace
              </button>
            </div>

            {selectedWorkspaces.length === 0 ? (
              <div className="org-empty">
                <FiFolder aria-hidden="true" />
                <h3>Crie o primeiro workspace</h3>
                <p>Use workspaces para organizar áreas, times ou operações da organização.</p>
                <button className="org-button primary" type="button" onClick={() => setNewWorkspaceOpen(true)}>
                  <FiPlus aria-hidden="true" />
                  Novo workspace
                </button>
              </div>
            ) : (
              <div className="workspace-grid">
                {selectedWorkspaces.map((workspace) => (
                  <article className="workspace-card" key={workspace.id}>
                    <span className="workspace-icon">
                      <FiFolder aria-hidden="true" />
                    </span>
                    <strong>{workspace.name}</strong>
                    <small>Workspace</small>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {editingOrganization && (
          <OrganizationModal
            initialName={editingOrganization.name}
            title="Editar organização"
            description="Atualize o nome sem alterar o contexto dos workspaces vinculados."
            submitLabel="Salvar"
            onClose={() => setEditingOrganization(null)}
            onSubmit={updateOrganization}
          />
        )}

        {newWorkspaceOpen && (
          <OrganizationModal
            title="Novo workspace"
            description={"Este workspace ficará dentro de " + selectedOrganization.name + "."}
            submitLabel="Criar workspace"
            onClose={() => setNewWorkspaceOpen(false)}
            onSubmit={createWorkspace}
          />
        )}
      </section>
    );
  }

  return (
    <section className="org-feature">
      <header className="org-list-header">
        <div>
          <span className="org-eyebrow">Estrutura</span>
          <h1>Organizações</h1>
          <p>Reúna seus workspaces e mantenha cada operação no contexto correto.</p>
        </div>
        <button className="org-button primary" type="button" onClick={() => setNewOrganizationOpen(true)}>
          <FiPlus aria-hidden="true" />
          Nova organização
        </button>
      </header>

      <div className="org-toolbar">
        <label className="org-search">
          <FiSearch aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar pelo nome…"
            aria-label="Buscar organizações pelo nome"
          />
        </label>
      </div>

      {store.organizations.length === 0 ? (
        <div className="org-empty">
          <FiBriefcase aria-hidden="true" />
          <h3>Crie sua primeira organização</h3>
          <p>Crie uma organização para reunir seus workspaces.</p>
          <button className="org-button primary" type="button" onClick={() => setNewOrganizationOpen(true)}>
            <FiPlus aria-hidden="true" />
            Nova organização
          </button>
        </div>
      ) : filteredOrganizations.length === 0 ? (
        <div className="org-empty compact">
          <FiSearch aria-hidden="true" />
          <h3>Nenhuma organização encontrada</h3>
          <p>Tente outro nome na busca.</p>
        </div>
      ) : (
        <div className="organization-grid">
          {filteredOrganizations.map((organization) => {
            const workspaceCount = store.workspaces.filter(
              (workspace) => workspace.organizationId === organization.id
            ).length;

            return (
              <article className="organization-card" key={organization.id}>
                <div className="organization-card-top">
                  <span className="organization-icon">
                    <FiBriefcase aria-hidden="true" />
                  </span>
                  <button
                    className="org-icon-button subtle"
                    type="button"
                    aria-label={"Editar " + organization.name}
                    onClick={() => setEditingOrganization(organization)}
                  >
                    <FiEdit2 aria-hidden="true" />
                  </button>
                </div>

                <div className="organization-card-copy">
                  <h2>{organization.name}</h2>
                  <p>
                    {workspaceCount === 1
                      ? "1 workspace"
                      : workspaceCount + " workspaces"}
                  </p>
                </div>

                <button
                  className="organization-open"
                  type="button"
                  onClick={() => {
                    setSelectedId(organization.id);
                    setTab("overview");
                  }}
                >
                  Abrir organização
                  <span aria-hidden="true">→</span>
                </button>
              </article>
            );
          })}
        </div>
      )}

      {newOrganizationOpen && (
        <OrganizationModal
          title="Nova organização"
          description="A organização será o contexto principal dos seus workspaces, tarefas e agenda."
          submitLabel="Criar organização"
          onClose={() => setNewOrganizationOpen(false)}
          onSubmit={createOrganization}
        />
      )}

      {editingOrganization && (
        <OrganizationModal
          initialName={editingOrganization.name}
          title="Editar organização"
          description="Atualize o nome sem alterar os workspaces vinculados."
          submitLabel="Salvar"
          onClose={() => setEditingOrganization(null)}
          onSubmit={updateOrganization}
        />
      )}
    </section>
  );
}
