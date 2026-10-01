"use client";

import { useMemo, useState } from "react";
import { FiX } from "react-icons/fi";
import {
  type Operation,
  type OperationKind,
  type OrganizationRef,
  type Priority,
  type WorkspaceRef,
  makeOperationId,
  todayBelem,
} from "./operations-data";

export function OperationDialog({
  variant = "default",
  kind,
  operation,
  organizations,
  workspaces,
  initialDate,
  onClose,
  onSave,
}: {
  variant?: "default" | "agenda";
  kind: OperationKind;
  operation?: Operation | null;
  organizations: OrganizationRef[];
  workspaces: WorkspaceRef[];
  initialDate?: string;
  onClose: () => void;
  onSave: (operation: Operation) => void | Promise<void>;
}) {
  const [title, setTitle] = useState(operation?.title || "");
  const [description, setDescription] = useState(operation?.description || "");
  const [organizationId, setOrganizationId] = useState(
    operation?.organizationId || organizations[0]?.id || ""
  );
  const [workspaceId, setWorkspaceId] = useState(operation?.workspaceId || "");
  const [priority, setPriority] = useState<Priority>(operation?.priority || "normal");
  const [date, setDate] = useState(operation?.date || initialDate || (kind === "task" ? "" : todayBelem()));
  const [time, setTime] = useState(operation?.time || "");
  const [endDate, setEndDate] = useState(operation?.endDate || "");
  const [endTime, setEndTime] = useState(operation?.endTime || "");
  const [location, setLocation] = useState(operation?.location || "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const filteredWorkspaces = useMemo(
    () => workspaces.filter((workspace) => workspace.organizationId === organizationId),
    [organizationId, workspaces]
  );

  const contextLocked = Boolean(operation);
  const titleLabel =
    kind === "task" ? "Tarefa" : kind === "meeting" ? "Reunião" : "Compromisso";

  return (
    <div className="ops-modal-backdrop" onMouseDown={onClose}>
      <section
        className={`ops-modal ${variant === "agenda" ? "agenda-ops-modal" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={operation ? "Editar " + titleLabel : "Nova " + titleLabel}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="ops-modal-header">
          <div>
            <span>{operation ? "Editar" : "Criar"}</span>
            <h2>{operation ? operation.title : titleLabel}</h2>
            <p>O contexto de organização e workspace fica fixo depois da criação.</p>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose}>
            <FiX aria-hidden="true" />
          </button>
        </header>

        <form
          className="ops-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!title.trim() || !organizationId || saving) return;
            const now = new Date().toISOString();
            setSaving(true);
            setSaveError(null);

            try {
              await onSave({
                id: operation?.id || makeOperationId(),
                kind,
                organizationId,
                workspaceId: workspaceId || null,
                title: title.trim(),
                description: description.trim(),
                status: operation?.status || (kind === "task" ? "todo" : "scheduled"),
                priority,
                visibility: operation?.visibility || "context",
                date: date || null,
                time: time || null,
                endDate: endDate || null,
                endTime: endTime || null,
                timezone: "America/Belem",
                duration: operation?.duration || 60,
                location: location.trim(),
                responsible: "me",
                responsibleId: operation?.responsibleId || null,
                people: operation?.people || [],
                participantIds: operation?.participantIds || [],
                meetingId: operation?.meetingId || null,
                origin: operation?.origin || "manual",
                creatorId: operation?.creatorId || "",
                details: operation?.details || {
                  checklist: [],
                  topics: [],
                  summary: "",
                  decisions: "",
                  notes: "",
                  previousMeetingId: null,
                },
                version: operation?.version || 0,
                createdAt: operation?.createdAt || now,
                updatedAt: now,
                completedAt: operation?.completedAt || null,
              });
            } catch (cause) {
              setSaveError(
                cause instanceof Error
                  ? cause.message
                  : "Não foi possível salvar no Supabase.",
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          <label className="ops-field full">
            <span>Título</span>
            <input
              autoFocus
              value={title}
              maxLength={180}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={kind === "task" ? "O que precisa ser feito?" : "Título"}
            />
          </label>

          <div className="ops-form-grid">
            <label className="ops-field">
              <span>Organização</span>
              <select
                value={organizationId}
                disabled={contextLocked}
                onChange={(event) => {
                  setOrganizationId(event.target.value);
                  setWorkspaceId("");
                }}
              >
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="ops-field">
              <span>Workspace</span>
              <select
                value={workspaceId}
                disabled={contextLocked}
                onChange={(event) => setWorkspaceId(event.target.value)}
              >
                <option value="">Organização inteira</option>
                {filteredWorkspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>

            {kind === "task" && (
              <label className="ops-field">
                <span>Prioridade</span>
                <select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
                  <option value="normal">Normal</option>
                  <option value="important">Importante</option>
                  <option value="urgent">Urgente</option>
                </select>
              </label>
            )}

            <label className="ops-field">
              <span>{kind === "task" ? "Prazo" : "Data"}</span>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>

            <label className="ops-field">
              <span>Hora</span>
              <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
            </label>

            {kind !== "task" && (
              <>
                <label className="ops-field">
                  <span>Data final</span>
                  <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                </label>
                <label className="ops-field">
                  <span>Hora final</span>
                  <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
                </label>
                <label className="ops-field full">
                  <span>Local</span>
                  <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Opcional" />
                </label>
              </>
            )}

            <label className="ops-field full">
              <span>Descrição</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Detalhes opcionais" />
            </label>
          </div>

          {saveError && <p className="auth-feedback error">{saveError}</p>}

          <div className="ops-form-actions">
            <button className="ops-button secondary" type="button" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button className="ops-button primary" type="submit" disabled={saving || !title.trim() || !organizationId}>
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
