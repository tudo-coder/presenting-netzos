"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FiCalendar,
  FiCheckSquare,
  FiChevronLeft,
  FiChevronRight,
  FiMapPin,
  FiPlus,
  FiUsers,
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

function dateMeta(date: string) {
  const value = new Date(date + "T12:00:00Z");
  return {
    day: value.toLocaleDateString("pt-BR", { day: "2-digit", timeZone: "UTC" }),
    weekday: value.toLocaleDateString("pt-BR", { weekday: "long", timeZone: "UTC" }),
    month: value.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }),
  };
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

  const allPersonalItems = useMemo(
    () =>
      operations
        .filter((operation) => operation.date)
        .filter((operation) => operation.responsible === "me" || operation.people.includes("me")),
    [operations]
  );

  const items = useMemo(
    () =>
      allPersonalItems
        .filter((operation) => filters[operation.kind])
        .sort((a, b) => {
          const left = (a.date || "") + (a.time || "00:00");
          const right = (b.date || "") + (b.time || "00:00");
          return left.localeCompare(right);
        }),
    [allPersonalItems, filters]
  );

  const kindCounts = useMemo(
    () =>
      allPersonalItems.reduce<Record<OperationKind, number>>(
        (counts, operation) => {
          counts[operation.kind] += 1;
          return counts;
        },
        { task: 0, meeting: 0, event: 0 }
      ),
    [allPersonalItems]
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
    organizations.find((organization) => organization.id === operation.organizationId)?.name ||
    "Organização";

  const workspaceName = (operation: Operation) =>
    workspaces.find((workspace) => workspace.id === operation.workspaceId)?.name || "";

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

  const periodLabel =
    view === "day"
      ? formatLongDate(cursor)
      : view === "week"
        ? formatLongDate(startOfWeek(cursor)) +
          " — " +
          formatLongDate(addDays(startOfWeek(cursor), 6))
        : new Date(cursor + "T12:00:00Z").toLocaleDateString("pt-BR", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          });

  const renderEvent = (item: Operation) => {
    const KindIcon =
      item.kind === "task" ? FiCheckSquare : item.kind === "meeting" ? FiUsers : FiCalendar;
    const complete = ["done", "held", "cancelled"].includes(item.status);
    const overdue =
      item.kind === "task" &&
      Boolean(item.date && item.date < todayBelem()) &&
      !["done", "cancelled"].includes(item.status);
    const context = [organizationName(item), workspaceName(item)].filter(Boolean).join(" · ");

    return (
      <button
        className={[
          "agenda-item",
          item.kind,
          complete ? "complete" : "",
          overdue ? "overdue" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        type="button"
        key={item.id}
        onClick={() => setEditing(item)}
      >
        <span className="agenda-event-time">{item.time || "Dia todo"}</span>
        <span className="agenda-event-kind" aria-hidden="true">
          <KindIcon />
        </span>
        <span className="agenda-event-copy">
          <strong>{item.title}</strong>
          <small>
            {context}
            {item.location ? (
              <>
                <span className="agenda-meta-separator">·</span>
                <FiMapPin aria-hidden="true" />
                {item.location}
              </>
            ) : null}
          </small>
        </span>
      </button>
    );
  };

  if (!ready) return <div className="ops-feature ops-loading"><div /></div>;

  if (organizations.length === 0) {
    return (
      <section className="ops-feature agenda-premium">
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
    <section className="ops-feature agenda-premium">
      <header className="agenda-premium-header">
        <div className="agenda-title-block">
          <span className="ops-eyebrow">Meu espaço</span>
          <h1>Minha Agenda</h1>
          <p>Seu tempo operacional, reunindo prazos, reuniões e compromissos no mesmo fluxo.</p>
        </div>

        <div className="agenda-create-suite" aria-label="Criar item">
          <button
            className="agenda-create-secondary"
            type="button"
            onClick={() => setCreatingKind("task")}
          >
            <FiCheckSquare aria-hidden="true" />
            Tarefa
          </button>
          <button
            className="agenda-create-secondary"
            type="button"
            onClick={() => setCreatingKind("meeting")}
          >
            <FiUsers aria-hidden="true" />
            Reunião
          </button>
          <button
            className="agenda-create-primary"
            type="button"
            onClick={() => setCreatingKind("event")}
          >
            <FiPlus aria-hidden="true" />
            Novo compromisso
          </button>
        </div>
      </header>

      <div className="agenda-command-bar">
        <div className="agenda-navigation">
          <button type="button" aria-label="Período anterior" onClick={() => move(-1)}>
            <FiChevronLeft aria-hidden="true" />
          </button>
          <button className="today" type="button" onClick={() => setCursor(todayBelem())}>
            Hoje
          </button>
          <button type="button" aria-label="Próximo período" onClick={() => move(1)}>
            <FiChevronRight aria-hidden="true" />
          </button>
        </div>

        <strong className="agenda-period-title">{periodLabel}</strong>

        <div className="agenda-view-switch" aria-label="Visualização da agenda">
          {[
            ["day", "Dia"],
            ["week", "Semana"],
            ["month", "Mês"],
            ["agenda", "Agenda"],
          ].map(([value, label]) => (
            <button
              className={view === value ? "active" : ""}
              type="button"
              key={value}
              onClick={() => setView(value as ViewMode)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="agenda-filter-bar" aria-label="Filtros por tipo">
        {(["task", "meeting", "event"] as OperationKind[]).map((kind) => {
          const KindIcon =
            kind === "task" ? FiCheckSquare : kind === "meeting" ? FiUsers : FiCalendar;
          return (
            <button
              className={"agenda-filter-control " + (filters[kind] ? "active" : "")}
              type="button"
              key={kind}
              aria-pressed={filters[kind]}
              onClick={() =>
                setFilters((current) => ({ ...current, [kind]: !current[kind] }))
              }
            >
              <KindIcon aria-hidden="true" />
              <span>{KIND_LABELS[kind]}</span>
              <small>{kindCounts[kind]}</small>
            </button>
          );
        })}
      </div>

      {view === "day" && (
        <div className="agenda-timeline single-day">
          <section className="agenda-timeline-day">
            <div className="agenda-timeline-date">
              <strong>{dateMeta(cursor).day}</strong>
              <div>
                <span>{dateMeta(cursor).weekday}</span>
                <small>{dateMeta(cursor).month}</small>
              </div>
            </div>
            <div className="agenda-timeline-items">
              {itemsForDate(cursor).length ? (
                itemsForDate(cursor).map(renderEvent)
              ) : (
                <p className="agenda-empty-day">Nada agendado para este dia.</p>
              )}
            </div>
          </section>
        </div>
      )}

      {view === "week" && (
        <div className="agenda-calendar-shell agenda-week-shell">
          <div className="agenda-week-grid">
            {weekDays.map((date) => (
              <section
                className={"agenda-day-column " + (date === todayBelem() ? "today" : "")}
                key={date}
              >
                <header>
                  <span>
                    {new Date(date + "T12:00:00Z").toLocaleDateString("pt-BR", {
                      weekday: "short",
                      timeZone: "UTC",
                    })}
                  </span>
                  <strong>{date.slice(8)}</strong>
                </header>
                <div className="agenda-column-events">{itemsForDate(date).map(renderEvent)}</div>
              </section>
            ))}
          </div>
        </div>
      )}

      {view === "month" && (
        <div className="agenda-calendar-shell agenda-month-shell">
          <div className="agenda-month-grid">
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((label) => (
              <span className="agenda-weekday" key={label}>
                {label}
              </span>
            ))}
            {monthDays.map((date) => {
              const dateItems = itemsForDate(date);
              return (
                <section
                  className={[
                    "agenda-month-day",
                    date.slice(0, 7) !== monthKey ? "muted" : "",
                    date === todayBelem() ? "today" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={date}
                >
                  <header>
                    <strong>{date.slice(8)}</strong>
                  </header>
                  <div className="agenda-month-events">
                    {dateItems.slice(0, 3).map(renderEvent)}
                  </div>
                  {dateItems.length > 3 && (
                    <small className="agenda-more">+{dateItems.length - 3} itens</small>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}

      {view === "agenda" && (
        <div className="agenda-timeline">
          {Object.keys(agendaGroups).length === 0 ? (
            <div className="agenda-empty-timeline">
              <FiCalendar aria-hidden="true" />
              <strong>Nenhum item com data</strong>
              <span>Crie uma tarefa com prazo, reunião ou compromisso.</span>
            </div>
          ) : (
            Object.entries(agendaGroups).map(([date, group]) => {
              const meta = dateMeta(date);
              return (
                <section className="agenda-timeline-day" key={date}>
                  <div className="agenda-timeline-date">
                    <strong>{meta.day}</strong>
                    <div>
                      <span>{meta.weekday}</span>
                      <small>{meta.month}</small>
                    </div>
                  </div>
                  <div className="agenda-timeline-items">{group.map(renderEvent)}</div>
                </section>
              );
            })
          )}
        </div>
      )}

      {(creatingKind || editing) && (
        <OperationDialog
          variant="agenda"
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
