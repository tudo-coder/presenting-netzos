"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FiCalendar,
  FiChevronLeft,
  FiChevronRight,
  FiPlus,
} from "react-icons/fi";
import { OperationDialog } from "./operation-dialog";
import {
  KIND_LABELS,
  addDays,
  formatLongDate,
  startOfWeek,
  todayBelem,
  type Operation,
  type OperationKind,
  useOperationsStore,
} from "./operations-data";

type ViewMode = "day" | "week" | "month" | "agenda";

function monthGrid(date: string) {
  const first = date.slice(0, 7) + "-01";
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

export function MyAgendaFeature({
  onOpenOrganizations,
}: {
  onOpenOrganizations: () => void;
}) {
  const { operations, setOperations, organizations, workspaces, ready } = useOperationsStore();
  const [view, setView] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState(todayBelem());
  const [creatingKind, setCreatingKind] = useState<OperationKind | null>(null);
  const [editing, setEditing] = useState<Operation | null>(null);
  const [filters, setFilters] = useState<Record<OperationKind, boolean>>({
    task: true,
    meeting: true,
    event: true,
  });

  useEffect(() => {
    if (window.matchMedia("(max-width: 760px)").matches) setView("agenda");
  }, []);

  const items = useMemo(
    () =>
      operations
        .filter((operation) => operation.date && filters[operation.kind])
        .filter((operation) => operation.responsible === "me" || operation.people.includes("me"))
        .sort((a, b) => {
          const left = (a.date || "") + (a.time || "00:00");
          const right = (b.date || "") + (b.time || "00:00");
          return left.localeCompare(right);
        }),
    [filters, operations]
  );

  const saveOperation = (operation: Operation) => {
    setOperations((current) => {
      const exists = current.some((item) => item.id === operation.id);
      return exists
        ? current.map((item) => (item.id === operation.id ? operation : item))
        : [operation, ...current];
    });
    setCreatingKind(null);
    setEditing(null);
  };

  const organizationName = (operation: Operation) =>
    organizations.find((organization) => organization.id === operation.organizationId)?.name || "Organização";

  const itemsForDate = (date: string) => items.filter((item) => item.date === date);

  const move = (direction: number) => {
    if (view === "day") setCursor(addDays(cursor, direction));
    else if (view === "week") setCursor(addDays(cursor, direction * 7));
    else if (view === "month") {
      const value = new Date(cursor.slice(0, 7) + "-15T12:00:00Z");
      value.setUTCMonth(value.getUTCMonth() + direction);
      setCursor(value.toISOString().slice(0, 10));
    } else setCursor(addDays(cursor, direction * 7));
  };

  const renderEvent = (item: Operation) => (
    <button
      className={"agenda-item " + item.kind + (["done", "held", "cancelled"].includes(item.status) ? " complete" : "")}
      type="button"
      key={item.id}
      onClick={() => setEditing(item)}
    >
      <span>{item.time || "Dia todo"}</span>
      <strong>{item.title}</strong>
      <small>{organizationName(item)} · {KIND_LABELS[item.kind]}</small>
    </button>
  );

  if (!ready) return <div className="ops-feature ops-loading"><div /></div>;

  if (organizations.length === 0) {
    return (
      <section className="ops-feature">
        <header className="ops-heading">
          <div>
            <span className="ops-eyebrow">Meu espaço</span>
            <h1>Minha Agenda</h1>
            <p>Todos os seus compromissos e prazos, atravessando as organizações.</p>
          </div>
        </header>
        <div className="ops-empty">
          <FiCalendar aria-hidden="true" />
          <h2>Crie uma organização primeiro</h2>
          <p>A agenda projeta tarefas, reuniões e compromissos dos contextos que você criar.</p>
          <button className="ops-button primary" type="button" onClick={onOpenOrganizations}>
            Ir para Organizações
          </button>
        </div>
      </section>
    );
  }

  const weekStart = startOfWeek(cursor);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const monthDays = monthGrid(cursor);
  const monthKey = cursor.slice(0, 7);
  const agendaGroups = items.reduce<Record<string, Operation[]>>((groups, item) => {
    if (!item.date) return groups;
    if (!groups[item.date]) groups[item.date] = [];
    groups[item.date].push(item);
    return groups;
  }, {});

  return (
    <section className="ops-feature">
      <header className="ops-heading agenda-heading">
        <div>
          <span className="ops-eyebrow">Meu espaço</span>
          <h1>Minha Agenda</h1>
          <p>Tarefas com prazo, reuniões e compromissos são os mesmos registros operacionais vistos no calendário.</p>
        </div>

        <div className="agenda-create">
          <button className="ops-button secondary" type="button" onClick={() => setCreatingKind("task")}>
            <FiPlus /> Tarefa
          </button>
          <button className="ops-button secondary" type="button" onClick={() => setCreatingKind("meeting")}>
            <FiPlus /> Reunião
          </button>
          <button className="ops-button primary" type="button" onClick={() => setCreatingKind("event")}>
            <FiPlus /> Compromisso
          </button>
        </div>
      </header>

      <div className="agenda-toolbar">
        <div className="agenda-period">
          <button type="button" aria-label="Anterior" onClick={() => move(-1)}><FiChevronLeft /></button>
          <button type="button" className="today" onClick={() => setCursor(todayBelem())}>Hoje</button>
          <button type="button" aria-label="Próximo" onClick={() => move(1)}><FiChevronRight /></button>
          <strong>
            {view === "day"
              ? formatLongDate(cursor)
              : view === "week"
                ? formatLongDate(weekStart) + " — " + formatLongDate(addDays(weekStart, 6))
                : new Date(cursor + "T12:00:00Z").toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })}
          </strong>
        </div>

        <div className="agenda-view-switch">
          {[
            ["day", "Dia"],
            ["week", "Semana"],
            ["month", "Mês"],
            ["agenda", "Agenda"],
          ].map(([value, label]) => (
            <button className={view === value ? "active" : ""} type="button" key={value} onClick={() => setView(value as ViewMode)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="agenda-filters">
        {(["task", "meeting", "event"] as OperationKind[]).map((kind) => (
          <label key={kind}>
            <input
              type="checkbox"
              checked={filters[kind]}
              onChange={(event) => setFilters((current) => ({ ...current, [kind]: event.target.checked }))}
            />
            {KIND_LABELS[kind]}
          </label>
        ))}
      </div>

      {view === "day" && (
        <div className="agenda-list-view">
          <header><h2>{formatLongDate(cursor)}</h2><span>{itemsForDate(cursor).length} itens</span></header>
          {itemsForDate(cursor).length ? itemsForDate(cursor).map(renderEvent) : <p className="agenda-empty-day">Nada agendado para este dia.</p>}
        </div>
      )}

      {view === "week" && (
        <div className="agenda-scroll">
          <div className="agenda-week-grid">
            {weekDays.map((date) => (
              <section className={"agenda-day-column " + (date === todayBelem() ? "today" : "")} key={date}>
                <header>
                  <span>{new Date(date + "T12:00:00Z").toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" })}</span>
                  <strong>{date.slice(8)}</strong>
                </header>
                <div>{itemsForDate(date).map(renderEvent)}</div>
              </section>
            ))}
          </div>
        </div>
      )}

      {view === "month" && (
        <div className="agenda-scroll">
          <div className="agenda-month-grid">
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((label) => <span className="agenda-weekday" key={label}>{label}</span>)}
            {monthDays.map((date) => (
              <section className={"agenda-month-day " + (date.slice(0, 7) !== monthKey ? "muted " : "") + (date === todayBelem() ? "today" : "")} key={date}>
                <header><strong>{date.slice(8)}</strong></header>
                <div>{itemsForDate(date).slice(0, 3).map(renderEvent)}</div>
                {itemsForDate(date).length > 3 && <small className="agenda-more">+{itemsForDate(date).length - 3} itens</small>}
              </section>
            ))}
          </div>
        </div>
      )}

      {view === "agenda" && (
        <div className="agenda-list-view grouped">
          {Object.keys(agendaGroups).length === 0 ? (
            <p className="agenda-empty-day">Nenhum item com data ainda.</p>
          ) : (
            Object.entries(agendaGroups).map(([date, group]) => (
              <section key={date}>
                <header><h2>{formatLongDate(date)}</h2><span>{group.length} itens</span></header>
                {group.map(renderEvent)}
              </section>
            ))
          )}
        </div>
      )}

      {(creatingKind || editing) && (
        <OperationDialog
          kind={editing?.kind || creatingKind || "event"}
          operation={editing}
          organizations={organizations}
          workspaces={workspaces}
          initialDate={cursor}
          onClose={() => {
            setCreatingKind(null);
            setEditing(null);
          }}
          onSave={saveOperation}
        />
      )}
    </section>
  );
}
