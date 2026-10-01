"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  FiArrowDown,
  FiArrowUp,
  FiDatabase,
  FiEdit2,
  FiExternalLink,
  FiFileText,
  FiGrid,
  FiLayout,
  FiPlay,
  FiPlus,
  FiSave,
  FiSettings,
  FiTrash2,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { DashboardRenderer } from "./dashboard-feature";
import { getSupabase } from "./supabase";
import { makeResourceId } from "./netzos-data";
import {
  ACCESS_ROLE_LABELS,
  canDesign,
  canManage,
  logAudit,
  resourceRole,
  type SystemBlock,
  type SystemDefinition,
  type SystemPage,
  type SystemResource,
  useReferenceData,
} from "./reference-data";

function initialDefinition(tableIds: string[], names: Record<string, string>): SystemDefinition {
  const pages: SystemPage[] = tableIds.slice(0, 20).map((tableId) => ({
    id: makeResourceId("page"),
    name: names[tableId] || "Página",
    blocks: [
      {
        id: makeResourceId("block"),
        type: "table",
        source: tableId,
        title: names[tableId] || "Tabela",
        width: 12,
      },
      {
        id: makeResourceId("block"),
        type: "form",
        source: tableId,
        title: "Novo registro",
        width: 12,
      },
    ],
  }));

  return {
    tables: tableIds,
    homePage: pages[0]?.id,
    pages,
  };
}

