"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiDatabase,
  FiEdit3,
  FiPlay,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiSend,
  FiStar,
  FiZap,
} from "react-icons/fi";
import { getSupabase } from "./supabase";
import { makeOperationId, todayBelem, useOperationsStore } from "./operations-data";
import { makeResourceId } from "./netzos-data";
import {
  logAudit,
  type AutomationWorkflow,
  type NetsRequest,
  useReferenceData,
} from "./reference-data";

type Tool =
  | "overdue_tasks"
  | "agenda"
  | "search_table"
  | "create_task"
  | "update_task"
  | "reschedule"
  | "draft_automation"
  | "clarify";

const TOOL_LABELS: Record<Tool, string> = {
  overdue_tasks: "Minhas tarefas atrasadas",
  agenda: "Minha agenda",
  search_table: "Buscar em tabela",
  create_task: "Criar tarefa",
  update_task: "Alterar status",
  reschedule: "Reagendar tarefa",
  draft_automation: "Preparar automação",
  clarify: "Esclarecer pedido",
};

function classify(prompt: string): Tool {
  const text = prompt.toLocaleLowerCase("pt-BR");
  if (text.includes("atrasad")) return "overdue_tasks";
  if (text.includes("agenda") || text.includes("compromiss") || text.includes("reuni")) {
    return "agenda";
  }
  if (text.includes("buscar") || text.includes("pesquisar") || text.includes("tabela")) {
    return "search_table";
  }
  if (text.includes("criar") && text.includes("tarefa")) return "create_task";
  if (
    text.includes("concluir") ||
    text.includes("status") ||
    text.includes("andamento")
  ) {
    return "update_task";
  }
  if (text.includes("reagendar") || text.includes("remarcar")) return "reschedule";
  if (text.includes("automação") || text.includes("automat")) return "draft_automation";
  return "clarify";
}

function statusLabel(status: NetsRequest["status"]) {
  if (status === "done") return "Concluído";
  if (status === "needs_review") return "Aguardando revisão";
  if (status === "questions") return "Precisa de contexto";
  if (status === "failed") return "Falhou";
  if (status === "cancelled") return "Cancelado";
  if (status === "running") return "Executando";
  return status;
}

