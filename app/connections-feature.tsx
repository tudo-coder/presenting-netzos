"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  FiCalendar,
  FiDatabase,
  FiDownload,
  FiLink2,
  FiMail,
  FiMessageCircle,
  FiPlus,
  FiRefreshCw,
  FiSave,
  FiTrash2,
} from "react-icons/fi";
import { getSupabase } from "./supabase";
import { makeResourceId } from "./netzos-data";
import { useOperationsStore } from "./operations-data";
import {
  logAudit,
  type IntegrationConnection,
  useReferenceData,
} from "./reference-data";

type ConnectionTab = "data" | "channels" | "calendar";

const PROVIDERS: Array<{
  id: IntegrationConnection["provider"];
  label: string;
  category: ConnectionTab;
  description: string;
}> = [
  {
    id: "supabase",
    label: "Supabase",
    category: "data",
    description: "Prepare um projeto/tabela como fonte de dados externa.",
  },
  {
    id: "database",
    label: "Banco SQL",
    category: "data",
    description: "Registre a referência de um banco para integração futura.",
  },
  {
    id: "api",
    label: "API",
    category: "data",
    description: "Registre um endpoint ou recurso para integração futura.",
  },
  {
    id: "sheets",
    label: "Google Sheets",
    category: "data",
    description: "Prepare uma planilha para descoberta/sincronização futura.",
  },
  {
    id: "drive",
    label: "Google Drive",
    category: "data",
    description: "Prepare uma pasta ou arquivo para integração futura.",
  },
  {
    id: "email",
    label: "E-mail",
    category: "channels",
    description: "Referência de canal para ações de automação.",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    category: "channels",
    description: "Canal em preparação; não solicita senha nem token no browser.",
  },
  {
    id: "telegram",
    label: "Telegram",
    category: "channels",
    description: "Canal em preparação para integração oficial.",
  },
  {
    id: "google_calendar",
    label: "Google Agenda",
    category: "calendar",
    description: "Exportação ICS funciona agora; OAuth/sincronização fica preparada.",
  },
];

