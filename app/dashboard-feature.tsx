"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  FiBarChart2,
  FiCopy,
  FiGlobe,
  FiPlus,
  FiSearch,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { getSupabase } from "./supabase";
import { makeResourceId } from "./netzos-data";
import {
  ACCESS_ROLE_LABELS,
  canDesign,
  canManage,
  logAudit,
  resourceRole,
  type Dashboard,
  type DashboardCard,
  type DataField,
  type DataRecord,
  type DataTable,
  type ReferenceData,
  useReferenceData,
} from "./reference-data";

const DEFAULT_COLORS = [
  "#272724",
  "#66665f",
  "#99998f",
  "#b9b9ae",
  "#d0d0c7",
  "#86867f",
];

function numeric(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  }).format(value);
}

function fieldById(table: DataTable | undefined, id: string) {
  return table?.fields.find((field) => field.id === id);
}

function metricValue(
  card: DashboardCard,
  rows: DataRecord[],
  field: DataField | undefined,
) {
  if (card.metric === "count") return rows.length;

  const values = rows
    .map((row) => numeric(row.values[card.field]))
    .filter((value): value is number => value !== null);

  if (!values.length) return 0;
  if (card.metric === "sum") return values.reduce((sum, value) => sum + value, 0);
  if (card.metric === "avg") {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  if (card.metric === "min") return Math.min(...values);
  if (card.metric === "max") return Math.max(...values);
  if (card.metric === "distinct") {
    return new Set(rows.map((row) => String(row.values[card.field] ?? ""))).size;
  }

  return field ? values.length : rows.length;
}

function groupedData(
  card: DashboardCard,
  rows: DataRecord[],
  table: DataTable | undefined,
) {
  const groupField = fieldById(table, card.group);
  if (!groupField || !card.group) return [];

  const grouped = new Map<string, DataRecord[]>();
  for (const row of rows) {
    const raw = row.values[card.group];
    const labels = Array.isArray(raw) ? raw : [raw];
    for (const label of labels) {
      const key = String(label ?? "Sem valor") || "Sem valor";
      const current = grouped.get(key) || [];
      current.push(row);
      grouped.set(key, current);
    }
  }

  const measureField = fieldById(table, card.field);
  return [...grouped.entries()]
    .map(([name, groupRows]) => ({
      name,
      value: metricValue(card, groupRows, measureField),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 20);
}

export function DashboardRenderer({
  dashboard,
  data,
  compact = false,
}: {
  dashboard: Dashboard;
  data: ReferenceData;
  compact?: boolean;
}) {
  if (!dashboard.cards.length) {
    return (
      <div className="ref-empty compact">
        <FiBarChart2 />
        <h3>Dashboard vazio</h3>
        <p>Adicione indicadores e gráficos no modo de edição.</p>
      </div>
    );
  }

  return (
    <div className={"dashboard-card-grid " + (compact ? "compact" : "")}>
      {dashboard.cards.map((card) => {
        const table = data.tables.find((item) => item.id === card.source);
        const rows = data.records.filter((row) => row.tableId === card.source);
        const field = fieldById(table, card.field);
        const value = metricValue(card, rows, field);
        const grouped = groupedData(card, rows, table);

        return (
          <article
            className={"dashboard-data-card width-" + card.width}
            key={card.id}
          >
            <header>
              <span>{table?.name || "Fonte"}</span>
              <h3>{card.title}</h3>
            </header>

            {["number", "status"].includes(card.visual) ? (
              <div className="dashboard-number">
                <strong>{formatNumber(value)}</strong>
                <small>
                  {card.metric === "count"
                    ? "registros"
                    : field?.name || card.metric}
                </small>
              </div>
            ) : card.visual === "progress" ? (
              <div className="dashboard-progress">
                <strong>{formatNumber(value)}</strong>
                <div>
                  <span
                    style={{
                      width:
                        Math.min(
                          100,
                          card.target && card.target > 0
                            ? (value / card.target) * 100
                            : 0,
                        ) + "%",
                    }}
                  />
                </div>
                <small>
                  Meta: {card.target ? formatNumber(card.target) : "não definida"}
                </small>
              </div>
            ) : card.visual === "table" ? (
              <div className="dashboard-mini-table">
                <table>
                  <tbody>
                    {rows.slice(0, 8).map((row) => (
                      <tr key={row.id}>
                        {(table?.fields || [])
                          .filter((item) => !item.archived)
                          .slice(0, 3)
                          .map((item) => (
                            <td key={item.id}>
                              {String(row.values[item.id] ?? "—")}
                            </td>
                          ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : card.visual === "pie" || card.visual === "donut" ? (
              <div className="dashboard-chart">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={grouped}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={card.visual === "donut" ? 55 : 0}
                      outerRadius={85}
                    >
                      {grouped.map((_, index) => (
                        <Cell
                          key={index}
                          fill={DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : card.visual === "line" ? (
              <div className="dashboard-chart">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={grouped}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" hide={grouped.length > 8} />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" stroke="#272724" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="dashboard-chart">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={grouped}
                    layout={card.visual === "hbar" ? "vertical" : "horizontal"}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    {card.visual === "hbar" ? (
                      <>
                        <XAxis type="number" />
                        <YAxis dataKey="name" type="category" width={90} />
                      </>
                    ) : (
                      <>
                        <XAxis dataKey="name" hide={grouped.length > 8} />
                        <YAxis />
                      </>
                    )}
                    <Tooltip />
                    <Bar dataKey="value" fill="#272724" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function DashboardEditor({
  dashboard,
  data,
  userId,
  onSaved,
  onClose,
}: {
  dashboard: Dashboard;
  data: ReferenceData;
  userId: string;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(dashboard.name);
  const [cards, setCards] = useState<DashboardCard[]>(dashboard.cards);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const workspaceTables = data.tables.filter(
    (table) => table.workspaceId === dashboard.workspaceId,
  );

  const patchCard = (id: string, patch: Partial<DashboardCard>) =>
    setCards((current) =>
      current.map((card) => (card.id === id ? { ...card, ...patch } : card)),
    );

  const addCard = () => {
    const table = workspaceTables[0];
    const field = table?.fields.find((item) => !item.archived);
    const group = table?.fields.find(
      (item) => !item.archived && ["single", "date", "text"].includes(item.type),
    );

    setCards((current) => [
      ...current,
      {
        id: makeResourceId("card"),
        title: "Novo indicador",
        source: table?.id || "",
        visual: "number",
        metric: "count",
        field: field?.id || "",
        group: group?.id || "",
        width: 6,
      },
    ]);
  };

  const save = async () => {
    setSaving(true);
    setError("");

    try {
      if (!name.trim()) throw new Error("Informe o nome do dashboard.");
      if (cards.some((card) => !card.source)) {
        throw new Error("Todos os cards precisam de uma fonte.");
      }

      const supabase = await getSupabase();
      const { error: updateError } = await supabase
        .from("dashboards")
        .update({
          name: name.trim(),
          cards,
          version: dashboard.version + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", dashboard.id);
      if (updateError) throw updateError;

      await logAudit(
        dashboard.ownerId || userId,
        "dashboard.updated",
        dashboard.id,
        { cards: cards.length },
      );
      await onSaved();
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar o dashboard.",
      );
    } finally {
      setSaving(false);
    }
  };

  const draft: Dashboard = { ...dashboard, name, cards };

  return (
    <div className="ref-modal-backdrop editor" onMouseDown={onClose}>
      <section
        className="ref-modal wide"
        role="dialog"
        aria-modal="true"
        aria-label="Editar dashboard"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="ref-modal-header">
          <div>
            <span>Dashboard Builder</span>
            <h2>{name}</h2>
            <p>Monte indicadores e gráficos usando as tabelas do workspace.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar">
            <FiX />
          </button>
        </header>

        <div className="dashboard-builder-layout">
          <aside className="dashboard-builder-controls">
            <label className="ref-field">
              <span>Nome</span>
              <input
                value={name}
                maxLength={150}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <button
              className="ref-button secondary"
              type="button"
              onClick={addCard}
              disabled={!workspaceTables.length}
            >
              <FiPlus />
              Adicionar card
            </button>

            <div className="dashboard-card-editor-list">
              {cards.map((card, index) => {
                const table = workspaceTables.find(
                  (item) => item.id === card.source,
                );
                const fields = table?.fields.filter((item) => !item.archived) || [];

                return (
                  <article className="dashboard-card-editor" key={card.id}>
                    <div className="ref-section-heading compact">
                      <strong>Card {index + 1}</strong>
                      <button
                        className="ref-icon-button"
                        type="button"
                        onClick={() =>
                          setCards((current) =>
                            current.filter((item) => item.id !== card.id),
                          )
                        }
                        aria-label="Remover card"
                      >
                        <FiTrash2 />
                      </button>
                    </div>

                    <input
                      value={card.title}
                      aria-label="Título"
                      onChange={(event) =>
                        patchCard(card.id, { title: event.target.value })
                      }
                    />

                    <select
                      value={card.source}
                      aria-label="Fonte"
                      onChange={(event) => {
                        const next = workspaceTables.find(
                          (item) => item.id === event.target.value,
                        );
                        patchCard(card.id, {
                          source: event.target.value,
                          field:
                            next?.fields.find((item) => !item.archived)?.id || "",
                          group:
                            next?.fields.find(
                              (item) =>
                                !item.archived &&
                                ["single", "text", "date"].includes(item.type),
                            )?.id || "",
                        });
                      }}
                    >
                      <option value="">Fonte</option>
                      {workspaceTables.map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>

                    <div className="ref-two">
                      <select
                        value={card.visual}
                        aria-label="Visual"
                        onChange={(event) =>
                          patchCard(card.id, {
                            visual: event.target.value as DashboardCard["visual"],
                          })
                        }
                      >
                        <option value="number">Número</option>
                        <option value="progress">Progresso</option>
                        <option value="status">Status</option>
                        <option value="bar">Colunas</option>
                        <option value="hbar">Barras</option>
                        <option value="line">Linha</option>
                        <option value="pie">Pizza</option>
                        <option value="donut">Donut</option>
                        <option value="table">Tabela</option>
                        <option value="ranking">Ranking</option>
                      </select>

                      <select
                        value={card.metric}
                        aria-label="Métrica"
                        onChange={(event) =>
                          patchCard(card.id, {
                            metric: event.target.value as DashboardCard["metric"],
                          })
                        }
                      >
                        <option value="count">Contagem</option>
                        <option value="sum">Soma</option>
                        <option value="avg">Média</option>
                        <option value="min">Mínimo</option>
                        <option value="max">Máximo</option>
                        <option value="distinct">Distintos</option>
                      </select>
                    </div>

                    <div className="ref-two">
                      <select
                        value={card.field}
                        aria-label="Campo"
                        onChange={(event) =>
                          patchCard(card.id, { field: event.target.value })
                        }
                      >
                        <option value="">Campo</option>
                        {fields.map((field) => (
                          <option value={field.id} key={field.id}>
                            {field.name}
                          </option>
                        ))}
                      </select>

                      <select
                        value={card.group}
                        aria-label="Agrupar por"
                        onChange={(event) =>
                          patchCard(card.id, { group: event.target.value })
                        }
                      >
                        <option value="">Sem agrupamento</option>
                        {fields.map((field) => (
                          <option value={field.id} key={field.id}>
                            {field.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="ref-two">
                      <select
                        value={card.width}
                        aria-label="Largura"
                        onChange={(event) =>
                          patchCard(card.id, {
                            width: Number(event.target.value) as 3 | 4 | 6 | 12,
                          })
                        }
                      >
                        <option value="3">1/4</option>
                        <option value="4">1/3</option>
                        <option value="6">1/2</option>
                        <option value="12">Inteira</option>
                      </select>

                      {card.visual === "progress" && (
                        <input
                          type="number"
                          value={card.target || ""}
                          placeholder="Meta"
                          onChange={(event) =>
                            patchCard(card.id, {
                              target: event.target.value
                                ? Number(event.target.value)
                                : undefined,
                            })
                          }
                        />
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </aside>

          <main className="dashboard-builder-preview">
            <DashboardRenderer dashboard={draft} data={data} />
          </main>
        </div>

        {error && <p className="auth-feedback error">{error}</p>}

        <footer className="ref-modal-actions">
          <button className="ref-button secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="ref-button primary"
            type="button"
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? "Salvando…" : "Salvar dashboard"}
          </button>
        </footer>
      </section>
    </div>
  );
}

export function DashboardsFeature() {
  const { data, userId, ready, error, refresh } = useReferenceData();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [editing, setEditing] = useState<Dashboard | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [workspaceId, setWorkspaceId] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const dashboard = data.dashboards.find((item) => item.id === selectedId) || null;

  const editableWorkspaces = data.workspaces.filter((workspace) =>
    canDesign(resourceRole(data, userId, "workspace", workspace.id)),
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return data.dashboards.filter(
      (item) =>
        !query || item.name.toLocaleLowerCase("pt-BR").includes(query),
    );
  }, [data.dashboards, search]);

  const createDashboard = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setActionError("");

    try {
      if (!workspaceId || !name.trim()) throw new Error("Preencha os campos.");

      const supabase = await getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sua sessão expirou.");

      const id = makeResourceId("dashboard");
      const { error: insertError } = await supabase.from("dashboards").insert({
        id,
        owner_id: user.id,
        workspace_id: workspaceId,
        name: name.trim(),
        cards: [],
        settings: { version: 2 },
      });
      if (insertError) throw insertError;

      await logAudit(user.id, "dashboard.created", id, { workspace: workspaceId });
      await refresh();
      setCreateOpen(false);
      setName("");
      setSelectedId(id);
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "Não foi possível criar.",
      );
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async (item: Dashboard) => {
    const supabase = await getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const id = makeResourceId("dashboard");
    const { error: duplicateError } = await supabase.from("dashboards").insert({
      id,
      owner_id: user.id,
      workspace_id: item.workspaceId,
      name: ("Cópia · " + item.name).slice(0, 150),
      cards: item.cards,
      settings: item.settings,
    });
    if (duplicateError) {
      setActionError(duplicateError.message);
      return;
    }
    await refresh();
    setSelectedId(id);
  };

  const publish = async (item: Dashboard) => {
    const supabase = await getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const publicationId = makeResourceId("pub");
    const workspace = data.workspaces.find(
      (value) => value.id === item.workspaceId,
    );
    const snapshot = {
      id: item.id,
      name: item.name,
      workspace: workspace?.name || "",
      cards: item.cards,
      settings: item.settings,
      tables: data.tables.filter((table) => table.workspaceId === item.workspaceId),
      records: data.records.filter((record) =>
        item.cards.some((card) => card.source === record.tableId),
      ),
      createdAt: new Date().toISOString(),
    };

    const { error: publishError } = await supabase
      .from("dashboard_publications")
      .insert({
        id: publicationId,
        dashboard_id: item.id,
        owner_id: user.id,
        snapshot,
        active: true,
      });
    if (publishError) {
      setActionError(publishError.message);
      return;
    }

    await logAudit(user.id, "dashboard.published", item.id, {
      publication: publicationId,
    });

    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("publication", publicationId);
    await navigator.clipboard.writeText(url.toString());
    setActionError("Link de publicação copiado.");
  };

  if (!ready) return <div className="ref-feature ref-loading"><div /></div>;

  if (error) {
    return (
      <section className="ref-feature">
        <div className="ref-empty">
          <FiBarChart2 />
          <h2>Não foi possível carregar dashboards</h2>
          <p>{error}</p>
        </div>
      </section>
    );
  }

  if (dashboard) {
    const role = resourceRole(data, userId, "dashboard", dashboard.id);
    const workspace = data.workspaces.find(
      (item) => item.id === dashboard.workspaceId,
    );

    return (
      <section className="ref-feature">
        <header className="ref-detail-header">
          <div>
            <button
              className="ref-back"
              type="button"
              onClick={() => setSelectedId("")}
            >
              ← Dashboards
            </button>
            <span className="ref-eyebrow">{workspace?.name}</span>
            <h1>{dashboard.name}</h1>
            <p>Indicadores e visualizações calculados a partir dos seus dados.</p>
          </div>
          <div className="ref-heading-actions">
            <span className="ref-role">
              {role ? ACCESS_ROLE_LABELS[role] : "Acesso"}
            </span>
            {canDesign(role) && (
              <button
                className="ref-button secondary"
                type="button"
                onClick={() => setEditing(dashboard)}
              >
                Editar
              </button>
            )}
            {canManage(role) && (
              <button
                className="ref-button secondary"
                type="button"
                onClick={() => void publish(dashboard)}
              >
                <FiGlobe />
                Publicar
              </button>
            )}
          </div>
        </header>

        {actionError && (
          <p
            className={
              "ref-note " + (actionError.includes("copiado") ? "success" : "error")
            }
          >
            {actionError}
          </p>
        )}

        <DashboardRenderer dashboard={dashboard} data={data} />

        {editing && (
          <DashboardEditor
            dashboard={editing}
            data={data}
            userId={userId}
            onSaved={refresh}
            onClose={() => setEditing(null)}
          />
        )}
      </section>
    );
  }

  return (
    <section className="ref-feature">
      <header className="ref-heading">
        <div>
          <span className="ref-eyebrow">Visualization library</span>
          <h1>Dashboards</h1>
          <p>Crie painéis a partir das tabelas dos seus workspaces.</p>
        </div>
        <button
          className="ref-button primary"
          type="button"
          disabled={!editableWorkspaces.length}
          onClick={() => {
            setWorkspaceId(editableWorkspaces[0]?.id || "");
            setCreateOpen(true);
          }}
        >
          <FiPlus />
          Criar dashboard
        </button>
      </header>

      <div className="ref-toolbar">
        <label className="ref-search">
          <FiSearch />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar dashboards…"
          />
        </label>
      </div>

      {filtered.length ? (
        <div className="ref-card-grid">
          {filtered.map((item) => {
            const workspace = data.workspaces.find(
              (value) => value.id === item.workspaceId,
            );
            const role = resourceRole(data, userId, "dashboard", item.id);
            return (
              <article className="ref-resource-card" key={item.id}>
                <div className="ref-resource-top">
                  <span className="ref-resource-icon">
                    <FiBarChart2 />
                  </span>
                  <span className="ref-role small">
                    {role ? ACCESS_ROLE_LABELS[role] : "Acesso"}
                  </span>
                </div>
                <h2>{item.name}</h2>
                <p>{workspace?.name}</p>
                <small>
                  {item.cards.length} cards · atualizado{" "}
                  {new Date(item.updatedAt).toLocaleDateString("pt-BR")}
                </small>
                <div className="ref-resource-actions">
                  <button
                    className="ref-button primary"
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                  >
                    Abrir
                  </button>
                  {canDesign(role) && (
                    <button
                      className="ref-icon-button"
                      type="button"
                      title="Duplicar"
                      onClick={() => void duplicate(item)}
                    >
                      <FiCopy />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="ref-empty">
          <FiBarChart2 />
          <h2>Uma biblioteca para seus painéis</h2>
          <p>Crie um dashboard e adicione indicadores das suas tabelas.</p>
        </div>
      )}

      {createOpen && (
        <div className="ref-modal-backdrop" onMouseDown={() => setCreateOpen(false)}>
          <section
            className="ref-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Criar dashboard"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="ref-modal-header">
              <div>
                <span>Dashboard</span>
                <h2>Novo dashboard</h2>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                aria-label="Fechar"
              >
                <FiX />
              </button>
            </header>

            <form className="ref-form" onSubmit={createDashboard}>
              <label className="ref-field">
                <span>Workspace</span>
                <select
                  value={workspaceId}
                  onChange={(event) => setWorkspaceId(event.target.value)}
                >
                  {editableWorkspaces.map((workspace) => (
                    <option value={workspace.id} key={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="ref-field">
                <span>Nome</span>
                <input
                  autoFocus
                  value={name}
                  maxLength={150}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>

              {actionError && <p className="auth-feedback error">{actionError}</p>}

              <div className="ref-modal-actions">
                <button
                  className="ref-button secondary"
                  type="button"
                  onClick={() => setCreateOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  className="ref-button primary"
                  type="submit"
                  disabled={busy}
                >
                  {busy ? "Criando…" : "Criar"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

export function PublishedDashboard({
  publicationId,
  onClose,
}: {
  publicationId: string;
  onClose: () => void;
}) {
  const [snapshot, setSnapshot] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void getSupabase()
      .then((supabase) =>
        supabase
          .from("dashboard_publications")
          .select("snapshot")
          .eq("id", publicationId)
          .eq("active", true)
          .maybeSingle(),
      )
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) setError(queryError.message);
        else setSnapshot(data?.snapshot || null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [publicationId]);

  if (loading) return <div className="published-dashboard"><p>Carregando…</p></div>;
  if (error || !snapshot) {
    return (
      <div className="published-dashboard">
        <h1>Publicação indisponível</h1>
        <p>{error || "O link não está ativo ou você não tem acesso."}</p>
        <button className="ref-button secondary" type="button" onClick={onClose}>
          Voltar
        </button>
      </div>
    );
  }

  const data: ReferenceData = {
    organizations: [],
    workspaces: [],
    tables: snapshot.tables || [],
    records: snapshot.records || [],
    dashboards: [],
    systems: [],
    relations: [],
    grants: [],
    events: [],
    connections: [],
    workflows: [],
    netzRequests: [],
    profiles: [],
  };
  const dashboard: Dashboard = {
    id: snapshot.id,
    ownerId: "",
    workspaceId: "",
    name: snapshot.name,
    cards: snapshot.cards || [],
    settings: snapshot.settings || {},
    version: 0,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.createdAt,
  };

  return (
    <main className="published-dashboard">
      <header>
        <span>NetzOS · publicação</span>
        <h1>{snapshot.name}</h1>
        <p>{snapshot.workspace}</p>
      </header>
      <DashboardRenderer dashboard={dashboard} data={data} />
      <button className="ref-button secondary" type="button" onClick={onClose}>
        Voltar ao NetzOS
      </button>
    </main>
  );
}
