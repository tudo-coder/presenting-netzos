"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  FiArrowLeft,
  FiBriefcase,
  FiCalendar,
  FiCheckSquare,
  FiEdit2,
  FiFolder,
  FiGrid,
  FiLayout,
  FiPlus,
  FiSearch,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { getSupabase } from "./supabase";
import { makeResourceId } from "./netzos-data";
import {
  formatDate,
  type Operation,
  type OperationKind,
  useOperationsStore,
} from "./operations-data";
import { OperationDialog } from "./operation-dialog";
import { OperationDetail } from "./operation-detail";
import {
  ACCESS_ROLE_LABELS,
  canManage,
  resourceRole,
  useReferenceData,
} from "./reference-data";

type OrgTab = "overview" | "workspaces" | "tasks" | "meetings" | "agenda";
type WorkspaceTab = "overview" | "tasks" | "meetings" | "agenda";

function SimpleModal({
  title,
  description,
  initialValue = "",
  submitLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  description: string;
  initialValue?: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(name.trim());
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível salvar.",
      );
    } finally {
      setBusy(false);
    }
  };

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
            <FiX />
          </button>
        </header>
        <form className="org-form" onSubmit={submit}>
          <label>
            <span>Nome</span>
            <input
              autoFocus
              value={name}
              maxLength={150}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {error && <p className="auth-feedback error">{error}</p>}
          <div className="org-form-actions">
            <button
              className="org-button secondary"
              type="button"
              onClick={onClose}
              disabled={busy}
            >
              Cancelar
            </button>
            <button
              className="org-button primary"
              type="submit"
              disabled={busy || !name.trim()}
            >
              {busy ? "Salvando…" : submitLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function OperationScopeList({
  mode,
  operations,
  onOpen,
}: {
  mode: "tasks" | "meetings" | "agenda";
  operations: Operation[];
  onOpen: (operation: Operation) => void;
}) {
  const filtered = operations
    .filter((operation) => {
      if (mode === "tasks") return operation.kind === "task";
      if (mode === "meetings") return operation.kind === "meeting";
      return !!operation.date;
    })
    .sort((a, b) =>
      ((a.date || "9999-12-31") + (a.time || "")).localeCompare(
        (b.date || "9999-12-31") + (b.time || ""),
      ),
    );

  if (!filtered.length) {
    return (
      <div className="org-empty compact">
        {mode === "tasks" ? (
          <FiCheckSquare />
        ) : mode === "meetings" ? (
          <FiUsers />
        ) : (
          <FiCalendar />
        )}
        <h3>
          {mode === "tasks"
            ? "Nenhuma tarefa"
            : mode === "meetings"
              ? "Nenhuma reunião"
              : "Nada na agenda"}
        </h3>
        <p>Crie o primeiro registro neste contexto.</p>
      </div>
    );
  }

  return (
    <div className="org-operation-list">
      {filtered.map((operation) => (
        <button type="button" key={operation.id} onClick={() => onOpen(operation)}>
          <span
            className={
              "org-operation-kind " +
              (operation.kind === "task"
                ? "task"
                : operation.kind === "meeting"
                  ? "meeting"
                  : "event")
            }
          >
            {operation.kind === "task" ? (
              <FiCheckSquare />
            ) : operation.kind === "meeting" ? (
              <FiUsers />
            ) : (
              <FiCalendar />
            )}
          </span>
          <div>
            <strong>{operation.title}</strong>
            <small>
              {operation.date ? formatDate(operation.date) : "Sem data"}
              {operation.time ? " · " + operation.time : ""} ·{" "}
              {operation.status}
            </small>
          </div>
          {operation.kind === "task" && (
            <span className={"priority-pill " + operation.priority}>
              {operation.priority === "urgent"
                ? "Urgente"
                : operation.priority === "important"
                  ? "Importante"
                  : "Normal"}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function OrganizationsFeature({
  onOpenData,
  onOpenSystems,
}: {
  onOpenData?: (workspaceId: string) => void;
  onOpenSystems?: (workspaceId: string) => void;
}) {
  const reference = useReferenceData();
  const operational = useOperationsStore();
  const { data, userId, ready, error, refresh } = reference;
  const [search, setSearch] = useState("");
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [orgTab, setOrgTab] = useState<OrgTab>("overview");
  const [workspaceTab, setWorkspaceTab] =
    useState<WorkspaceTab>("overview");
  const [newOrganizationOpen, setNewOrganizationOpen] = useState(false);
  const [editOrganizationOpen, setEditOrganizationOpen] = useState(false);
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [creatingKind, setCreatingKind] = useState<OperationKind | null>(null);
  const [editingOperation, setEditingOperation] = useState<Operation | null>(null);

  const organization =
    data.organizations.find((item) => item.id === selectedOrganizationId) || null;
  const workspace =
    data.workspaces.find((item) => item.id === selectedWorkspaceId) || null;

  const filteredOrganizations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return data.organizations.filter(
      (item) =>
        !query || item.name.toLocaleLowerCase("pt-BR").includes(query),
    );
  }, [data.organizations, search]);

  const organizationWorkspaces = data.workspaces.filter(
    (item) => item.organizationId === organization?.id,
  );

  const scopeOperations = operational.operations.filter(
    (item) =>
      item.organizationId === organization?.id &&
      (!workspace || item.workspaceId === workspace.id),
  );

  const role = organization
    ? resourceRole(data, userId, "organization", organization.id)
    : null;

  const createOrganization = async (name: string) => {
    const supabase = await getSupabase();
    const { error: insertError } = await supabase.from("organizations").insert({
      id: makeResourceId("org"),
      owner_id: userId,
      name,
      updated_at: new Date().toISOString(),
    });
    if (insertError) throw insertError;
    await refresh();
  };

  const updateOrganization = async (name: string) => {
    if (!organization) return;
    const supabase = await getSupabase();
    const { error: updateError } = await supabase
      .from("organizations")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", organization.id);
    if (updateError) throw updateError;
    await Promise.all([refresh(), operational.refresh()]);
  };

  const createWorkspace = async (name: string) => {
    if (!organization) return;
    const supabase = await getSupabase();
    const id = makeResourceId("workspace");
    const { error: insertError } = await supabase.from("workspaces").insert({
      id,
      owner_id: userId,
      organization_id: organization.id,
      name,
      description: "",
      favorite: false,
      updated_at: new Date().toISOString(),
    });
    if (insertError) throw insertError;
    await Promise.all([refresh(), operational.refresh()]);
    setSelectedWorkspaceId(id);
    setWorkspaceTab("overview");
  };

  if (!ready || !operational.ready) {
    return (
      <section className="org-feature org-loading">
        <div className="org-loading-line" />
        <div className="org-loading-grid"><div /><div /><div /></div>
      </section>
    );
  }

  if (error || operational.error) {
    return (
      <section className="org-feature">
        <div className="org-empty">
          <FiBriefcase />
          <h3>Não foi possível carregar organizações</h3>
          <p>{error || operational.error}</p>
        </div>
      </section>
    );
  }

  if (organization && workspace) {
    const workspaceRole = resourceRole(data, userId, "workspace", workspace.id);
    const dataCount = data.tables.filter(
      (item) => item.workspaceId === workspace.id,
    ).length;
    const systemsCount = data.systems.filter(
      (item) => item.workspaceId === workspace.id,
    ).length;

    return (
      <section className="org-feature workspace-detail-feature">
        <header className="org-detail-header">
          <div className="org-detail-heading">
            <button
              className="org-icon-button"
              type="button"
              onClick={() => setSelectedWorkspaceId("")}
              aria-label="Voltar para organização"
            >
              <FiArrowLeft />
            </button>
            <div>
              <span className="org-eyebrow">{organization.name}</span>
              <h1>{workspace.name}</h1>
              <p>{workspace.description || "Workspace da organização."}</p>
            </div>
          </div>
          <span className="ref-role">
            {workspaceRole ? ACCESS_ROLE_LABELS[workspaceRole] : "Acesso"}
          </span>
        </header>

        <nav className="org-tabs">
          {[
            ["overview", "Visão geral"],
            ["tasks", "Tarefas"],
            ["meetings", "Reuniões"],
            ["agenda", "Agenda"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={workspaceTab === value ? "active" : ""}
              onClick={() => setWorkspaceTab(value as WorkspaceTab)}
            >
              {label}
            </button>
          ))}
        </nav>

        {workspaceTab === "overview" ? (
          <div className="org-overview">
            <section className="org-overview-hero">
              <div>
                <span className="org-eyebrow">Workspace</span>
                <h2>Dados, sistemas e operação no mesmo contexto</h2>
                <p>
                  Os registros operacionais continuam sendo as mesmas entidades
                  vistas em Minhas tarefas e Minha Agenda.
                </p>
              </div>
            </section>

            <div className="org-stats">
              <article><strong>{dataCount}</strong><span>Tabelas</span></article>
              <article><strong>{systemsCount}</strong><span>Sistemas</span></article>
              <article>
                <strong>
                  {scopeOperations.filter(
                    (item) =>
                      item.kind === "task" &&
                      !["done", "cancelled"].includes(item.status),
                  ).length}
                </strong>
                <span>Tarefas abertas</span>
              </article>
            </div>

            <div className="workspace-module-grid">
              <button type="button" onClick={() => onOpenData?.(workspace.id)}>
                <FiGrid />
                <strong>Dados</strong>
                <span>{dataCount} tabela{dataCount === 1 ? "" : "s"}</span>
              </button>
              <button type="button" onClick={() => onOpenSystems?.(workspace.id)}>
                <FiLayout />
                <strong>Sistemas</strong>
                <span>{systemsCount} sistema{systemsCount === 1 ? "" : "s"}</span>
              </button>
              <button type="button" onClick={() => setWorkspaceTab("tasks")}>
                <FiCheckSquare />
                <strong>Tarefas</strong>
                <span>Operação do workspace</span>
              </button>
              <button type="button" onClick={() => setWorkspaceTab("agenda")}>
                <FiCalendar />
                <strong>Agenda</strong>
                <span>Reuniões e prazos</span>
              </button>
            </div>
          </div>
        ) : (
          <section className="org-section org-scoped-operations">
            <div className="org-section-heading">
              <div>
                <span className="org-eyebrow">{workspace.name}</span>
                <h2>
                  {workspaceTab === "tasks"
                    ? "Tarefas"
                    : workspaceTab === "meetings"
                      ? "Reuniões"
                      : "Agenda"}
                </h2>
              </div>
              <div className="ref-heading-actions">
                {workspaceTab === "tasks" && (
                  <button
                    className="org-button primary"
                    type="button"
                    onClick={() => setCreatingKind("task")}
                  >
                    <FiPlus /> Nova tarefa
                  </button>
                )}
                {workspaceTab === "meetings" && (
                  <button
                    className="org-button primary"
                    type="button"
                    onClick={() => setCreatingKind("meeting")}
                  >
                    <FiPlus /> Nova reunião
                  </button>
                )}
                {workspaceTab === "agenda" && (
                  <>
                    <button
                      className="org-button secondary"
                      type="button"
                      onClick={() => setCreatingKind("task")}
                    >
                      Tarefa
                    </button>
                    <button
                      className="org-button secondary"
                      type="button"
                      onClick={() => setCreatingKind("meeting")}
                    >
                      Reunião
                    </button>
                    <button
                      className="org-button primary"
                      type="button"
                      onClick={() => setCreatingKind("event")}
                    >
                      Compromisso
                    </button>
                  </>
                )}
              </div>
            </div>

            <OperationScopeList
              mode={workspaceTab}
              operations={scopeOperations}
              onOpen={setEditingOperation}
            />
          </section>
        )}

        {creatingKind && (
          <OperationDialog
            kind={creatingKind}
            organizations={operational.organizations}
            workspaces={operational.workspaces}
            initialOrganizationId={organization.id}
            initialWorkspaceId={workspace.id}
            lockContextOnCreate
            onClose={() => setCreatingKind(null)}
            onSave={async (item) => {
              await operational.saveOperation(item);
              setCreatingKind(null);
            }}
          />
        )}

        {editingOperation && (
          <OperationDetail
            operation={editingOperation}
            operations={operational.operations}
            onClose={() => setEditingOperation(null)}
            onSave={operational.saveOperation}
            onRefresh={operational.refresh}
          />
        )}
      </section>
    );
  }

  if (organization) {
    const organizationOperations = operational.operations.filter(
      (item) => item.organizationId === organization.id,
    );

    return (
      <section className="org-feature">
        <header className="org-detail-header">
          <div className="org-detail-heading">
            <button
              className="org-icon-button"
              type="button"
              aria-label="Voltar para organizações"
              onClick={() => {
                setSelectedOrganizationId("");
                setOrgTab("overview");
              }}
            >
              <FiArrowLeft />
            </button>
            <div>
              <span className="org-eyebrow">Organização</span>
              <h1>{organization.name}</h1>
            </div>
          </div>

          <div className="ref-heading-actions">
            <span className="ref-role">
              {role ? ACCESS_ROLE_LABELS[role] : "Acesso"}
            </span>
            {canManage(role) && (
              <button
                className="org-button secondary"
                type="button"
                onClick={() => setEditOrganizationOpen(true)}
              >
                <FiEdit2 />
                Editar
              </button>
            )}
          </div>
        </header>

        <nav className="org-tabs">
          {[
            ["overview", "Visão geral"],
            ["workspaces", "Workspaces"],
            ["tasks", "Tarefas"],
            ["meetings", "Reuniões"],
            ["agenda", "Agenda"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={orgTab === value ? "active" : ""}
              onClick={() => setOrgTab(value as OrgTab)}
            >
              {label}
              {value === "workspaces" && <span>{organizationWorkspaces.length}</span>}
            </button>
          ))}
        </nav>

        {orgTab === "overview" ? (
          <div className="org-overview">
            <section className="org-overview-hero">
              <div>
                <span className="org-eyebrow">Visão geral</span>
                <h2>Sua organização em movimento</h2>
                <p>
                  Workspaces, dados, sistemas, tarefas, reuniões e agenda
                  compartilham este mesmo contexto.
                </p>
              </div>
              {canManage(role) && (
                <button
                  className="org-button primary"
                  type="button"
                  onClick={() => setNewWorkspaceOpen(true)}
                >
                  <FiPlus />
                  Novo workspace
                </button>
              )}
            </section>

            <div className="org-stats">
              <article>
                <strong>{organizationWorkspaces.length}</strong>
                <span>Workspaces</span>
              </article>
              <article>
                <strong>
                  {
                    organizationOperations.filter(
                      (item) =>
                        item.kind === "task" &&
                        item.date === new Date().toISOString().slice(0, 10) &&
                        !["done", "cancelled"].includes(item.status),
                    ).length
                  }
                </strong>
                <span>Tarefas hoje</span>
              </article>
              <article>
                <strong>
                  {
                    organizationOperations.filter(
                      (item) =>
                        item.kind === "meeting" &&
                        item.date === new Date().toISOString().slice(0, 10) &&
                        item.status !== "cancelled",
                    ).length
                  }
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
                <button
                  className="org-text-button"
                  type="button"
                  onClick={() => setOrgTab("workspaces")}
                >
                  Ver todos
                </button>
              </div>

              <div className="workspace-grid">
                {organizationWorkspaces.slice(0, 4).map((item) => (
                  <button
                    className="workspace-card"
                    type="button"
                    key={item.id}
                    onClick={() => setSelectedWorkspaceId(item.id)}
                  >
                    <span className="workspace-icon"><FiFolder /></span>
                    <strong>{item.name}</strong>
                    <small>
                      {data.tables.filter((table) => table.workspaceId === item.id).length} tabelas ·{" "}
                      {data.systems.filter((system) => system.workspaceId === item.id).length} sistemas
                    </small>
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : orgTab === "workspaces" ? (
          <section className="org-section org-workspaces-view">
            <div className="org-section-heading">
              <div>
                <span className="org-eyebrow">Organização</span>
                <h2>Workspaces</h2>
              </div>
              {canManage(role) && (
                <button
                  className="org-button primary"
                  type="button"
                  onClick={() => setNewWorkspaceOpen(true)}
                >
                  <FiPlus />
                  Novo workspace
                </button>
              )}
            </div>

            <div className="workspace-grid">
              {organizationWorkspaces.map((item) => (
                <button
                  className="workspace-card"
                  type="button"
                  key={item.id}
                  onClick={() => setSelectedWorkspaceId(item.id)}
                >
                  <span className="workspace-icon"><FiFolder /></span>
                  <strong>{item.name}</strong>
                  <small>
                    {data.tables.filter((table) => table.workspaceId === item.id).length} dados ·{" "}
                    {data.systems.filter((system) => system.workspaceId === item.id).length} sistemas
                  </small>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="org-section org-scoped-operations">
            <div className="org-section-heading">
              <div>
                <span className="org-eyebrow">{organization.name}</span>
                <h2>
                  {orgTab === "tasks"
                    ? "Tarefas"
                    : orgTab === "meetings"
                      ? "Reuniões"
                      : "Agenda"}
                </h2>
              </div>
              <div className="ref-heading-actions">
                {orgTab === "tasks" && (
                  <button
                    className="org-button primary"
                    type="button"
                    onClick={() => setCreatingKind("task")}
                  >
                    <FiPlus /> Nova tarefa
                  </button>
                )}
                {orgTab === "meetings" && (
                  <button
                    className="org-button primary"
                    type="button"
                    onClick={() => setCreatingKind("meeting")}
                  >
                    <FiPlus /> Nova reunião
                  </button>
                )}
                {orgTab === "agenda" && (
                  <>
                    <button
                      className="org-button secondary"
                      type="button"
                      onClick={() => setCreatingKind("task")}
                    >
                      Tarefa
                    </button>
                    <button
                      className="org-button secondary"
                      type="button"
                      onClick={() => setCreatingKind("meeting")}
                    >
                      Reunião
                    </button>
                    <button
                      className="org-button primary"
                      type="button"
                      onClick={() => setCreatingKind("event")}
                    >
                      Compromisso
                    </button>
                  </>
                )}
              </div>
            </div>

            <OperationScopeList
              mode={orgTab}
              operations={organizationOperations}
              onOpen={setEditingOperation}
            />
          </section>
        )}

        {newWorkspaceOpen && (
          <SimpleModal
            title="Novo workspace"
            description={"Este workspace ficará dentro de " + organization.name + "."}
            submitLabel="Criar workspace"
            onClose={() => setNewWorkspaceOpen(false)}
            onSubmit={createWorkspace}
          />
        )}

        {editOrganizationOpen && (
          <SimpleModal
            title="Editar organização"
            description="Atualize o nome sem alterar os recursos vinculados."
            initialValue={organization.name}
            submitLabel="Salvar"
            onClose={() => setEditOrganizationOpen(false)}
            onSubmit={updateOrganization}
          />
        )}

        {creatingKind && (
          <OperationDialog
            kind={creatingKind}
            organizations={operational.organizations}
            workspaces={operational.workspaces}
            initialOrganizationId={organization.id}
            initialWorkspaceId={null}
            lockContextOnCreate
            onClose={() => setCreatingKind(null)}
            onSave={async (item) => {
              await operational.saveOperation(item);
              setCreatingKind(null);
            }}
          />
        )}

        {editingOperation && (
          <OperationDetail
            operation={editingOperation}
            operations={operational.operations}
            onClose={() => setEditingOperation(null)}
            onSave={operational.saveOperation}
            onRefresh={operational.refresh}
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
          <p>
            O contexto raiz para workspaces, dados, sistemas, tarefas e agenda.
          </p>
        </div>
        <button
          className="org-button primary"
          type="button"
          onClick={() => setNewOrganizationOpen(true)}
        >
          <FiPlus />
          Nova organização
        </button>
      </header>

      <div className="org-toolbar">
        <label className="org-search">
          <FiSearch />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar pelo nome…"
          />
        </label>
      </div>

      {filteredOrganizations.length ? (
        <div className="organization-grid">
          {filteredOrganizations.map((item) => {
            const itemRole = resourceRole(data, userId, "organization", item.id);
            const workspaceCount = data.workspaces.filter(
              (workspaceItem) => workspaceItem.organizationId === item.id,
            ).length;

            return (
              <article className="organization-card" key={item.id}>
                <div className="organization-card-top">
                  <span className="organization-icon"><FiBriefcase /></span>
                  <span className="ref-role small">
                    {itemRole ? ACCESS_ROLE_LABELS[itemRole] : "Acesso"}
                  </span>
                </div>
                <div className="organization-card-copy">
                  <h2>{item.name}</h2>
                  <p>
                    {workspaceCount} workspace{workspaceCount === 1 ? "" : "s"}
                  </p>
                </div>
                <button
                  className="organization-open"
                  type="button"
                  onClick={() => {
                    setSelectedOrganizationId(item.id);
                    setOrgTab("overview");
                  }}
                >
                  Abrir organização <span>→</span>
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="org-empty">
          <FiBriefcase />
          <h3>{search ? "Nenhuma organização encontrada" : "Crie sua primeira organização"}</h3>
          <p>
            {search
              ? "Tente outro termo."
              : "A organização será o contexto principal do seu trabalho."}
          </p>
        </div>
      )}

      {newOrganizationOpen && (
        <SimpleModal
          title="Nova organização"
          description="Organizações reúnem workspaces, dados, sistemas e operação."
          submitLabel="Criar organização"
          onClose={() => setNewOrganizationOpen(false)}
          onSubmit={createOrganization}
        />
      )}
    </section>
  );
}