export function NetsFeature({
  onOpenAgenda,
  onOpenTasks,
  onOpenAutomations,
}: {
  onOpenAgenda?: () => void;
  onOpenTasks?: () => void;
  onOpenAutomations?: () => void;
}) {
  const reference = useReferenceData();
  const operationsStore = useOperationsStore();
  const { data, userId, ready, error, refresh } = reference;
  const {
    operations,
    organizations,
    workspaces,
    ready: operationsReady,
    refresh: refreshOperations,
  } = operationsStore;

  const [prompt, setPrompt] = useState("");
  const [active, setActive] = useState<{
    id: string;
    tool: Tool;
    status: NetsRequest["status"];
    prompt: string;
  } | null>(null);
  const [organizationId, setOrganizationId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [priority, setPriority] = useState("normal");
  const [taskId, setTaskId] = useState("");
  const [taskStatus, setTaskStatus] = useState("done");
  const [tableId, setTableId] = useState("");
  const [query, setQuery] = useState("");
  const [automationName, setAutomationName] = useState("");
  const [automationTable, setAutomationTable] = useState("");
  const [automationField, setAutomationField] = useState("");
  const [automationFrom, setAutomationFrom] = useState("");
  const [automationTo, setAutomationTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [message, setMessage] = useState("");

  const personalTasks = operations.filter(
    (operation) =>
      operation.kind === "task" &&
      (operation.responsible === "me" || operation.people.includes("me")),
  );

  const requestCountLastHour = data.netsRequests.filter(
    (request) =>
      request.actorId === userId &&
      Date.parse(request.createdAt) > Date.now() - 60 * 60 * 1000,
  ).length;

  const persistRequest = async ({
    id,
    originalPrompt,
    tool,
    status,
    plan = null,
    resultValue = null,
    errorValue = null,
    history = [],
  }: {
    id: string;
    originalPrompt: string;
    tool: Tool;
    status: NetsRequest["status"];
    plan?: any;
    resultValue?: any;
    errorValue?: string | null;
    history?: NetsRequest["history"];
  }) => {
    const supabase = await getSupabase();
    const { error: saveError } = await supabase
      .from("nets_requests")
      .upsert(
        {
          id,
          actor_id: userId,
          organization_id: organizationId || null,
          workspace_id: workspaceId || null,
          prompt: originalPrompt,
          status,
          tool,
          plan,
          result: resultValue,
          error: errorValue,
          history,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
    if (saveError) throw saveError;
  };

  const runReadTool = async (id: string, tool: Tool, originalPrompt: string) => {
    if (tool === "overdue_tasks") {
      const today = todayBelem();
      const rows = personalTasks
        .filter(
          (task) =>
            !!task.date &&
            task.date < today &&
            !["done", "cancelled"].includes(task.status),
        )
        .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
        .slice(0, 100);

      const output = {
        count: rows.length,
        items: rows.map((task) => ({
          id: task.id,
          title: task.title,
          date: task.date,
          priority: task.priority,
          organization:
            organizations.find((item) => item.id === task.organizationId)?.name ||
            "",
          workspace:
            workspaces.find((item) => item.id === task.workspaceId)?.name || "",
        })),
      };

      await persistRequest({
        id,
        originalPrompt,
        tool,
        status: "done",
        resultValue: output,
        history: [
          {
            action: "listed_overdue_tasks",
            created: new Date().toISOString(),
            detail: String(rows.length),
          },
        ],
      });
      setResult(output);
      setActive({ id, tool, status: "done", prompt: originalPrompt });
      await refresh();
      return;
    }

    if (tool === "agenda") {
      const rows = operations
        .filter(
          (item) =>
            !!item.date &&
            (item.responsible === "me" || item.people.includes("me")),
        )
        .sort((a, b) =>
          ((a.date || "") + (a.time || "")).localeCompare(
            (b.date || "") + (b.time || ""),
          ),
        )
        .slice(0, 100);

      const output = {
        count: rows.length,
        items: rows.map((item) => ({
          id: item.id,
          kind: item.kind,
          title: item.title,
          date: item.date,
          time: item.time,
          status: item.status,
        })),
      };

      await persistRequest({
        id,
        originalPrompt,
        tool,
        status: "done",
        resultValue: output,
        history: [
          {
            action: "listed_agenda",
            created: new Date().toISOString(),
            detail: String(rows.length),
          },
        ],
      });
      setResult(output);
      setActive({ id, tool, status: "done", prompt: originalPrompt });
      await refresh();
      return;
    }
  };

  const startRequest = async (event?: FormEvent, shortcut?: Tool) => {
    event?.preventDefault();
    setMessage("");
    setResult(null);

    const originalPrompt =
      shortcut === "overdue_tasks"
        ? "Minhas tarefas atrasadas"
        : shortcut === "agenda"
          ? "Minha agenda"
          : prompt.trim();

    if (!originalPrompt) return;
    if (requestCountLastHour >= 30) {
      setMessage("Limite de 30 novos pedidos por hora atingido.");
      return;
    }

    const tool = shortcut || classify(originalPrompt);
    const id = makeResourceId("nets");

    setBusy(true);
    try {
      if (tool === "overdue_tasks" || tool === "agenda") {
        await runReadTool(id, tool, originalPrompt);
      } else {
        const status: NetsRequest["status"] =
          tool === "clarify" || tool === "search_table"
            ? "questions"
            : "needs_review";
        await persistRequest({
          id,
          originalPrompt,
          tool,
          status,
          plan: { tool },
          history: [
            {
              action: "request_created",
              created: new Date().toISOString(),
              detail: tool,
            },
          ],
        });
        setActive({ id, tool, status, prompt: originalPrompt });
        setResult(null);
        await refresh();
      }
      setPrompt("");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Não foi possível iniciar o pedido.",
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmCreateTask = async () => {
    if (!active || active.tool !== "create_task") return;
    setBusy(true);
    setMessage("");

    try {
      if (!organizationId || !title.trim()) {
        throw new Error("Escolha uma organização e informe o título.");
      }
      const supabase = await getSupabase();
      const operationId = "op_" + active.id;
      const now = new Date().toISOString();

      const { error: taskError } = await supabase.from("operational_items").insert({
        id: operationId,
        kind: "task",
        organization_id: organizationId,
        workspace_id: workspaceId || null,
        title: title.trim(),
        description: description.trim(),
        status: "todo",
        priority,
        visibility: "context",
        date: date || null,
        time: time || null,
        timezone: "America/Belem",
        duration: 60,
        location: "",
        responsible_id: userId,
        origin: "nets",
        creator_id: userId,
        details: {},
        version: 0,
        created_at: now,
        updated_at: now,
      });
      if (taskError) throw taskError;

      const output = { operationId, title: title.trim(), date: date || null };
      await persistRequest({
        id: active.id,
        originalPrompt: active.prompt,
        tool: active.tool,
        status: "done",
        plan: {
          organizationId,
          workspaceId: workspaceId || null,
          title: title.trim(),
          description: description.trim(),
          date: date || null,
          time: time || null,
          priority,
        },
        resultValue: output,
        history: [
          { action: "reviewed", created: now },
          { action: "task_created", created: now, detail: operationId },
        ],
      });

      await logAudit(userId, "nets.task.created", operationId, {
        request: active.id,
      });
      await Promise.all([refresh(), refreshOperations()]);
      setResult(output);
      setActive({ ...active, status: "done" });
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Falha ao criar tarefa.");
    } finally {
      setBusy(false);
    }
  };

  const confirmUpdateTask = async (mode: "status" | "reschedule") => {
    if (!active || !taskId) return;
    setBusy(true);
    setMessage("");

    try {
      const task = personalTasks.find((item) => item.id === taskId);
      if (!task) throw new Error("Tarefa não encontrada.");

      const supabase = await getSupabase();
      const patch =
        mode === "status"
          ? {
              status: taskStatus,
              completed_at: taskStatus === "done" ? new Date().toISOString() : null,
              updated_at: new Date().toISOString(),
              version: (task as any).version ? (task as any).version + 1 : 1,
            }
          : {
              date: date || task.date,
              time: time || task.time,
              updated_at: new Date().toISOString(),
              version: (task as any).version ? (task as any).version + 1 : 1,
            };

      const { error: updateError } = await supabase
        .from("operational_items")
        .update(patch)
        .eq("id", task.id);
      if (updateError) throw updateError;

      const output =
        mode === "status"
          ? { operationId: task.id, status: taskStatus }
          : { operationId: task.id, date: patch.date, time: patch.time };

      await persistRequest({
        id: active.id,
        originalPrompt: active.prompt,
        tool: active.tool,
        status: "done",
        plan: output,
        resultValue: output,
        history: [
          {
            action: mode === "status" ? "task_status_updated" : "task_rescheduled",
            created: new Date().toISOString(),
            detail: task.id,
          },
        ],
      });
      await logAudit(
        userId,
        mode === "status" ? "nets.task.status" : "nets.task.rescheduled",
        task.id,
        { request: active.id },
      );
      await Promise.all([refresh(), refreshOperations()]);
      setResult(output);
      setActive({ ...active, status: "done" });
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Não foi possível atualizar.");
    } finally {
      setBusy(false);
    }
  };

  const searchTable = async () => {
    if (!active || active.tool !== "search_table" || !tableId) return;
    const table = data.tables.find((item) => item.id === tableId);
    if (!table) return;

    const normalized = query.toLocaleLowerCase("pt-BR");
    const rows = data.records
      .filter((record) => record.tableId === table.id)
      .filter(
        (record) =>
          !normalized ||
          Object.values(record.values).some((value) =>
            String(Array.isArray(value) ? value.join(" ") : value ?? "")
              .toLocaleLowerCase("pt-BR")
              .includes(normalized),
          ),
      )
      .slice(0, 50);

    const output = {
      table: table.name,
      count: rows.length,
      records: rows.map((record) => ({
        id: record.id,
        values: record.values,
      })),
    };

    try {
      await persistRequest({
        id: active.id,
        originalPrompt: active.prompt,
        tool: active.tool,
        status: "done",
        plan: { tableId, query },
        resultValue: output,
        history: [
          {
            action: "table_searched",
            created: new Date().toISOString(),
            detail: table.id,
          },
        ],
      });
      setResult(output);
      setActive({ ...active, status: "done" });
      await refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Falha na pesquisa.");
    }
  };

  const createAutomationDraft = async () => {
    if (!active || active.tool !== "draft_automation") return;
    setBusy(true);
    setMessage("");

    try {
      const table = data.tables.find((item) => item.id === automationTable);
      if (!table || !automationField) {
        throw new Error("Selecione uma tabela e um campo.");
      }

      const supabase = await getSupabase();
      const workflowId = makeResourceId("automation");
      const definition: AutomationWorkflow["definition"] = {
        version: 1,
        triggers: [
          {
            source: table.id,
            field: automationField,
            from: automationFrom,
            to: automationTo,
          },
        ],
        action: {
          kind: "task",
          connection: null,
          recipient: "me",
          message: "Revisar alteração em " + table.name,
        },
        description: "Rascunho preparado pela Nets",
      };

      const { error: workflowError } = await supabase
        .from("automation_workflows")
        .insert({
          id: workflowId,
          actor_id: userId,
          name: automationName.trim() || "Automação · " + table.name,
          description: "Rascunho preparado pela Nets",
          definition,
          status: "draft",
          version: 0,
        });
      if (workflowError) throw workflowError;

      const output = { workflowId, name: automationName || "Automação · " + table.name };
      await persistRequest({
        id: active.id,
        originalPrompt: active.prompt,
        tool: active.tool,
        status: "done",
        plan: definition,
        resultValue: output,
        history: [
          {
            action: "automation_draft_created",
            created: new Date().toISOString(),
            detail: workflowId,
          },
        ],
      });
      await Promise.all([refresh()]);
      setResult(output);
      setActive({ ...active, status: "done" });
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Não foi possível criar o rascunho.",
      );
    } finally {
      setBusy(false);
    }
  };

  const activeTable = data.tables.find((item) => item.id === automationTable);

  if (!ready || !operationsReady) {
    return <div className="ref-feature ref-loading"><div /></div>;
  }

  if (error) {
    return (
      <section className="ref-feature">
        <div className="ref-empty"><FiStar /><h2>Não foi possível carregar a Nets</h2><p>{error}</p></div>
      </section>
    );
  }

  return (
    <section className="ref-feature nets-feature">
      <header className="ref-heading">
        <div>
          <span className="ref-eyebrow">Operational assistant</span>
          <h1>Nets</h1>
          <p>
            Consulte atividades e prepare mudanças usando somente ferramentas
            permitidas. Ações de escrita exigem revisão antes de executar.
          </p>
        </div>
      </header>

      <div className="nets-shortcuts">
        <button
          type="button"
          onClick={() => void startRequest(undefined, "overdue_tasks")}
        >
          <FiClock />
          <strong>Tarefas atrasadas</strong>
          <span>Consulta pessoal</span>
        </button>
        <button type="button" onClick={() => void startRequest(undefined, "agenda")}>
          <FiCalendar />
          <strong>Minha agenda</strong>
          <span>Próximos registros autorizados</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setPrompt("Criar tarefa");
            void startRequest(undefined, "create_task");
          }}
        >
          <FiPlus />
          <strong>Criar tarefa</strong>
          <span>Revisão antes de salvar</span>
        </button>
        <button
          type="button"
          onClick={() => void startRequest(undefined, "draft_automation")}
        >
          <FiZap />
          <strong>Preparar automação</strong>
          <span>Somente rascunho</span>
        </button>
      </div>

      <form className="nets-prompt" onSubmit={(event) => void startRequest(event)}>
        <FiStar />
        <textarea
          value={prompt}
          rows={3}
          maxLength={6000}
          placeholder="O que vamos resolver?"
          onChange={(event) => setPrompt(event.target.value)}
        />
        <button className="ref-button primary" type="submit" disabled={busy || !prompt.trim()}>
          <FiSend />
          Enviar
        </button>
      </form>

      <small className="nets-limit">
        {requestCountLastHour}/30 novos pedidos na última hora
      </small>

      {message && <p className="ref-note">{message}</p>}

      {active && (
        <section className="nets-workbench">
          <header>
            <div>
              <span className="ref-eyebrow">{TOOL_LABELS[active.tool]}</span>
              <h2>{active.prompt}</h2>
            </div>
            <span className="ref-role">{statusLabel(active.status)}</span>
          </header>

          {active.tool === "create_task" && active.status !== "done" && (
            <div className="ref-form">
              <div className="ref-two">
                <label className="ref-field">
                  <span>Organização</span>
                  <select
                    value={organizationId}
                    onChange={(event) => {
                      setOrganizationId(event.target.value);
                      setWorkspaceId("");
                    }}
                  >
                    <option value="">Selecione</option>
                    {organizations.map((organization) => (
                      <option value={organization.id} key={organization.id}>
                        {organization.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ref-field">
                  <span>Workspace opcional</span>
                  <select
                    value={workspaceId}
                    onChange={(event) => setWorkspaceId(event.target.value)}
                  >
                    <option value="">Organização inteira</option>
                    {workspaces
                      .filter((workspace) => workspace.organizationId === organizationId)
                      .map((workspace) => (
                        <option value={workspace.id} key={workspace.id}>
                          {workspace.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <label className="ref-field">
                <span>Título</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>
              <label className="ref-field">
                <span>Descrição</span>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              <div className="ref-three">
                <label className="ref-field">
                  <span>Prazo</span>
                  <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                </label>
                <label className="ref-field">
                  <span>Hora</span>
                  <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
                </label>
                <label className="ref-field">
                  <span>Prioridade</span>
                  <select value={priority} onChange={(event) => setPriority(event.target.value)}>
                    <option value="normal">Normal</option>
                    <option value="important">Importante</option>
                    <option value="urgent">Urgente</option>
                  </select>
                </label>
              </div>

              <div className="nets-review">
                <span>Revisão</span>
                <strong>{title || "Título da tarefa"}</strong>
                <small>
                  {organizations.find((item) => item.id === organizationId)?.name || "Organização"}{" "}
                  ·{" "}
                  {workspaces.find((item) => item.id === workspaceId)?.name ||
                    "organização inteira"}{" "}
                  · responsável: você
                </small>
              </div>

              <button
                className="ref-button primary"
                type="button"
                disabled={busy || !organizationId || !title.trim()}
                onClick={() => void confirmCreateTask()}
              >
                <FiCheckCircle />
                Confirmar criação
              </button>
            </div>
          )}

          {(active.tool === "update_task" || active.tool === "reschedule") &&
            active.status !== "done" && (
              <div className="ref-form">
                <label className="ref-field">
                  <span>Tarefa</span>
                  <select value={taskId} onChange={(event) => setTaskId(event.target.value)}>
                    <option value="">Selecione</option>
                    {personalTasks.map((task) => (
                      <option value={task.id} key={task.id}>
                        {task.title}
                      </option>
                    ))}
                  </select>
                </label>

                {active.tool === "update_task" ? (
                  <label className="ref-field">
                    <span>Novo status</span>
                    <select
                      value={taskStatus}
                      onChange={(event) => setTaskStatus(event.target.value)}
                    >
                      <option value="todo">A fazer</option>
                      <option value="doing">Em andamento</option>
                      <option value="done">Concluída</option>
                      <option value="cancelled">Cancelada</option>
                    </select>
                  </label>
                ) : (
                  <div className="ref-two">
                    <label className="ref-field">
                      <span>Nova data</span>
                      <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                    </label>
                    <label className="ref-field">
                      <span>Nova hora</span>
                      <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
                    </label>
                  </div>
                )}

                <button
                  className="ref-button primary"
                  type="button"
                  disabled={busy || !taskId}
                  onClick={() =>
                    void confirmUpdateTask(
                      active.tool === "update_task" ? "status" : "reschedule",
                    )
                  }
                >
                  Confirmar alteração
                </button>
              </div>
            )}

          {active.tool === "search_table" && active.status !== "done" && (
            <div className="ref-form">
              <label className="ref-field">
                <span>Tabela</span>
                <select value={tableId} onChange={(event) => setTableId(event.target.value)}>
                  <option value="">Selecione</option>
                  {data.tables.map((table) => (
                    <option value={table.id} key={table.id}>
                      {table.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ref-field">
                <span>Pesquisar por</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} />
              </label>
              <button
                className="ref-button primary"
                type="button"
                disabled={!tableId}
                onClick={() => void searchTable()}
              >
                <FiSearch />
                Buscar até 50 registros
              </button>
            </div>
          )}

          {active.tool === "draft_automation" && active.status !== "done" && (
            <div className="ref-form">
              <label className="ref-field">
                <span>Nome</span>
                <input
                  value={automationName}
                  onChange={(event) => setAutomationName(event.target.value)}
                />
              </label>
              <div className="ref-two">
                <label className="ref-field">
                  <span>Tabela</span>
                  <select
                    value={automationTable}
                    onChange={(event) => {
                      setAutomationTable(event.target.value);
                      setAutomationField("");
                    }}
                  >
                    <option value="">Selecione</option>
                    {data.tables.map((table) => (
                      <option value={table.id} key={table.id}>
                        {table.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ref-field">
                  <span>Campo</span>
                  <select
                    value={automationField}
                    onChange={(event) => setAutomationField(event.target.value)}
                  >
                    <option value="">Selecione</option>
                    {activeTable?.fields
                      .filter((field) => !field.archived)
                      .map((field) => (
                        <option value={field.id} key={field.id}>
                          {field.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <div className="ref-two">
                <label className="ref-field">
                  <span>De</span>
                  <input value={automationFrom} onChange={(event) => setAutomationFrom(event.target.value)} />
                </label>
                <label className="ref-field">
                  <span>Para</span>
                  <input value={automationTo} onChange={(event) => setAutomationTo(event.target.value)} />
                </label>
              </div>
              <button
                className="ref-button primary"
                type="button"
                disabled={busy || !automationTable || !automationField}
                onClick={() => void createAutomationDraft()}
              >
                <FiZap />
                Confirmar rascunho
              </button>
            </div>
          )}

          {active.tool === "clarify" && (
            <div className="ref-note">
              O pedido não corresponde a uma ferramenta operacional permitida.
              Tente “tarefas atrasadas”, “minha agenda”, “criar tarefa”, “buscar
              tabela”, “alterar status”, “reagendar” ou “preparar automação”.
            </div>
          )}

          {result && (
            <div className="nets-result">
              <div className="ref-section-heading compact">
                <div>
                  <span className="ref-eyebrow">Resultado</span>
                  <h3>{TOOL_LABELS[active.tool]}</h3>
                </div>
                <FiCheckCircle />
              </div>

              {Array.isArray(result.items) ? (
                <div className="ref-list">
                  {result.items.map((item: any) => (
                    <article key={item.id}>
                      <div className="ref-list-icon">
                        {item.kind ? <FiCalendar /> : <FiClock />}
                      </div>
                      <div>
                        <strong>{item.title}</strong>
                        <span>
                          {[item.date, item.time, item.organization, item.workspace]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : result.records ? (
                <div className="ref-code-result">
                  {result.records.map((record: any) => (
                    <pre key={record.id}>
                      {JSON.stringify(record.values, null, 2)}
                    </pre>
                  ))}
                </div>
              ) : (
                <pre className="ref-code-result">{JSON.stringify(result, null, 2)}</pre>
              )}

              <div className="ref-heading-actions">
                {active.tool === "agenda" && onOpenAgenda && (
                  <button className="ref-button secondary" type="button" onClick={onOpenAgenda}>
                    Abrir Minha Agenda
                  </button>
                )}
                {active.tool === "overdue_tasks" && onOpenTasks && (
                  <button className="ref-button secondary" type="button" onClick={onOpenTasks}>
                    Abrir Minhas tarefas
                  </button>
                )}
                {active.tool === "draft_automation" && onOpenAutomations && (
                  <button className="ref-button secondary" type="button" onClick={onOpenAutomations}>
                    Abrir Automações
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      <div className="ref-section-heading">
        <div><span className="ref-eyebrow">Histórico</span><h3>Últimos pedidos</h3></div>
        <span className="ref-count">{data.netsRequests.length}</span>
      </div>

      <div className="nets-history">
        {data.netsRequests.slice(0, 50).map((request) => (
          <button
            type="button"
            key={request.id}
            onClick={() => {
              setActive({
                id: request.id,
                tool: (request.tool as Tool) || "clarify",
                status: request.status,
                prompt: request.prompt,
              });
              setResult(request.result);
            }}
          >
            <span>{new Date(request.createdAt).toLocaleString("pt-BR")}</span>
            <strong>{request.prompt}</strong>
            <small>
              {request.tool ? TOOL_LABELS[(request.tool as Tool) || "clarify"] : "Pedido"} ·{" "}
              {statusLabel(request.status)}
            </small>
          </button>
        ))}
      </div>
    </section>
  );
}
