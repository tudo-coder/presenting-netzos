"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  FiCheckCircle,
  FiPlay,
  FiPlus,
  FiSave,
  FiTrash2,
  FiZap,
} from "react-icons/fi";
import { getSupabase } from "./supabase";
import { makeResourceId } from "./netzos-data";
import {
  logAudit,
  type AutomationWorkflow,
  useReferenceData,
} from "./reference-data";

type Trigger = AutomationWorkflow["definition"]["triggers"][number];
type Action = AutomationWorkflow["definition"]["action"];

const EMPTY_ACTION: Action = {
  kind: "email",
  connection: null,
  recipient: "",
  message: "",
};

function defaultTrigger(source = ""): Trigger {
  return { source, field: "", from: "", to: "" };
}

function actionLabel(kind: Action["kind"]) {
  if (kind === "email") return "Enviar e-mail";
  if (kind === "whatsapp") return "Enviar WhatsApp";
  if (kind === "telegram") return "Enviar Telegram";
  return "Criar tarefa";
}

export function AutomationsFeature() {
  const { data, userId, ready, error, refresh } = useReferenceData();
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("Nova automação");
  const [description, setDescription] = useState("");
  const [triggers, setTriggers] = useState<Trigger[]>([
    defaultTrigger(data.tables[0]?.id || ""),
  ]);
  const [action, setAction] = useState<Action>(EMPTY_ACTION);
  const [status, setStatus] =
    useState<AutomationWorkflow["status"]>("draft");
  const [beforeValues, setBeforeValues] = useState<Record<string, string>>({});
  const [afterValues, setAfterValues] = useState<Record<string, string>>({});
  const [simulation, setSimulation] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const workflow = data.workflows.find((item) => item.id === selectedId) || null;

  const loadWorkflow = (item: AutomationWorkflow) => {
    setSelectedId(item.id);
    setName(item.name);
    setDescription(item.description);
    setTriggers(item.definition.triggers.length ? item.definition.triggers : [defaultTrigger()]);
    setAction(item.definition.action);
    setStatus(item.status);
    setBeforeValues({});
    setAfterValues({});
    setSimulation("");
    setMessage("");
  };

  const newWorkflow = () => {
    setSelectedId("");
    setName("Nova automação");
    setDescription("");
    setTriggers([defaultTrigger(data.tables[0]?.id || "")]);
    setAction(EMPTY_ACTION);
    setStatus("draft");
    setBeforeValues({});
    setAfterValues({});
    setSimulation("");
    setMessage("");
  };

  const patchTrigger = (index: number, patch: Partial<Trigger>) => {
    setTriggers((current) =>
      current.map((trigger, position) =>
        position === index ? { ...trigger, ...patch } : trigger,
      ),
    );
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      if (!name.trim()) throw new Error("Informe o nome da automação.");
      const normalized = triggers
        .filter((trigger) => trigger.source && trigger.field)
        .slice(0, 6);
      if (!normalized.length) throw new Error("Adicione ao menos um gatilho.");

      if (action.kind !== "task" && !action.connection) {
        throw new Error("Selecione uma conexão para a ação.");
      }

      const supabase = await getSupabase();
      const id = workflow?.id || makeResourceId("automation");
      const definition: AutomationWorkflow["definition"] = {
        version: 1,
        triggers: normalized,
        action,
        description: description.trim(),
      };

      const { error: saveError } = await supabase
        .from("automation_workflows")
        .upsert(
          {
            id,
            actor_id: userId,
            name: name.trim(),
            description: description.trim(),
            definition,
            status,
            version: workflow ? workflow.version + 1 : 0,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
      if (saveError) throw saveError;

      await logAudit(userId, workflow ? "automation.updated" : "automation.created", id, {
        triggers: normalized.length,
        action: action.kind,
      });
      await refresh();
      setSelectedId(id);
      setMessage("Rascunho salvo. Nenhuma ação externa foi executada.");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Não foi possível salvar.",
      );
    } finally {
      setBusy(false);
    }
  };

  const simulate = () => {
    const results = triggers.map((trigger, index) => {
      const before = beforeValues[String(index)] ?? "";
      const after = afterValues[String(index)] ?? "";
      const fromOk = trigger.from === "" || before === trigger.from;
      const toOk = trigger.to === "" || after === trigger.to;
      return fromOk && toOk;
    });

    const fires = results.length > 0 && results.every(Boolean);
    setSimulation(
      fires
        ? "A regra seria acionada. A simulação não alterou dados nem enviou mensagens."
        : "A regra não seria acionada com os valores informados.",
    );
  };

  const remove = async (item: AutomationWorkflow) => {
    const supabase = await getSupabase();
    const { error: deleteError } = await supabase
      .from("automation_workflows")
      .delete()
      .eq("id", item.id);
    if (deleteError) {
      setMessage(deleteError.message);
      return;
    }
    await logAudit(userId, "automation.deleted", item.id);
    await refresh();
    if (selectedId === item.id) newWorkflow();
  };

  const compatibleConnections = useMemo(
    () =>
      data.connections.filter((connection) => {
        if (action.kind === "email") return connection.provider === "email";
        if (action.kind === "whatsapp") return connection.provider === "whatsapp";
        if (action.kind === "telegram") return connection.provider === "telegram";
        return false;
      }),
    [action.kind, data.connections],
  );

  if (!ready) return <div className="ref-feature ref-loading"><div /></div>;

  if (error) {
    return (
      <section className="ref-feature">
        <div className="ref-empty">
          <FiZap />
          <h2>Não foi possível carregar automações</h2>
          <p>{error}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="ref-feature automations-feature">
      <header className="ref-heading">
        <div>
          <span className="ref-eyebrow">When / Then</span>
          <h1>Automações</h1>
          <p>
            Combine mudanças de campos e prepare ações. Fluxos permanecem em
            rascunho/simulação até existir um executor externo autorizado.
          </p>
        </div>
        <button className="ref-button primary" type="button" onClick={newWorkflow}>
          <FiPlus />
          Nova automação
        </button>
      </header>

      <div className="automation-layout">
        <aside className="automation-library">
          <span className="ref-eyebrow">Biblioteca</span>
          {data.workflows.map((item) => (
            <article
              className={selectedId === item.id ? "active" : ""}
              key={item.id}
            >
              <button type="button" onClick={() => loadWorkflow(item)}>
                <strong>{item.name}</strong>
                <span>
                  {item.definition.triggers.length} gatilho
                  {item.definition.triggers.length === 1 ? "" : "s"} ·{" "}
                  {actionLabel(item.definition.action.kind)}
                </span>
                <small>{item.status}</small>
              </button>
              <button
                className="ref-icon-button"
                type="button"
                aria-label="Excluir automação"
                onClick={() => void remove(item)}
              >
                <FiTrash2 />
              </button>
            </article>
          ))}
          {!data.workflows.length && (
            <p className="ref-note">Nenhuma automação salva.</p>
          )}
        </aside>

        <form className="automation-editor" onSubmit={save}>
          <section className="ref-editor-card">
            <div className="ref-two">
              <label className="ref-field">
                <span>Nome</span>
                <input
                  value={name}
                  maxLength={150}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="ref-field">
                <span>Estado</span>
                <select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as AutomationWorkflow["status"])
                  }
                >
                  <option value="draft">Rascunho</option>
                  <option value="active">Ativo quando houver executor</option>
                  <option value="paused">Pausado</option>
                  <option value="disabled">Desativado</option>
                </select>
              </label>
            </div>

            <label className="ref-field">
              <span>Descrição</span>
              <textarea
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </section>

          <section className="ref-editor-card">
            <div className="ref-section-heading compact">
              <div>
                <span className="ref-eyebrow">Quando</span>
                <h3>Gatilhos</h3>
              </div>
              <button
                className="ref-button secondary"
                type="button"
                disabled={triggers.length >= 6}
                onClick={() =>
                  setTriggers((current) => [
                    ...current,
                    defaultTrigger(data.tables[0]?.id || ""),
                  ])
                }
              >
                <FiPlus />
                Condição
              </button>
            </div>

            <div className="automation-trigger-list">
              {triggers.map((trigger, index) => {
                const table = data.tables.find(
                  (item) => item.id === trigger.source,
                );
                return (
                  <article key={index}>
                    <div className="automation-trigger-index">{index + 1}</div>

                    <select
                      value={trigger.source}
                      aria-label="Fonte do gatilho"
                      onChange={(event) =>
                        patchTrigger(index, {
                          source: event.target.value,
                          field: "",
                        })
                      }
                    >
                      <option value="">Tabela</option>
                      {data.tables.map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>

                    <select
                      value={trigger.field}
                      aria-label="Campo do gatilho"
                      onChange={(event) =>
                        patchTrigger(index, { field: event.target.value })
                      }
                    >
                      <option value="">Campo</option>
                      {table?.fields
                        .filter((field) => !field.archived)
                        .map((field) => (
                          <option value={field.id} key={field.id}>
                            {field.name}
                          </option>
                        ))}
                    </select>

                    <input
                      value={trigger.from}
                      placeholder="De (qualquer)"
                      onChange={(event) =>
                        patchTrigger(index, { from: event.target.value })
                      }
                    />

                    <input
                      value={trigger.to}
                      placeholder="Para (qualquer)"
                      onChange={(event) =>
                        patchTrigger(index, { to: event.target.value })
                      }
                    />

                    <button
                      className="ref-icon-button"
                      type="button"
                      disabled={triggers.length === 1}
                      onClick={() =>
                        setTriggers((current) =>
                          current.filter((_, position) => position !== index),
                        )
                      }
                    >
                      <FiTrash2 />
                    </button>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="ref-editor-card">
            <span className="ref-eyebrow">Então</span>
            <h3>Ação</h3>

            <div className="ref-two">
              <label className="ref-field">
                <span>Tipo</span>
                <select
                  value={action.kind}
                  onChange={(event) =>
                    setAction({
                      ...action,
                      kind: event.target.value as Action["kind"],
                      connection: null,
                    })
                  }
                >
                  <option value="email">Enviar e-mail</option>
                  <option value="whatsapp">Enviar WhatsApp</option>
                  <option value="telegram">Enviar Telegram</option>
                  <option value="task">Criar tarefa</option>
                </select>
              </label>

              {action.kind !== "task" && (
                <label className="ref-field">
                  <span>Conexão</span>
                  <select
                    value={action.connection || ""}
                    onChange={(event) =>
                      setAction({
                        ...action,
                        connection: event.target.value || null,
                      })
                    }
                  >
                    <option value="">Selecione uma conexão</option>
                    {compatibleConnections.map((connection) => (
                      <option value={connection.id} key={connection.id}>
                        {connection.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <label className="ref-field">
              <span>
                {action.kind === "task" ? "Responsável / destino" : "Destinatário"}
              </span>
              <input
                value={action.recipient}
                onChange={(event) =>
                  setAction({ ...action, recipient: event.target.value })
                }
              />
            </label>

            <label className="ref-field">
              <span>
                {action.kind === "task" ? "Título / instrução" : "Mensagem"}
              </span>
              <textarea
                rows={4}
                value={action.message}
                onChange={(event) =>
                  setAction({ ...action, message: event.target.value })
                }
              />
            </label>
          </section>

          <section className="ref-editor-card">
            <div className="ref-section-heading compact">
              <div>
                <span className="ref-eyebrow">Teste</span>
                <h3>Simular regra salva</h3>
              </div>
              <button
                className="ref-button secondary"
                type="button"
                onClick={simulate}
              >
                <FiPlay />
                Simular
              </button>
            </div>

            <div className="automation-sim-grid">
              {triggers.map((trigger, index) => (
                <div className="ref-two" key={index}>
                  <label className="ref-field">
                    <span>Antes · condição {index + 1}</span>
                    <input
                      value={beforeValues[String(index)] || ""}
                      onChange={(event) =>
                        setBeforeValues((current) => ({
                          ...current,
                          [String(index)]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="ref-field">
                    <span>Depois · condição {index + 1}</span>
                    <input
                      value={afterValues[String(index)] || ""}
                      onChange={(event) =>
                        setAfterValues((current) => ({
                          ...current,
                          [String(index)]: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
              ))}
            </div>

            {simulation && (
              <p className="ref-note success">
                <FiCheckCircle />
                {simulation}
              </p>
            )}
          </section>

          {message && <p className="ref-note">{message}</p>}

          <div className="ref-save-row">
            <button className="ref-button primary" type="submit" disabled={busy}>
              <FiSave />
              {busy ? "Salvando…" : "Salvar rascunho"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
