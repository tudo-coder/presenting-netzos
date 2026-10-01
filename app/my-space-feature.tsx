"use client";

import { useMemo } from "react";
import {
  FiArrowRight,
  FiBriefcase,
  FiCalendar,
  FiCheckSquare,
  FiClock,
  FiGrid,
  FiLayout,
  FiSparkles,
  FiUsers,
} from "react-icons/fi";
import {
  formatDate,
  todayBelem,
  useOperationsStore,
} from "./operations-data";
import { useReferenceData } from "./reference-data";

export function MySpaceFeature({
  onOpenTasks,
  onOpenAgenda,
  onOpenOrganizations,
  onOpenData,
  onOpenSystems,
  onOpenShared,
  onOpenNets,
}: {
  onOpenTasks: () => void;
  onOpenAgenda: () => void;
  onOpenOrganizations: () => void;
  onOpenData: () => void;
  onOpenSystems: () => void;
  onOpenShared: () => void;
  onOpenNets: () => void;
}) {
  const operations = useOperationsStore();
  const reference = useReferenceData();

  const today = todayBelem();

  const personal = useMemo(
    () =>
      operations.operations.filter(
        (item) =>
          item.responsible === "me" || item.people.includes("me"),
      ),
    [operations.operations],
  );

  const overdue = useMemo(
    () =>
      personal
        .filter(
          (item) =>
            item.kind === "task" &&
            !!item.date &&
            item.date < today &&
            !["done", "cancelled"].includes(item.status),
        )
        .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
        .slice(0, 6),
    [personal, today],
  );

  const nextItems = useMemo(
    () =>
      personal
        .filter(
          (item) =>
            !!item.date &&
            item.date >= today &&
            !["cancelled", "done"].includes(item.status),
        )
        .sort((a, b) =>
          ((a.date || "") + (a.time || "")).localeCompare(
            (b.date || "") + (b.time || ""),
          ),
        )
        .slice(0, 7),
    [personal, today],
  );

  const pendingInvites = reference.data.grants.filter(
    (grant) =>
      !grant.acceptedAt &&
      !grant.userId &&
      grant.email.toLowerCase() === reference.email.toLowerCase() &&
      Date.parse(grant.expiresAt) > Date.now(),
  );

  if (!operations.ready || !reference.ready) {
    return <div className="ref-feature ref-loading"><div /></div>;
  }

  return (
    <section className="ref-feature my-space-feature">
      <header className="my-space-hero">
        <div>
          <span className="ref-eyebrow">Meu espaço</span>
          <h1>O que vamos resolver?</h1>
          <p>
            Seu contexto pessoal de tarefas, agenda, organizações, dados e
            sistemas — sem duplicar o que já existe nos workspaces.
          </p>
        </div>

        <button className="nets-home-prompt" type="button" onClick={onOpenNets}>
          <FiSparkles />
          <span>
            <strong>Pedir para a Nets</strong>
            <small>Consultar, preparar ou revisar uma ação operacional</small>
          </span>
          <FiArrowRight />
        </button>
      </header>

      {pendingInvites.length > 0 && (
        <button className="home-invite-notice" type="button" onClick={onOpenShared}>
          <FiUsers />
          <span>
            <strong>
              {pendingInvites.length} convite{pendingInvites.length === 1 ? "" : "s"} pendente
              {pendingInvites.length === 1 ? "" : "s"}
            </strong>
            <small>Compartilhados comigo</small>
          </span>
          <FiArrowRight />
        </button>
      )}

      <div className="home-summary-grid">
        <button type="button" onClick={onOpenTasks}>
          <FiCheckSquare />
          <span>Tarefas atrasadas</span>
          <strong>{overdue.length}</strong>
        </button>
        <button type="button" onClick={onOpenAgenda}>
          <FiCalendar />
          <span>Próximos itens</span>
          <strong>{nextItems.length}</strong>
        </button>
        <button type="button" onClick={onOpenOrganizations}>
          <FiBriefcase />
          <span>Organizações</span>
          <strong>{reference.data.organizations.length}</strong>
        </button>
        <button type="button" onClick={onOpenSystems}>
          <FiLayout />
          <span>Sistemas</span>
          <strong>{reference.data.systems.length}</strong>
        </button>
      </div>

      <div className="home-columns">
        <section className="home-panel">
          <header className="ref-section-heading compact">
            <div>
              <span className="ref-eyebrow">Prioridade</span>
              <h3>Tarefas que pedem atenção</h3>
            </div>
            <button type="button" className="ref-text-button" onClick={onOpenTasks}>
              Ver tarefas
            </button>
          </header>

          {overdue.length ? (
            <div className="home-operation-list">
              {overdue.map((item) => (
                <button type="button" key={item.id} onClick={onOpenTasks}>
                  <span className="home-operation-icon overdue">
                    <FiClock />
                  </span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>
                      {item.date ? formatDate(item.date) : "Sem prazo"} ·{" "}
                      {operations.organizations.find(
                        (organization) => organization.id === item.organizationId,
                      )?.name || "Organização"}
                    </small>
                  </div>
                  <span className={"priority-pill " + item.priority}>
                    {item.priority === "urgent"
                      ? "Urgente"
                      : item.priority === "important"
                        ? "Importante"
                        : "Normal"}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="ref-empty compact">
              <FiCheckSquare />
              <h3>Nenhuma tarefa atrasada</h3>
              <p>As próximas atividades aparecem ao lado.</p>
            </div>
          )}
        </section>

        <section className="home-panel">
          <header className="ref-section-heading compact">
            <div>
              <span className="ref-eyebrow">Agenda</span>
              <h3>Próximos compromissos</h3>
            </div>
            <button type="button" className="ref-text-button" onClick={onOpenAgenda}>
              Abrir agenda
            </button>
          </header>

          {nextItems.length ? (
            <div className="home-operation-list">
              {nextItems.map((item) => (
                <button type="button" key={item.id} onClick={onOpenAgenda}>
                  <span className="home-operation-icon">
                    <FiCalendar />
                  </span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>
                      {item.date ? formatDate(item.date) : ""}{" "}
                      {item.time ? "· " + item.time : ""} ·{" "}
                      {item.kind === "task"
                        ? "Tarefa"
                        : item.kind === "meeting"
                          ? "Reunião"
                          : "Compromisso"}
                    </small>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="ref-empty compact">
              <FiCalendar />
              <h3>Nada agendado</h3>
              <p>Crie tarefas com prazo, reuniões ou compromissos.</p>
            </div>
          )}
        </section>
      </div>

      <section className="home-build-section">
        <div>
          <span className="ref-eyebrow">Construir no NetzOS</span>
          <h2>Transforme dados em um sistema operacional do seu trabalho.</h2>
          <p>
            Comece por tabelas/formulários, monte dashboards e organize telas no
            System Builder.
          </p>
        </div>
        <div className="home-build-actions">
          <button className="ref-button secondary" type="button" onClick={onOpenData}>
            <FiGrid />
            Dados
          </button>
          <button className="ref-button primary" type="button" onClick={onOpenSystems}>
            <FiLayout />
            Sistemas
          </button>
        </div>
      </section>
    </section>
  );
}