function SystemRuntime({
  system,
  onBuild,
  onOpenData,
}: {
  system: SystemResource;
  onBuild: () => void;
  onOpenData?: (tableId: string) => void;
}) {
  const { data, userId } = useReferenceData();
  const [pageId, setPageId] = useState(
    system.definition.homePage || system.definition.pages[0]?.id || "",
  );

  const page =
    system.definition.pages.find((item) => item.id === pageId) ||
    system.definition.pages[0];

  const role = resourceRole(data, userId, "system", system.id);

  const renderBlock = (block: SystemBlock) => {
    if (block.type === "shortcut") {
      const target = system.definition.pages.find(
        (item) => item.id === block.source,
      );
      return (
        <button
          className={"system-runtime-shortcut width-" + block.width}
          type="button"
          onClick={() => target && setPageId(target.id)}
          key={block.id}
        >
          <span>{block.title}</span>
          <strong>{target?.name || "Página"}</strong>
          <span>→</span>
        </button>
      );
    }

    if (block.type === "dashboard") {
      const dashboard = data.dashboards.find(
        (item) => item.id === block.source,
      );
      return (
        <section
          className={"system-runtime-block width-" + block.width}
          key={block.id}
        >
          <header>
            <span>Dashboard</span>
            <h3>{block.title}</h3>
          </header>
          {dashboard ? (
            <DashboardRenderer dashboard={dashboard} data={data} compact />
          ) : (
            <p className="ref-note">Dashboard indisponível.</p>
          )}
        </section>
      );
    }

    if (block.type === "queue_summary") {
      const queue = page?.blocks.find(
        (item) => item.id === block.source && item.type === "queue",
      );
      const table = data.tables.find((item) => item.id === queue?.source);
      const rows = data.records.filter((item) => item.tableId === table?.id);
      const config = queue?.queue;
      const filtered = config
        ? rows.filter(
            (row) => String(row.values[config.status] ?? "") === config.statusValue,
          )
        : rows;
      return (
        <section
          className={"system-runtime-block metric width-" + block.width}
          key={block.id}
        >
          <span>{block.title}</span>
          <strong>{filtered.length}</strong>
          <small>{table?.name || "Fila"}</small>
        </section>
      );
    }

    const table = data.tables.find((item) => item.id === block.source);
    const rows = data.records.filter((item) => item.tableId === table?.id);
    const columns =
      block.columns?.length
        ? (table?.fields || []).filter((field) => block.columns?.includes(field.id))
        : (table?.fields || []).filter((field) => !field.archived);

    if (block.type === "form") {
      return (
        <section
          className={"system-runtime-block width-" + block.width}
          key={block.id}
        >
          <header>
            <span>Formulário</span>
            <h3>{block.title}</h3>
          </header>
          <div className="system-form-summary">
            {columns.slice(0, 6).map((field) => (
              <div key={field.id}>
                <span>{field.name}</span>
                <small>{field.type}</small>
              </div>
            ))}
          </div>
          <button
            className="ref-button primary"
            type="button"
            onClick={() => table && onOpenData?.(table.id)}
          >
            Preencher formulário
          </button>
        </section>
      );
    }

    const queueConfig = block.queue;
    const queueRows =
      block.type === "queue" && queueConfig
        ? rows
            .filter(
              (row) =>
                String(row.values[queueConfig.status] ?? "") ===
                queueConfig.statusValue,
            )
            .sort((a, b) =>
              String(a.values[queueConfig.date] ?? "").localeCompare(
                String(b.values[queueConfig.date] ?? ""),
              ),
            )
        : rows;

    return (
      <section
        className={"system-runtime-block width-" + block.width}
        key={block.id}
      >
        <header>
          <span>{block.type === "queue" ? "Fila" : "Tabela"}</span>
          <h3>{block.title}</h3>
        </header>
        <div className="ref-table-wrap">
          <table className="ref-table compact">
            <thead>
              <tr>
                {columns.slice(0, 6).map((field) => (
                  <th key={field.id}>{field.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {queueRows.slice(0, 20).map((row) => (
                <tr key={row.id}>
                  {columns.slice(0, 6).map((field) => (
                    <td key={field.id}>
                      {Array.isArray(row.values[field.id])
                        ? (row.values[field.id] as string[]).join(", ")
                        : String(row.values[field.id] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          className="ref-button secondary"
          type="button"
          onClick={() => table && onOpenData?.(table.id)}
        >
          Abrir dados
        </button>
      </section>
    );
  };

  if (!page) {
    return (
      <div className="ref-empty">
        <FiLayout />
        <h2>Sistema sem páginas</h2>
        <p>Abra o construtor para criar a primeira tela.</p>
        {canDesign(role) && (
          <button className="ref-button primary" type="button" onClick={onBuild}>
            Construir sistema
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="system-runtime">
      <header className="system-runtime-header">
        <div>
          <span className="ref-eyebrow">Sistema</span>
          <h1>{system.name}</h1>
          <p>{system.description}</p>
        </div>
        {canDesign(role) && (
          <button className="ref-button secondary" type="button" onClick={onBuild}>
            <FiEdit2 />
            Construir
          </button>
        )}
      </header>

      <nav className="system-runtime-nav">
        {system.definition.pages.map((item) => (
          <button
            className={item.id === page.id ? "active" : ""}
            type="button"
            key={item.id}
            onClick={() => setPageId(item.id)}
          >
            {item.name}
          </button>
        ))}
      </nav>

      <div className="system-runtime-grid">{page.blocks.map(renderBlock)}</div>
    </div>
  );
}

function SystemBuilder({
  system,
  onSaved,
  onClose,
  onOpenData,
}: {
  system: SystemResource;
  onSaved: () => Promise<void>;
  onClose: () => void;
  onOpenData?: (tableId: string) => void;
}) {
  const { data, userId, refresh } = useReferenceData();
  const [tab, setTab] = useState<
    "overview" | "data" | "screens" | "access" | "documentation" | "use"
  >("overview");
  const [name, setName] = useState(system.name);
  const [description, setDescription] = useState(system.description);
  const [definition, setDefinition] = useState<SystemDefinition>(
    JSON.parse(JSON.stringify(system.definition)),
  );
  const [reviewNotes, setReviewNotes] = useState(system.reviewNotes);
  const [pageId, setPageId] = useState(
    system.definition.homePage || system.definition.pages[0]?.id || "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [relationSource, setRelationSource] = useState("");
  const [relationField, setRelationField] = useState("");
  const [relationTarget, setRelationTarget] = useState("");

  const role = resourceRole(data, userId, "system", system.id);
  const editable = canDesign(role);
  const manageable = canManage(role);
  const workspaceTables = data.tables.filter(
    (table) => table.workspaceId === system.workspaceId,
  );
  const workspaceDashboards = data.dashboards.filter(
    (dashboard) => dashboard.workspaceId === system.workspaceId,
  );
  const relations = data.relations.filter(
    (relation) => relation.workspaceId === system.workspaceId,
  );
  const page =
    definition.pages.find((item) => item.id === pageId) || definition.pages[0];

  const save = async () => {
    setSaving(true);
    setError("");

    try {
      if (!name.trim()) throw new Error("Informe o nome do sistema.");
      const supabase = await getSupabase();
      const { error: updateError } = await supabase
        .from("systems")
        .update({
          name: name.trim(),
          description: description.trim(),
          definition,
          review_notes: reviewNotes,
          source_versions: Object.fromEntries(
            workspaceTables
              .filter((table) => definition.tables.includes(table.id))
              .map((table) => [table.id, table.version]),
          ),
          version: system.version + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", system.id);
      if (updateError) throw updateError;

      await logAudit(system.ownerId, "system.updated", system.id, {
        pages: definition.pages.length,
        tables: definition.tables.length,
      });
      await onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível salvar.",
      );
    } finally {
      setSaving(false);
    }
  };

  const changePage = (next: SystemPage) =>
    setDefinition((current) => ({
      ...current,
      pages: current.pages.map((item) => (item.id === next.id ? next : item)),
    }));

  const addBlock = (type: SystemBlock["type"]) => {
    if (!page) return;
    const source =
      type === "dashboard"
        ? workspaceDashboards[0]?.id || ""
        : type === "shortcut"
          ? definition.pages.find((item) => item.id !== page.id)?.id || ""
          : workspaceTables[0]?.id || "";

    changePage({
      ...page,
      blocks: [
        ...page.blocks,
        {
          id: makeResourceId("block"),
          type,
          source,
          title:
            type === "dashboard"
              ? "Dashboard"
              : type === "form"
                ? "Novo registro"
                : type === "queue"
                  ? "Fila"
                  : type === "queue_summary"
                    ? "Resumo da fila"
                    : type === "shortcut"
                      ? "Atalho"
                      : "Tabela",
          width: 12,
        },
      ],
    });
  };

  const createRelation = async () => {
    if (!relationSource || !relationField || !relationTarget) {
      setError("Selecione origem, campo e destino.");
      return;
    }

    const supabase = await getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error: relationError } = await supabase
      .from("table_relations")
      .upsert(
        {
          id: makeResourceId("relation"),
          owner_id: user.id,
          workspace_id: system.workspaceId,
          source_table_id: relationSource,
          field_id: relationField,
          target_table_id: relationTarget,
          cardinality: "many",
          required: false,
        },
        { onConflict: "source_table_id,field_id" },
      );

    if (relationError) {
      setError(relationError.message);
      return;
    }

    setRelationSource("");
    setRelationField("");
    setRelationTarget("");
    await refresh();
  };

  if (tab === "use") {
    const draft = { ...system, name, description, definition };
    return (
      <div className="system-builder-shell">
        <div className="system-builder-toolbar">
          <button
            className="ref-button secondary"
            type="button"
            onClick={() => setTab("screens")}
          >
            ← Construtor
          </button>
        </div>
        <SystemRuntime
          system={draft}
          onBuild={() => setTab("screens")}
          onOpenData={onOpenData}
        />
      </div>
    );
  }

  return (
    <div className="system-builder-shell">
      <div className="system-builder-toolbar">
        <div className="ref-heading-actions">
          <button className="ref-button secondary" type="button" onClick={onClose}>
            ← Biblioteca
          </button>
          <button
            className="ref-button secondary"
            type="button"
            onClick={() => setTab("use")}
          >
            <FiPlay />
            Usar sistema
          </button>
        </div>
        {editable && (
          <button
            className="ref-button primary"
            type="button"
            disabled={saving}
            onClick={() => void save()}
          >
            <FiSave />
            {saving ? "Salvando…" : "Salvar alterações"}
          </button>
        )}
      </div>

      <nav className="ref-tabs wide-tabs">
        {[
          ["overview", "Visão geral"],
          ["data", "Dados e relações"],
          ["screens", "Telas"],
          ["access", "Pessoas e acessos"],
          ["documentation", "Documentação"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={tab === value ? "active" : ""}
            onClick={() => setTab(value as typeof tab)}
          >
            {label}
          </button>
        ))}
      </nav>

      {error && <p className="auth-feedback error">{error}</p>}

      {tab === "overview" && (
        <div className="system-builder-section">
          <div className="ref-two">
            <label className="ref-field">
              <span>Nome</span>
              <input
                disabled={!editable}
                value={name}
                maxLength={150}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="ref-field">
              <span>Workspace</span>
              <input
                disabled
                value={
                  data.workspaces.find((item) => item.id === system.workspaceId)
                    ?.name || ""
                }
              />
            </label>
          </div>
          <label className="ref-field">
            <span>Objetivo</span>
            <textarea
              disabled={!editable}
              rows={5}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <div className="ref-stats">
            <article>
              <strong>{definition.tables.length}</strong>
              <span>Tabelas</span>
            </article>
            <article>
              <strong>{definition.pages.length}</strong>
              <span>Telas</span>
            </article>
            <article>
              <strong>
                {definition.pages.reduce(
                  (sum, current) => sum + current.blocks.length,
                  0,
                )}
              </strong>
              <span>Componentes</span>
            </article>
          </div>
        </div>
      )}

      {tab === "data" && (
        <div className="system-builder-section">
          <div className="ref-section-heading">
            <div>
              <span className="ref-eyebrow">Fontes</span>
              <h3>Tabelas utilizadas pelo sistema</h3>
            </div>
          </div>

          <div className="system-table-choices">
            {workspaceTables.map((table) => (
              <label key={table.id}>
                <input
                  type="checkbox"
                  disabled={!editable}
                  checked={definition.tables.includes(table.id)}
                  onChange={(event) =>
                    setDefinition((current) => ({
                      ...current,
                      tables: event.target.checked
                        ? [...current.tables, table.id]
                        : current.tables.filter((id) => id !== table.id),
                    }))
                  }
                />
                <span>
                  <strong>{table.name}</strong>
                  <small>{table.fields.filter((field) => !field.archived).length} campos</small>
                </span>
              </label>
            ))}
          </div>

          <div className="ref-section-heading">
            <div>
              <span className="ref-eyebrow">Relações</span>
              <h3>Vincular tabelas</h3>
            </div>
          </div>

          {editable && (
            <div className="relation-builder">
              <select
                value={relationSource}
                onChange={(event) => {
                  setRelationSource(event.target.value);
                  setRelationField("");
                }}
              >
                <option value="">Tabela de origem</option>
                {workspaceTables.map((table) => (
                  <option value={table.id} key={table.id}>
                    {table.name}
                  </option>
                ))}
              </select>

              <select
                value={relationField}
                onChange={(event) => setRelationField(event.target.value)}
              >
                <option value="">Campo</option>
                {workspaceTables
                  .find((table) => table.id === relationSource)
                  ?.fields.filter((field) => !field.archived)
                  .map((field) => (
                    <option value={field.id} key={field.id}>
                      {field.name}
                    </option>
                  ))}
              </select>

              <select
                value={relationTarget}
                onChange={(event) => setRelationTarget(event.target.value)}
              >
                <option value="">Tabela de destino</option>
                {workspaceTables
                  .filter((table) => table.id !== relationSource)
                  .map((table) => (
                    <option value={table.id} key={table.id}>
                      {table.name}
                    </option>
                  ))}
              </select>

              <button
                className="ref-button secondary"
                type="button"
                onClick={() => void createRelation()}
              >
                <FiPlus />
                Criar relação
              </button>
            </div>
          )}

          <div className="relation-list">
            {relations.map((relation) => {
              const source = data.tables.find(
                (item) => item.id === relation.sourceTableId,
              );
              const target = data.tables.find(
                (item) => item.id === relation.targetTableId,
              );
              const field = source?.fields.find(
                (item) => item.id === relation.fieldId,
              );
              return (
                <article key={relation.id}>
                  <strong>
                    {source?.name} · {field?.name}
                  </strong>
                  <span>→ {target?.name}</span>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {tab === "screens" && (
        <div className="system-builder-section">
          <div className="ref-section-heading">
            <div>
              <span className="ref-eyebrow">Application builder</span>
              <h3>Páginas e componentes</h3>
            </div>
            {editable && (
              <button
                className="ref-button secondary"
                type="button"
                disabled={definition.pages.length >= 20}
                onClick={() => {
                  const next: SystemPage = {
                    id: makeResourceId("page"),
                    name: "Nova página",
                    blocks: [],
                  };
                  setDefinition((current) => ({
                    ...current,
                    pages: [...current.pages, next],
                    homePage: current.homePage || next.id,
                  }));
                  setPageId(next.id);
                }}
              >
                <FiPlus />
                Página
              </button>
            )}
          </div>

          {!!definition.pages.length && (
            <label className="ref-field">
              <span>Tela inicial</span>
              <select
                disabled={!editable}
                value={definition.homePage || definition.pages[0].id}
                onChange={(event) =>
                  setDefinition((current) => ({
                    ...current,
                    homePage: event.target.value,
                  }))
                }
              >
                {definition.pages.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <nav className="system-page-nav">
            {definition.pages.map((item) => (
              <button
                className={item.id === page?.id ? "active" : ""}
                type="button"
                key={item.id}
                onClick={() => setPageId(item.id)}
              >
                {item.name}
              </button>
            ))}
          </nav>

          {page ? (
            <>
              <div className="ref-two">
                <label className="ref-field">
                  <span>Nome da página</span>
                  <input
                    disabled={!editable}
                    value={page.name}
                    onChange={(event) =>
                      changePage({ ...page, name: event.target.value })
                    }
                  />
                </label>
                {editable && definition.pages.length > 1 && (
                  <button
                    className="ref-button danger"
                    type="button"
                    onClick={() => {
                      setDefinition((current) => {
                        const pages = current.pages.filter(
                          (item) => item.id !== page.id,
                        );
                        return {
                          ...current,
                          pages,
                          homePage:
                            current.homePage === page.id
                              ? pages[0]?.id
                              : current.homePage,
                        };
                      });
                      setPageId(
                        definition.pages.find((item) => item.id !== page.id)?.id ||
                          "",
                      );
                    }}
                  >
                    <FiTrash2 />
                    Remover página
                  </button>
                )}
              </div>

              {editable && (
                <div className="system-component-menu">
                  {[
                    ["table", "Tabela"],
                    ["form", "Formulário"],
                    ["dashboard", "Dashboard"],
                    ["queue", "Fila"],
                    ["queue_summary", "Resumo de fila"],
                    ["shortcut", "Atalho"],
                  ].map(([type, label]) => (
                    <button
                      className="ref-button secondary"
                      type="button"
                      key={type}
                      disabled={page.blocks.length >= 30}
                      onClick={() => addBlock(type as SystemBlock["type"])}
                    >
                      <FiPlus />
                      {label}
                    </button>
                  ))}
                </div>
              )}

              <div className="system-block-editor-list">
                {page.blocks.map((block, index) => {
                  const table = workspaceTables.find(
                    (item) => item.id === block.source,
                  );
                  const fields =
                    table?.fields.filter((field) => !field.archived) || [];

                  return (
                    <article className="system-block-editor" key={block.id}>
                      <header>
                        <strong>{block.type}</strong>
                        {editable && (
                          <div className="ref-heading-actions">
                            <button
                              className="ref-icon-button"
                              type="button"
                              disabled={!index}
                              onClick={() => {
                                const blocks = [...page.blocks];
                                [blocks[index - 1], blocks[index]] = [
                                  blocks[index],
                                  blocks[index - 1],
                                ];
                                changePage({ ...page, blocks });
                              }}
                            >
                              <FiArrowUp />
                            </button>
                            <button
                              className="ref-icon-button"
                              type="button"
                              disabled={index === page.blocks.length - 1}
                              onClick={() => {
                                const blocks = [...page.blocks];
                                [blocks[index + 1], blocks[index]] = [
                                  blocks[index],
                                  blocks[index + 1],
                                ];
                                changePage({ ...page, blocks });
                              }}
                            >
                              <FiArrowDown />
                            </button>
                            <button
                              className="ref-icon-button"
                              type="button"
                              onClick={() =>
                                changePage({
                                  ...page,
                                  blocks: page.blocks.filter(
                                    (item) => item.id !== block.id,
                                  ),
                                })
                              }
                            >
                              <FiTrash2 />
                            </button>
                          </div>
                        )}
                      </header>

                      <div className="ref-two">
                        <input
                          disabled={!editable}
                          value={block.title}
                          aria-label="Título do componente"
                          onChange={(event) =>
                            changePage({
                              ...page,
                              blocks: page.blocks.map((item) =>
                                item.id === block.id
                                  ? { ...item, title: event.target.value }
                                  : item,
                              ),
                            })
                          }
                        />

                        <select
                          disabled={!editable}
                          value={block.source}
                          onChange={(event) =>
                            changePage({
                              ...page,
                              blocks: page.blocks.map((item) =>
                                item.id === block.id
                                  ? {
                                      ...item,
                                      source: event.target.value,
                                      columns: undefined,
                                      queue: undefined,
                                    }
                                  : item,
                              ),
                            })
                          }
                        >
                          <option value="">Fonte</option>
                          {(block.type === "dashboard"
                            ? workspaceDashboards
                            : block.type === "shortcut"
                              ? definition.pages.filter(
                                  (item) => item.id !== page.id,
                                )
                              : workspaceTables
                          ).map((item: any) => (
                            <option value={item.id} key={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <select
                        disabled={!editable}
                        value={block.width}
                        onChange={(event) =>
                          changePage({
                            ...page,
                            blocks: page.blocks.map((item) =>
                              item.id === block.id
                                ? {
                                    ...item,
                                    width: Number(event.target.value) as
                                      | 3
                                      | 4
                                      | 6
                                      | 12,
                                  }
                                : item,
                            ),
                          })
                        }
                      >
                        <option value="3">1/4</option>
                        <option value="4">1/3</option>
                        <option value="6">1/2</option>
                        <option value="12">Largura inteira</option>
                      </select>

                      {["table", "queue"].includes(block.type) && fields.length > 0 && (
                        <fieldset className="system-column-options">
                          <legend>Colunas visíveis</legend>
                          {fields.map((field) => {
                            const selected =
                              !block.columns || block.columns.includes(field.id);
                            return (
                              <label key={field.id}>
                                <input
                                  type="checkbox"
                                  disabled={!editable}
                                  checked={selected}
                                  onChange={(event) => {
                                    const current =
                                      block.columns ||
                                      fields.map((item) => item.id);
                                    const columns = event.target.checked
                                      ? [...new Set([...current, field.id])]
                                      : current.filter((id) => id !== field.id);
                                    changePage({
                                      ...page,
                                      blocks: page.blocks.map((item) =>
                                        item.id === block.id
                                          ? { ...item, columns }
                                          : item,
                                      ),
                                    });
                                  }}
                                />
                                {field.name}
                              </label>
                            );
                          })}
                        </fieldset>
                      )}

                      {block.type === "queue" && table && (
                        <div className="ref-three">
                          <select
                            disabled={!editable}
                            value={block.queue?.date || ""}
                            onChange={(event) =>
                              changePage({
                                ...page,
                                blocks: page.blocks.map((item) =>
                                  item.id === block.id
                                    ? {
                                        ...item,
                                        queue: {
                                          date: event.target.value,
                                          status: block.queue?.status || "",
                                          statusValue:
                                            block.queue?.statusValue || "",
                                        },
                                      }
                                    : item,
                                ),
                              })
                            }
                          >
                            <option value="">Campo de data</option>
                            {fields
                              .filter((field) => field.type === "date")
                              .map((field) => (
                                <option value={field.id} key={field.id}>
                                  {field.name}
                                </option>
                              ))}
                          </select>

                          <select
                            disabled={!editable}
                            value={block.queue?.status || ""}
                            onChange={(event) =>
                              changePage({
                                ...page,
                                blocks: page.blocks.map((item) =>
                                  item.id === block.id
                                    ? {
                                        ...item,
                                        queue: {
                                          date: block.queue?.date || "",
                                          status: event.target.value,
                                          statusValue:
                                            block.queue?.statusValue || "",
                                        },
                                      }
                                    : item,
                                ),
                              })
                            }
                          >
                            <option value="">Campo de status</option>
                            {fields.map((field) => (
                              <option value={field.id} key={field.id}>
                                {field.name}
                              </option>
                            ))}
                          </select>

                          <input
                            disabled={!editable}
                            value={block.queue?.statusValue || ""}
                            placeholder="Valor da fila"
                            onChange={(event) =>
                              changePage({
                                ...page,
                                blocks: page.blocks.map((item) =>
                                  item.id === block.id
                                    ? {
                                        ...item,
                                        queue: {
                                          date: block.queue?.date || "",
                                          status: block.queue?.status || "",
                                          statusValue: event.target.value,
                                        },
                                      }
                                    : item,
                                ),
                              })
                            }
                          />
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="ref-empty compact">
              <FiLayout />
              <h3>Adicione uma página</h3>
            </div>
          )}
        </div>
      )}

      {tab === "access" && (
        <div className="system-builder-section">
          <div className="ref-section-heading">
            <div>
              <span className="ref-eyebrow">Permissões</span>
              <h3>Pessoas com acesso ao sistema</h3>
            </div>
          </div>

          <div className="ref-list">
            {data.grants
              .filter(
                (grant) =>
                  grant.kind === "system" && grant.resourceId === system.id,
              )
              .map((grant) => (
                <article key={grant.id}>
                  <div>
                    <strong>{grant.email}</strong>
                    <span>
                      {ACCESS_ROLE_LABELS[grant.role]} ·{" "}
                      {grant.acceptedAt ? "Ativo" : "Pendente"}
                    </span>
                  </div>
                </article>
              ))}
          </div>
          {!manageable && (
            <p className="ref-note">
              Somente proprietário ou administrador gerencia acessos.
            </p>
          )}
          {manageable && (
            <p className="ref-note">
              Use “Pessoas e Acessos” no menu principal para criar ou revogar
              convites deste sistema.
            </p>
          )}
        </div>
      )}

      {tab === "documentation" && (
        <div className="system-builder-section">
          <div className="ref-editor-card documentation">
            <span className="ref-eyebrow">Documentação</span>
            <h2>{name}</h2>
            <p>{description || "Sem objetivo documentado."}</p>
            <dl>
              <div>
                <dt>Versão</dt>
                <dd>{system.version + 1}</dd>
              </div>
              <div>
                <dt>Tabelas</dt>
                <dd>{definition.tables.length}</dd>
              </div>
              <div>
                <dt>Páginas</dt>
                <dd>{definition.pages.length}</dd>
              </div>
              <div>
                <dt>Última atualização</dt>
                <dd>{new Date(system.updatedAt).toLocaleString("pt-BR")}</dd>
              </div>
            </dl>
            <label className="ref-field">
              <span>Notas da revisão</span>
              <textarea
                rows={6}
                disabled={!editable}
                value={reviewNotes}
                onChange={(event) => setReviewNotes(event.target.value)}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateSystem({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const { data, userId } = useReferenceData();
  const workspaces = data.workspaces.filter((workspace) =>
    canDesign(resourceRole(data, userId, "workspace", workspace.id)),
  );
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id || "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tables, setTables] = useState<string[]>([]);
  const [review, setReview] = useState(false);
  const [proposal, setProposal] = useState<SystemDefinition | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const availableTables = data.tables.filter(
    (table) => table.workspaceId === workspaceId,
  );

  const prepare = () => {
    const selected = tables.length ? tables : availableTables.map((item) => item.id);
    const names = Object.fromEntries(
      availableTables.map((item) => [item.id, item.name]),
    );
    setProposal(initialDefinition(selected, names));
    setReview(true);
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      if (!workspaceId || !name.trim()) throw new Error("Preencha os campos.");
      const supabase = await getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sua sessão expirou.");

      const definition =
        proposal ||
        initialDefinition(
          tables,
          Object.fromEntries(availableTables.map((item) => [item.id, item.name])),
        );

      const id = makeResourceId("system");
      const { error: insertError } = await supabase.from("systems").insert({
        id,
        owner_id: user.id,
        workspace_id: workspaceId,
        name: name.trim(),
        description: description.trim(),
        definition,
        review_notes: notes,
        source_versions: Object.fromEntries(
          availableTables
            .filter((table) => definition.tables.includes(table.id))
            .map((table) => [table.id, table.version]),
        ),
      });
      if (insertError) throw insertError;

      await supabase.from("agent_requests").insert({
        id: makeResourceId("agent"),
        actor_id: user.id,
        workspace_id: workspaceId,
        mode: "system",
        prompt: description || "Construção manual",
        tables: definition.tables,
        status: review ? "reviewed" : "manual",
        plan: definition,
        result: { system: id },
      });

      await logAudit(user.id, "system.created", id, {
        workspace: workspaceId,
        reviewed: review,
      });
      await onCreated(id);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível criar.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ref-modal-backdrop" onMouseDown={onClose}>
      <section
        className="ref-modal wide"
        role="dialog"
        aria-modal="true"
        aria-label="Criar sistema"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="ref-modal-header">
          <div>
            <span>System Builder</span>
            <h2>{review ? "Revise a proposta" : "Criar sistema"}</h2>
            <p>
              {review
                ? "A proposta continua editável depois da criação."
                : "Defina o objetivo e as fontes de dados."}
            </p>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose}>
            <FiX />
          </button>
        </header>

        <form className="ref-form" onSubmit={create}>
          {!review ? (
            <>
              <div className="ref-two">
                <label className="ref-field">
                  <span>Nome</span>
                  <input
                    autoFocus
                    value={name}
                    maxLength={150}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <label className="ref-field">
                  <span>Workspace</span>
                  <select
                    value={workspaceId}
                    onChange={(event) => {
                      setWorkspaceId(event.target.value);
                      setTables([]);
                    }}
                  >
                    {workspaces.map((workspace) => (
                      <option value={workspace.id} key={workspace.id}>
                        {workspace.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="ref-field">
                <span>O que este sistema deve permitir fazer?</span>
                <textarea
                  rows={4}
                  maxLength={2000}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Ex.: cadastrar solicitações e acompanhar a fila."
                />
              </label>

              <fieldset className="system-table-choices">
                <legend>Dados do sistema</legend>
                {availableTables.map((table) => (
                  <label key={table.id}>
                    <input
                      type="checkbox"
                      checked={tables.includes(table.id)}
                      onChange={(event) =>
                        setTables((current) =>
                          event.target.checked
                            ? [...current, table.id]
                            : current.filter((id) => id !== table.id),
                        )
                      }
                    />
                    <span>
                      <strong>{table.name}</strong>
                      <small>{table.fields.length} campos</small>
                    </span>
                  </label>
                ))}
                {!availableTables.length && (
                  <p className="ref-note">
                    Este workspace ainda não possui tabelas. O sistema poderá ser
                    criado em branco.
                  </p>
                )}
              </fieldset>

              <div className="ref-modal-actions">
                <button
                  className="ref-button secondary"
                  type="button"
                  onClick={onClose}
                >
                  Cancelar
                </button>
                <button
                  className="ref-button secondary"
                  type="button"
                  onClick={prepare}
                  disabled={!name.trim()}
                >
                  <FiGrid />
                  Preparar proposta
                </button>
                <button
                  className="ref-button primary"
                  type="submit"
                  disabled={busy || !name.trim()}
                >
                  Criar manualmente
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="system-proposal">
                {(proposal?.pages || []).map((page) => (
                  <article key={page.id}>
                    <strong>{page.name}</strong>
                    <span>
                      {page.blocks.map((block) => block.type).join(" · ")}
                    </span>
                  </article>
                ))}
              </div>

              <label className="ref-field">
                <span>Notas da revisão</span>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>

              {error && <p className="auth-feedback error">{error}</p>}

              <div className="ref-modal-actions">
                <button
                  className="ref-button secondary"
                  type="button"
                  onClick={() => setReview(false)}
                >
                  Voltar
                </button>
                <button
                  className="ref-button primary"
                  type="submit"
                  disabled={busy}
                >
                  {busy ? "Criando…" : "Criar sistema"}
                </button>
              </div>
            </>
          )}

          {!review && error && <p className="auth-feedback error">{error}</p>}
        </form>
      </section>
    </div>
  );
}

export function SystemsFeature({
  onOpenData,
}: {
  onOpenData?: (tableId: string) => void;
}) {
  const { data, userId, ready, error, refresh } = useReferenceData();
  const [selectedId, setSelectedId] = useState("");
  const [mode, setMode] = useState<"use" | "build">("use");
  const [createOpen, setCreateOpen] = useState(false);

  const system = data.systems.find((item) => item.id === selectedId) || null;

  if (!ready) return <div className="ref-feature ref-loading"><div /></div>;

  if (error) {
    return (
      <section className="ref-feature">
        <div className="ref-empty">
          <FiLayout />
          <h2>Não foi possível carregar os sistemas</h2>
          <p>{error}</p>
        </div>
      </section>
    );
  }

  if (system) {
    if (mode === "build") {
      return (
        <section className="ref-feature system-feature">
          <SystemBuilder
            system={system}
            onSaved={refresh}
            onClose={() => {
              setSelectedId("");
              setMode("use");
            }}
            onOpenData={onOpenData}
          />
        </section>
      );
    }

    return (
      <section className="ref-feature system-feature">
        <button
          className="ref-back"
          type="button"
          onClick={() => setSelectedId("")}
        >
          ← Sistemas
        </button>
        <SystemRuntime
          system={system}
          onBuild={() => setMode("build")}
          onOpenData={onOpenData}
        />
      </section>
    );
  }

  const editableWorkspaces = data.workspaces.filter((workspace) =>
    canDesign(resourceRole(data, userId, "workspace", workspace.id)),
  );

  return (
    <section className="ref-feature system-feature">
      <header className="ref-heading">
        <div>
          <span className="ref-eyebrow">Applications</span>
          <h1>Sistemas</h1>
          <p>
            Monte aplicações internas com tabelas, formulários, filas,
            dashboards e atalhos.
          </p>
        </div>
        <button
          className="ref-button primary"
          type="button"
          disabled={!editableWorkspaces.length}
          onClick={() => setCreateOpen(true)}
        >
          <FiPlus />
          Criar sistema
        </button>
      </header>

      {data.systems.length ? (
        <div className="ref-card-grid">
          {data.systems.map((item) => {
            const workspace = data.workspaces.find(
              (value) => value.id === item.workspaceId,
            );
            const organization = data.organizations.find(
              (value) => value.id === workspace?.organizationId,
            );
            const role = resourceRole(data, userId, "system", item.id);
            return (
              <article className="ref-resource-card" key={item.id}>
                <div className="ref-resource-top">
                  <span className="ref-resource-icon">
                    <FiLayout />
                  </span>
                  <span className="ref-role small">
                    {role ? ACCESS_ROLE_LABELS[role] : "Acesso"}
                  </span>
                </div>
                <h2>{item.name}</h2>
                <p>
                  {organization?.name} / {workspace?.name}
                </p>
                <small>
                  {item.definition.pages.length} telas ·{" "}
                  {item.definition.tables.length} tabelas
                </small>
                <div className="ref-resource-actions">
                  <button
                    className="ref-button primary"
                    type="button"
                    onClick={() => {
                      setSelectedId(item.id);
                      setMode("use");
                    }}
                  >
                    <FiPlay />
                    Abrir sistema
                  </button>
                  {canDesign(role) && (
                    <button
                      className="ref-button secondary"
                      type="button"
                      onClick={() => {
                        setSelectedId(item.id);
                        setMode("build");
                      }}
                    >
                      <FiEdit2 />
                      Construir
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="ref-empty">
          <FiLayout />
          <h2>Crie seu primeiro sistema</h2>
          <p>
            Comece pelas tabelas de um workspace ou defina uma estrutura do zero.
          </p>
        </div>
      )}

      {createOpen && (
        <CreateSystem
          onClose={() => setCreateOpen(false)}
          onCreated={async (id) => {
            await refresh();
            setSelectedId(id);
            setMode("build");
          }}
        />
      )}
    </section>
  );
}
