"use client";

import { useMemo, useState } from "react";
import {
  FiCheck,
  FiCheckSquare,
  FiColumns,
  FiList,
  FiPlus,
  FiSearch,
} from "react-icons/fi";
import { OperationDialog } from "./operation-dialog";
import {
  PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type Operation,
  type TaskStatus,
  formatDate,
  todayBelem,
  useOperationsStore,
} from "./operations-data";

type TaskTab = "all" | "mine" | "doing" | "done";
type LayoutMode = "list" | "board";

export function MyTasksFeature({
  onOpenOrganizations,
}: {
  onOpenOrganizations: () => void;
}) {
  const { operations, saveOperation: persistOperation, updateOperationStatus, organizations, workspaces, ready, error } = useOperationsStore();
  const [tab, setTab] = useState<TaskTab>("all");
  const [layout, setLayout] = useState<LayoutMode>("list");
  const [search, setSearch] = useState("");
  const [workspaceFilter, setWorkspaceFilter] = useState("");
  const [dueFilter, setDueFilter] = useState<"all" | "today" | "overdue">("all");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [editing, setEditing] = useState<Operation | null>(null);
  const [creating, setCreating] = useState(false);

  const tasks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    const today = todayBelem();

    return operations
      .filter((operation) => operation.kind === "task")
      .filter((operation) => operation.responsible === "me" || operation.people.includes("me"))
      .filter((operation) => {
        if (tab === "doing") return operation.status === "doing";
        if (tab === "done") return operation.status === "done";
        return true;
      })
      .filter((operation) => !query || operation.title.toLocaleLowerCase("pt-BR").includes(query))
      .filter((operation) => !workspaceFilter || operation.workspaceId === workspaceFilter)
      .filter((operation) => !priorityFilter || operation.priority === priorityFilter)
      .filter((operation) => {
        if (dueFilter === "today") return operation.date === today;
        if (dueFilter === "overdue") {
          return Boolean(operation.date && operation.date < today && !["done", "cancelled"].includes(operation.status));
        }
        return true;
      })
      .sort((a, b) => {
        const left = a.date || "9999-12-31";
        const right = b.date || "9999-12-31";
        return left.localeCompare(right) || a.createdAt.localeCompare(b.createdAt);
      });
  }, [dueFilter, operations, priorityFilter, search, tab, workspaceFilter]);

  const saveOperation = async (operation: Operation) => {
    await persistOperation(operation);
    setCreating(false);
    setEditing(null);
  };

  const updateStatus = async (task: Operation, status: TaskStatus) => {
    await updateOperationStatus(task, status);
  };

  const contextLabel = (task: Operation) => {
    const organization = organizations.find((item) => item.id === task.organizationId);
    const workspace = workspaces.find((item) => item.id === task.workspaceId);
    return [organization?.name, workspace?.name].filter(Boolean).join(" · ") || "Sem contexto";
  };

  if (!ready) return <div className="ops-feature ops-loading"><div /></div>;

  if (error) return <div className="ops-feature"><div className="ops-empty compact"><h2>Não foi possível carregar suas tarefas</h2><p>{error}</p></div></div>;

  if (organizations.length === 0) {
    return (
      <section className="ops-feature">
        <header className="ops-heading">
          <div>
            <span className="ops-eyebrow">Meu espaço</span>
            <h1>Minhas tarefas</h1>
            <p>Todas as suas organizações, com o contexto de cada atividade.</p>
          </div>
        </header>
        <div className="ops-empty">
          <FiCheckSquare aria-hidden="true" />
          <h2>Crie uma organização primeiro</h2>
          <p>As tarefas precisam nascer dentro de uma organização ou de um workspace.</p>
          <button className="ops-button primary" type="button" onClick={onOpenOrganizations}>
            Ir para Organizações
          </button>
        </div>
      </section>
    );
  }

  const columns: Array<{ status: TaskStatus; label: string }> = [
    { status: "todo", label: "A fazer" },
    { status: "doing", label: "Em andamento" },
    { status: "done", label: "Concluídas" },
  ];

  return (
    <section className="ops-feature">
      <header className="ops-heading">
        <div>
          <span className="ops-eyebrow">Meu espaço</span>
          <h1>Minhas tarefas</h1>
          <p>Todas as suas organizações, com o contexto de cada atividade.</p>
        </div>
        <button className="ops-button primary" type="button" onClick={() => setCreating(true)}>
          <FiPlus aria-hidden="true" />
          Nova tarefa
        </button>
      </header>

      <div className="task-tabs">
        {[
          ["all", "Todas"],
          ["mine", "Minhas"],
          ["doing", "Em andamento"],
          ["done", "Concluídas"],
        ].map(([value, label]) => (
          <button
            className={tab === value ? "active" : ""}
            type="button"
            key={value}
            onClick={() => setTab(value as TaskTab)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="task-toolbar">
        <label className="ops-search">
          <FiSearch aria-hidden="true" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar tarefas…" />
        </label>

        <select value={workspaceFilter} onChange={(event) => setWorkspaceFilter(event.target.value)}>
          <option value="">Todos os workspaces</option>
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
          ))}
        </select>

        <select value={dueFilter} onChange={(event) => setDueFilter(event.target.value as typeof dueFilter)}>
          <option value="all">Qualquer prazo</option>
          <option value="today">Hoje</option>
          <option value="overdue">Atrasadas</option>
        </select>

        <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
          <option value="">Todas as prioridades</option>
          <option value="normal">Normal</option>
          <option value="important">Importante</option>
          <option value="urgent">Urgente</option>
        </select>

        <div className="layout-switch">
          <button className={layout === "list" ? "active" : ""} type="button" aria-label="Lista" onClick={() => setLayout("list")}>
            <FiList />
          </button>
          <button className={layout === "board" ? "active" : ""} type="button" aria-label="Quadro" onClick={() => setLayout("board")}>
            <FiColumns />
          </button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="ops-empty compact">
          <FiCheckSquare aria-hidden="true" />
          <h2>Nenhuma tarefa por aqui</h2>
          <p>Crie uma tarefa ou ajuste os filtros.</p>
        </div>
      ) : layout === "list" ? (
        <div className="task-list">
          {tasks.map((task) => (
            <article className="task-row" key={task.id}>
              <button
                className={"task-check " + (task.status === "done" ? "done" : "")}
                type="button"
                aria-label={task.status === "done" ? "Reabrir tarefa" : "Concluir tarefa"}
                onClick={() => updateStatus(task, task.status === "done" ? "todo" : "done")}
              >
                {task.status === "done" && <FiCheck />}
              </button>

              <button className="task-copy" type="button" onClick={() => setEditing(task)}>
                <strong className={task.status === "done" ? "done" : ""}>{task.title}</strong>
                <span>{contextLabel(task)}</span>
              </button>

              <span className={"priority-pill " + task.priority}>{PRIORITY_LABELS[task.priority]}</span>
              <span className={"task-due " + (task.date && task.date < todayBelem() && !["done", "cancelled"].includes(task.status) ? "overdue" : "")}>
                {task.date ? formatDate(task.date) + (task.time ? " · " + task.time : "") : "Sem prazo"}
              </span>

              <select
                className="task-status"
                value={task.status}
                onChange={(event) => updateStatus(task, event.target.value as TaskStatus)}
              >
                {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </article>
          ))}
        </div>
      ) : (
        <div className="task-board">
          {columns.map((column) => {
            const columnTasks = tasks.filter((task) => task.status === column.status);
            return (
              <section className="task-column" key={column.status}>
                <header>
                  <strong>{column.label}</strong>
                  <span>{columnTasks.length}</span>
                </header>
                <div>
                  {columnTasks.map((task) => (
                    <button className="task-card" type="button" key={task.id} onClick={() => setEditing(task)}>
                      <strong>{task.title}</strong>
                      <span>{contextLabel(task)}</span>
                      <small>{task.date ? formatDate(task.date) : "Sem prazo"}</small>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <OperationDialog
          kind="task"
          operation={editing}
          organizations={organizations}
          workspaces={workspaces}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={saveOperation}
        />
      )}
    </section>
  );
}
