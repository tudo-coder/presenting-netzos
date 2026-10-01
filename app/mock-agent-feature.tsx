"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  FiCheckCircle,
  FiCopy,
  FiFile,
  FiKey,
  FiMessageSquare,
  FiMic,
  FiPlus,
  FiRefreshCw,
  FiSend,
  FiUsers,
} from "react-icons/fi";
import { netzosApi, uploadToSignedNetzosUrl } from "./netzos-api";
import { todayBelem, useOperationsStore } from "./operations-data";

type Binding = {
  id: string;
  provider: "mock" | "api" | "whatsapp" | "telegram";
  external_channel_id: string;
  channel_type: "group" | "direct" | "system";
  label: string;
  organization_id: string;
  workspace_id: string | null;
  default_visibility: "context" | "private";
  active: boolean;
};

function externalId(prefix: string) {
  return (
    prefix +
    "-" +
    (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36))
  );
}

export function MockAgentFeature() {
  const { organizations, workspaces, refresh: refreshOperations } =
    useOperationsStore();
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [bindingId, setBindingId] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [channelId, setChannelId] = useState("grupo-mock-operacao");
  const [label, setLabel] = useState("Grupo mock");
  const [meetingExternalId, setMeetingExternalId] = useState("reuniao-mock-001");
  const [meetingId, setMeetingId] = useState("");
  const [title, setTitle] = useState("Reunião operacional");
  const [date, setDate] = useState(todayBelem());
  const [time, setTime] = useState("09:00");
  const [text, setText] = useState(
    "Registro enviado pelo agente mock do grupo.",
  );
  const [taskTitle, setTaskTitle] = useState(
    "Acompanhar decisão da reunião",
  );
  const [file, setFile] = useState<File | null>(null);
  const [credential, setCredential] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedBinding = bindings.find((item) => item.id === bindingId) || null;

  const availableWorkspaces = useMemo(
    () =>
      workspaces.filter(
        (workspace) => workspace.organizationId === organizationId,
      ),
    [organizationId, workspaces],
  );

  const loadBindings = async () => {
    const result = await netzosApi<{ bindings: Binding[] }>("bindings");
    setBindings(result.bindings || []);
    setBindingId((current) => {
      if (current && result.bindings.some((item) => item.id === current)) {
        return current;
      }
      return result.bindings[0]?.id || "";
    });
  };

  useEffect(() => {
    if (!organizationId && organizations[0]) {
      setOrganizationId(organizations[0].id);
    }
  }, [organizationId, organizations]);

  useEffect(() => {
    void loadBindings().catch((cause) =>
      setMessage(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar os bindings.",
      ),
    );
  }, []);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "A operação mock falhou.",
      );
    } finally {
      setBusy(false);
    }
  };

  const createBinding = () =>
    run(async () => {
      if (!organizationId) {
        throw new Error("Crie ou selecione uma organização primeiro.");
      }

      const result = await netzosApi<{ binding: Binding }>("bindings", {
        method: "POST",
        body: {
          provider: "mock",
          external_channel_id: channelId,
          channel_type: "group",
          label,
          organization_id: organizationId,
          workspace_id: workspaceId || null,
          default_visibility: "context",
        },
      });

      await loadBindings();
      setBindingId(result.binding.id);
      setMessage("Grupo mock vinculado ao contexto NetzOS.");
    });

  const generateCredential = () =>
    run(async () => {
      if (!bindingId) throw new Error("Selecione um binding.");

      const result = await netzosApi<{
        credential: { token: string };
      }>("bindings/" + bindingId + "/credentials", {
        method: "POST",
        body: { name: "Mock Agent" },
      });

      setCredential(result.credential.token);
      setMessage(
        "Credencial gerada. Ela é mostrada uma única vez e o banco guarda somente o hash.",
      );
    });

  const toggleBinding = () =>
    run(async () => {
      if (!selectedBinding) throw new Error("Selecione um binding.");

      await netzosApi("bindings/" + selectedBinding.id, {
        method: "PATCH",
        body: { active: !selectedBinding.active },
      });

      setCredential("");
      await loadBindings();
      setMessage(
        selectedBinding.active
          ? "Binding desativado. As credenciais desse grupo deixam de funcionar imediatamente."
          : "Binding reativado.",
      );
    });

  const ingest = async (
    type: string,
    payload: Record<string, unknown>,
  ) => {
    if (!bindingId) throw new Error("Selecione um binding.");

    return netzosApi<any>("ingest/events", {
      method: "POST",
      body: {
        binding_id: bindingId,
        event_id: externalId("event"),
        channel: {
          provider: selectedBinding?.provider || "mock",
          external_channel_id:
            selectedBinding?.external_channel_id || channelId,
          type: "group",
        },
        sender: {
          external_id: "mock-user",
          display_name: "Agente mock",
        },
        event: {
          type,
          external_meeting_id: meetingExternalId,
          payload,
        },
        occurred_at: new Date().toISOString(),
      },
    });
  };

  const createMeeting = () =>
    run(async () => {
      const result = await ingest("meeting.created", {
        title,
        date,
        time,
        duration: 60,
        description: "Criada pelo simulador do agente do grupo.",
      });

      const id =
        result?.result?.item?.id ||
        result?.result?.meeting?.id ||
        result?.result?.item?.operation_id;

      if (id) setMeetingId(id);
      await refreshOperations();
      setMessage(
        "Reunião inserida pela API. Agenda e Reuniões usam esse mesmo registro.",
      );
    });

  const sendText = (type: "comment" | "summary" | "decision") =>
    run(async () => {
      await ingest("meeting.text", {
        type,
        text,
      });
      await refreshOperations();
      setMessage(
        type === "comment"
          ? "Comentário enviado pela API."
          : type === "summary"
            ? "Resumo enviado pela API."
            : "Decisão enviada pela API.",
      );
    });

  const sendTranscript = () =>
    run(async () => {
      await ingest("meeting.transcript", {
        text,
        segments: [
          {
            start: 0,
            end: 5,
            speaker: "Agente mock",
            text,
          },
        ],
        generated_at: new Date().toISOString(),
      });
      setMessage("Transcrição inserida pela API.");
    });

  const createTask = () =>
    run(async () => {
      await ingest("meeting.task", {
        title: taskTitle,
        description: "Tarefa derivada da reunião pelo agente mock.",
        date,
        priority: "important",
      });
      await refreshOperations();
      setMessage(
        "Tarefa vinculada à reunião e projetada em Minhas tarefas/Agenda.",
      );
    });

  const uploadAudio = () =>
    run(async () => {
      if (!file) throw new Error("Selecione um arquivo de áudio.");
      if (!meetingId) {
        throw new Error(
          "Crie a reunião neste simulador primeiro para obter o ID interno.",
        );
      }

      const startEvent = await ingest("meeting.media.upload", {
        external_id: externalId("audio"),
        name: file.name,
        mime: file.type || "audio/ogg",
        size: file.size,
        purpose: "recording",
      });
      const start = startEvent?.result;

      if (start?.completed) {
        setMessage("Este áudio já havia sido concluído.");
        return;
      }

      const token = start?.signed_upload?.token;
      if (!token || !start.object_key || !start.upload_id) {
        throw new Error("A API não retornou os dados do upload assinado.");
      }

      await uploadToSignedNetzosUrl({
        objectKey: start.object_key,
        token,
        file,
      });

      await ingest("meeting.media.complete", {
        upload_id: start.upload_id,
      });

      setMessage(
        "Áudio salvo no Storage privado e vinculado à reunião pelo fluxo do agente.",
      );
    });

  const copyCredential = async () => {
    if (!credential) return;
    await navigator.clipboard.writeText(credential);
    setMessage("Credencial copiada.");
  };

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] || null);
  };

  return (
    <section className="mock-agent-panel">
      <header className="ref-section-heading compact">
        <div>
          <span className="ref-eyebrow">Agente Netz · Mock</span>
          <h3>Simular o agente dentro de um grupo</h3>
        </div>
        <button
          className="ref-button secondary"
          type="button"
          disabled={busy}
          onClick={() => void loadBindings()}
        >
          <FiRefreshCw />
          Atualizar
        </button>
      </header>

      <p className="ref-note">
        Este simulador chama a API operacional real. WhatsApp/Telegram ainda
        não são simulados como integrações oficiais; somente o transporte do
        futuro agente é mockado.
      </p>

      <div className="mock-agent-grid">
        <section className="ref-editor-card ref-form">
          <span className="ref-eyebrow">1 · Binding</span>

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
              <span>Workspace</span>
              <select
                value={workspaceId}
                onChange={(event) => setWorkspaceId(event.target.value)}
              >
                <option value="">Organização inteira</option>
                {availableWorkspaces.map((workspace) => (
                  <option value={workspace.id} key={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="ref-two">
            <label className="ref-field">
              <span>ID externo do grupo</span>
              <input
                value={channelId}
                onChange={(event) => setChannelId(event.target.value)}
              />
            </label>

            <label className="ref-field">
              <span>Nome</span>
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
            </label>
          </div>

          <button
            className="ref-button primary"
            type="button"
            disabled={busy || !organizationId || !channelId.trim()}
            onClick={() => void createBinding()}
          >
            <FiUsers />
            Vincular grupo mock
          </button>

          <label className="ref-field">
            <span>Binding ativo</span>
            <select
              value={bindingId}
              onChange={(event) => setBindingId(event.target.value)}
            >
              <option value="">Selecione</option>
              {bindings.map((binding) => (
                <option value={binding.id} key={binding.id}>
                  {binding.label || binding.external_channel_id} ·{" "}
                  {binding.active ? "ativo" : "inativo"}
                </option>
              ))}
            </select>
          </label>

          <div className="mock-agent-actions">
            <button
              className="ref-button secondary"
              type="button"
              disabled={busy || !bindingId || !selectedBinding?.active}
              onClick={() => void generateCredential()}
            >
              <FiKey />
              Gerar API key do agente
            </button>
            <button
              className="ref-button secondary"
              type="button"
              disabled={busy || !bindingId}
              onClick={() => void toggleBinding()}
            >
              {selectedBinding?.active ? "Desativar binding" : "Reativar binding"}
            </button>
          </div>

          {credential && (
            <div className="mock-agent-secret">
              <span>Exibida uma única vez</span>
              <code>{credential}</code>
              <button
                className="ref-button secondary"
                type="button"
                onClick={() => void copyCredential()}
              >
                <FiCopy />
                Copiar
              </button>
            </div>
          )}
        </section>

        <section className="ref-editor-card ref-form">
          <span className="ref-eyebrow">2 · Ingestão</span>

          <label className="ref-field">
            <span>ID externo da reunião</span>
            <input
              value={meetingExternalId}
              onChange={(event) => setMeetingExternalId(event.target.value)}
            />
          </label>

          <label className="ref-field">
            <span>Título</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <div className="ref-two">
            <label className="ref-field">
              <span>Data</span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>

            <label className="ref-field">
              <span>Hora</span>
              <input
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </label>
          </div>

          <button
            className="ref-button primary"
            type="button"
            disabled={busy || !bindingId || !meetingExternalId.trim()}
            onClick={() => void createMeeting()}
          >
            <FiPlus />
            Criar reunião via API
          </button>

          {meetingId && (
            <p className="ref-note success">
              <FiCheckCircle />
              ID interno: {meetingId}
            </p>
          )}

          <label className="ref-field">
            <span>Texto do agente</span>
            <textarea
              rows={4}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </label>

          <div className="mock-agent-actions">
            <button
              className="ref-button secondary"
              type="button"
              disabled={busy || !bindingId}
              onClick={() => void sendText("comment")}
            >
              <FiMessageSquare />
              Comentário
            </button>
            <button
              className="ref-button secondary"
              type="button"
              disabled={busy || !bindingId}
              onClick={() => void sendText("summary")}
            >
              Resumo
            </button>
            <button
              className="ref-button secondary"
              type="button"
              disabled={busy || !bindingId}
              onClick={() => void sendText("decision")}
            >
              Decisão
            </button>
            <button
              className="ref-button secondary"
              type="button"
              disabled={busy || !bindingId}
              onClick={() => void sendTranscript()}
            >
              <FiSend />
              Transcrição
            </button>
          </div>

          <label className="ref-field">
            <span>Nova tarefa da reunião</span>
            <input
              value={taskTitle}
              onChange={(event) => setTaskTitle(event.target.value)}
            />
          </label>

          <button
            className="ref-button secondary"
            type="button"
            disabled={busy || !bindingId}
            onClick={() => void createTask()}
          >
            <FiCheckCircle />
            Criar tarefa vinculada
          </button>

          <label className="ref-upload-zone mock-agent-upload">
            <input
              className="ref-hidden-file"
              type="file"
              accept="audio/*"
              onChange={selectFile}
            />
            <FiMic />
            <strong>{file?.name || "Selecionar áudio"}</strong>
            <span>Upload assinado · Storage privado · até 100 MB</span>
          </label>

          <button
            className="ref-button primary"
            type="button"
            disabled={busy || !file || !meetingId}
            onClick={() => void uploadAudio()}
          >
            <FiFile />
            Enviar áudio pela API
          </button>
        </section>
      </div>

      {message && <p className="ref-note success">{message}</p>}
    </section>
  );
}
