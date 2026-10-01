"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
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

const STORAGE_KEY = "netzos.organizations.v1";
const EMPTY_STORE: OrganizationStore = { organizations: [], workspaces: [] };

function makeId(prefix: string) {
  const suffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix + "_" + suffix;
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
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);

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
          onSubmit={(event) => {
            event.preventDefault();
            const value = name.trim();
            if (!value) return;
            onSubmit(value);
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

          <div className="org-form-actions">
            <button className="org-button secondary" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button className="org-button primary" type="submit" disabled={!name.trim()}>
              {submitLabel}
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
  const [storageKey, setStorageKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;

      const userId = data.user?.id;
      if (!userId) {
        setReady(true);
        return;
      }

      const userStorageKey = STORAGE_KEY + ":" + userId;
      setStorageKey(userStorageKey);

      try {
        const saved =
          localStorage.getItem(userStorageKey) || localStorage.getItem(STORAGE_KEY);

        if (saved) {
          const parsed = JSON.parse(saved) as Partial<OrganizationStore>;
          setStore({
            organizations: Array.isArray(parsed.organizations) ? parsed.organizations : [],
            workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : [],
          });

          if (!localStorage.getItem(userStorageKey)) {
            localStorage.setItem(userStorageKey, saved);
          }
        }
      } catch {
        setStore(EMPTY_STORE);
      } finally {
        setReady(true);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready || !storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify(store));
  }, [ready, storageKey, store]);

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

  const createOrganization = (name: string) => {
    const organization: Organization = {
      id: makeId("org"),
      name,
      createdAt: new Date().toISOString(),
    };

    setStore((current) => ({
      ...current,
      organizations: [organization, ...current.organizations],
    }));
    setNewOrganizationOpen(false);
    setSelectedId(organization.id);
    setTab("overview");
  };

  const updateOrganization = (name: string) => {
    if (!editingOrganization) return;
    setStore((current) => ({
      ...current,
      organizations: current.organizations.map((organization) =>
        organization.id === editingOrganization.id ? { ...organization, name } : organization
      ),
    }));
    setEditingOrganization(null);
  };

  const createWorkspace = (name: string) => {
    if (!selectedOrganization) return;
    const workspace: Workspace = {
      id: makeId("workspace"),
      organizationId: selectedOrganization.id,
      name,
      createdAt: new Date().toISOString(),
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
                <strong>—</strong>
                <span>Tarefas hoje</span>
              </article>
              <article>
                <strong>—</strong>
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