function escapeIcs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function foldIcsLine(line: string) {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";

  for (const char of line) {
    const candidate = current + char;
    if (encoder.encode(candidate).length > 73 && current) {
      parts.push(current);
      current = " " + char;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  return parts.join("\r\n");
}

function utcStamp(date: string, time: string | null, timezone: string) {
  const local = time || "00:00";
  const candidate = new Date(date + "T" + local + ":00");
  if (Number.isNaN(candidate.getTime())) return "";
  // Browser timezone conversion is used only for export. TZ is recorded in description.
  return candidate
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function addMinutesUtc(stamp: string, minutes: number) {
  if (!stamp) return "";
  const iso =
    stamp.slice(0, 4) +
    "-" +
    stamp.slice(4, 6) +
    "-" +
    stamp.slice(6, 8) +
    "T" +
    stamp.slice(9, 11) +
    ":" +
    stamp.slice(11, 13) +
    ":" +
    stamp.slice(13, 15) +
    "Z";
  const value = new Date(iso);
  value.setUTCMinutes(value.getUTCMinutes() + minutes);
  return value
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function downloadAgendaIcs(
  operations: ReturnType<typeof useOperationsStore>["operations"],
  organizations: ReturnType<typeof useOperationsStore>["organizations"],
  workspaces: ReturnType<typeof useOperationsStore>["workspaces"],
) {
  const now = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

  const events = operations
    .filter((item) => !!item.date)
    .filter(
      (item) =>
        item.responsible === "me" ||
        item.people.includes("me"),
    )
    .map((item) => {
      const organization = organizations.find(
        (value) => value.id === item.organizationId,
      );
      const workspace = workspaces.find((value) => value.id === item.workspaceId);
      const uid = item.id + "@netzos";
      const start = utcStamp(item.date!, item.time, item.timezone);
      const end =
        item.endDate && item.endTime
          ? utcStamp(item.endDate, item.endTime, item.timezone)
          : addMinutesUtc(start, item.kind === "task" ? 30 : 60);
      const description = [
        item.description,
        organization?.name ? "Organização: " + organization.name : "",
        workspace?.name ? "Workspace: " + workspace.name : "",
        "Origem: NetzOS",
        "Fuso registrado: " + item.timezone,
      ]
        .filter(Boolean)
        .join("\n");

      return [
        "BEGIN:VEVENT",
        "UID:" + escapeIcs(uid),
        "DTSTAMP:" + now,
        item.time
          ? "DTSTART:" + start
          : "DTSTART;VALUE=DATE:" + item.date!.replace(/-/g, ""),
        item.time
          ? "DTEND:" + end
          : "DTEND;VALUE=DATE:" +
            new Date(item.date! + "T12:00:00Z")
              .toISOString()
              .slice(0, 10)
              .replace(/-/g, ""),
        "SUMMARY:" + escapeIcs(item.title),
        "DESCRIPTION:" + escapeIcs(description),
        item.location ? "LOCATION:" + escapeIcs(item.location) : "",
        "STATUS:" +
          (item.status === "cancelled" ? "CANCELLED" : "CONFIRMED"),
        "END:VEVENT",
      ]
        .filter(Boolean)
        .map(foldIcsLine)
        .join("\r\n");
    });

  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NetzOS//Minha Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "minha-agenda-netzos.ics";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ConnectionsFeature() {
  const { data, userId, ready, error, refresh } = useReferenceData();
  const {
    operations,
    organizations,
    workspaces,
    ready: operationsReady,
  } = useOperationsStore();
  const [tab, setTab] = useState<ConnectionTab>("data");
  const [provider, setProvider] =
    useState<IntegrationConnection["provider"]>("supabase");
  const [name, setName] = useState("");
  const [reference, setReference] = useState("");
  const [resource, setResource] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [usage, setUsage] = useState<
    "personal" | "group" | "data" | "calendar"
  >("data");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const available = PROVIDERS.filter((item) => item.category === tab);
  const connections = useMemo(
    () =>
      data.connections.filter((connection) => {
        const meta = PROVIDERS.find((item) => item.id === connection.provider);
        return meta?.category === tab;
      }),
    [data.connections, tab],
  );

  const chooseProvider = (id: IntegrationConnection["provider"]) => {
    setProvider(id);
    const meta = PROVIDERS.find((item) => item.id === id);
    if (meta?.category === "calendar") setUsage("calendar");
    else if (meta?.category === "channels") setUsage("group");
    else setUsage("data");
    setName(meta?.label || "");
    setReference("");
    setResource("");
    setDescription("");
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      if (!name.trim()) throw new Error("Informe um nome para a conexão.");

      const supabase = await getSupabase();
      const id = makeResourceId("connection");
      const { error: insertError } = await supabase
        .from("integration_connections")
        .insert({
          id,
          actor_id: userId,
          organization_id: organizationId || null,
          workspace_id: workspaceId || null,
          name: name.trim(),
          provider,
          config: {
            reference: reference.trim(),
            resource: resource.trim() || null,
            usage,
            description: description.trim(),
          },
          status: "draft",
          version: 0,
        });
      if (insertError) throw insertError;

      await logAudit(userId, "connection.draft.created", id, {
        provider,
        organization: organizationId || null,
        workspace: workspaceId || null,
      });
      await refresh();
      setMessage(
        "Rascunho salvo. Este conector ainda não envia credenciais nem sincroniza serviços externos.",
      );
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Não foi possível salvar.",
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (connection: IntegrationConnection) => {
    const supabase = await getSupabase();
    const { error: deleteError } = await supabase
      .from("integration_connections")
      .delete()
      .eq("id", connection.id);
    if (deleteError) {
      setMessage(deleteError.message);
      return;
    }
    await logAudit(userId, "connection.deleted", connection.id, {
      provider: connection.provider,
    });
    await refresh();
    setMessage("Conexão removida.");
  };

  if (!ready || !operationsReady) {
    return <div className="ref-feature ref-loading"><div /></div>;
  }

  if (error) {
    return (
      <section className="ref-feature">
        <div className="ref-empty">
          <FiLink2 />
          <h2>Não foi possível carregar conexões</h2>
          <p>{error}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="ref-feature connections-feature">
      <header className="ref-heading">
        <div>
          <span className="ref-eyebrow">Integrations</span>
          <h1>Conexões</h1>
          <p>
            Prepare fontes de dados, canais e calendário sem guardar credenciais
            privadas no navegador.
          </p>
        </div>
      </header>

      <nav className="ref-tabs">
        <button
          className={tab === "data" ? "active" : ""}
          type="button"
          onClick={() => {
            setTab("data");
            chooseProvider("supabase");
          }}
        >
          Dados
        </button>
        <button
          className={tab === "channels" ? "active" : ""}
          type="button"
          onClick={() => {
            setTab("channels");
            chooseProvider("email");
          }}
        >
          Canais
        </button>
        <button
          className={tab === "calendar" ? "active" : ""}
          type="button"
          onClick={() => {
            setTab("calendar");
            chooseProvider("google_calendar");
          }}
        >
          Calendário
        </button>
      </nav>

      {tab === "calendar" && (
        <section className="connection-calendar-export">
          <div>
            <span className="ref-eyebrow">Disponível agora</span>
            <h2>Exportar Minha Agenda</h2>
            <p>
              Gera um arquivo ICS a partir das mesmas tarefas, reuniões e
              compromissos do NetzOS. Não duplica entidades no banco.
            </p>
          </div>
          <button
            className="ref-button primary"
            type="button"
            onClick={() =>
              downloadAgendaIcs(operations, organizations, workspaces)
            }
          >
            <FiDownload />
            Exportar .ics
          </button>
        </section>
      )}

      <div className="connection-layout">
        <aside className="connection-catalog">
          <span className="ref-eyebrow">Catálogo</span>
          {available.map((item) => (
            <button
              className={provider === item.id ? "active" : ""}
              type="button"
              key={item.id}
              onClick={() => chooseProvider(item.id)}
            >
              <span>
                {item.category === "data" ? (
                  <FiDatabase />
                ) : item.category === "calendar" ? (
                  <FiCalendar />
                ) : item.id === "email" ? (
                  <FiMail />
                ) : (
                  <FiMessageCircle />
                )}
              </span>
              <div>
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </div>
            </button>
          ))}
        </aside>

        <form className="ref-editor-card ref-form" onSubmit={save}>
          <div className="ref-section-heading compact">
            <div>
              <span className="ref-eyebrow">Preparar vínculo</span>
              <h3>
                {PROVIDERS.find((item) => item.id === provider)?.label}
              </h3>
            </div>
            <FiPlus />
          </div>

          <label className="ref-field">
            <span>Nome da conexão</span>
            <input
              value={name}
              maxLength={150}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label className="ref-field">
            <span>Referência</span>
            <input
              value={reference}
              maxLength={500}
              placeholder={
                provider === "api"
                  ? "https://api.exemplo.com"
                  : provider === "supabase"
                    ? "Projeto / URL pública"
                    : "Identificador público ou descrição"
              }
              onChange={(event) => setReference(event.target.value)}
            />
          </label>

          <label className="ref-field">
            <span>Recurso opcional</span>
            <input
              value={resource}
              maxLength={300}
              placeholder="Tabela, planilha, pasta, número, calendário…"
              onChange={(event) => setResource(event.target.value)}
            />
          </label>

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
                <option value="">Uso pessoal</option>
                {data.organizations
                  .filter((item) => item.ownerId === userId)
                  .map((organization) => (
                    <option value={organization.id} key={organization.id}>
                      {organization.name}
                    </option>
                  ))}
              </select>
            </label>

            <label className="ref-field">
              <span>Workspace</span>
              <select
                value={workspaceId}
                onChange={(event) => setWorkspaceId(event.target.value)}
              >
                <option value="">Organização inteira</option>
                {data.workspaces
                  .filter(
                    (workspace) =>
                      !organizationId ||
                      workspace.organizationId === organizationId,
                  )
                  .map((workspace) => (
                    <option value={workspace.id} key={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <label className="ref-field">
            <span>Uso</span>
            <select
              value={usage}
              onChange={(event) => setUsage(event.target.value as typeof usage)}
            >
              <option value="personal">Pessoal</option>
              <option value="group">Grupo / canal</option>
              <option value="data">Dados</option>
              <option value="calendar">Calendário</option>
            </select>
          </label>

          <label className="ref-field">
            <span>Descrição</span>
            <textarea
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <p className="ref-note">
            O NetzOS salva somente referências e configuração. OAuth, tokens,
            senhas e sincronização externa não são simulados nesta etapa.
          </p>

          <button
            className="ref-button primary"
            type="submit"
            disabled={busy}
          >
            <FiSave />
            {busy ? "Salvando…" : "Salvar rascunho"}
          </button>
        </form>
      </div>

      {message && <p className="ref-note">{message}</p>}

      <div className="ref-section-heading">
        <div>
          <span className="ref-eyebrow">Preparadas</span>
          <h3>Conexões salvas</h3>
        </div>
        <span className="ref-count">{connections.length}</span>
      </div>

      {connections.length ? (
        <div className="ref-list">
          {connections.map((connection) => {
            const meta = PROVIDERS.find(
              (item) => item.id === connection.provider,
            );
            return (
              <article key={connection.id}>
                <div className="ref-list-icon"><FiLink2 /></div>
                <div>
                  <strong>{connection.name}</strong>
                  <span>
                    {meta?.label || connection.provider} ·{" "}
                    {connection.config.reference || "sem referência"} ·{" "}
                    {connection.status === "draft" ? "Rascunho" : connection.status}
                  </span>
                </div>
                <button
                  className="ref-icon-button"
                  type="button"
                  title="Remover"
                  onClick={() => void remove(connection)}
                >
                  <FiTrash2 />
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="ref-empty compact">
          <FiRefreshCw />
          <h3>Nenhuma conexão preparada</h3>
          <p>Escolha um provedor e salve sua configuração.</p>
        </div>
      )}
    </section>
  );
}
