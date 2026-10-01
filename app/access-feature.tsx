"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  FiCheck,
  FiClock,
  FiCopy,
  FiFileText,
  FiGrid,
  FiLayout,
  FiPlus,
  FiShield,
  FiTrash2,
  FiUsers,
} from "react-icons/fi";
import { getSupabase } from "./supabase";
import { makeResourceId } from "./netzos-data";
import {
  ACCESS_ROLE_LABELS,
  canManage,
  logAudit,
  resourceRole,
  type AccessGrant,
  type AccessRole,
  useReferenceData,
} from "./reference-data";

type Kind = AccessGrant["kind"];

const KIND_LABELS: Record<Kind, string> = {
  organization: "Organização",
  workspace: "Workspace",
  form: "Formulário",
  table: "Tabela",
  dashboard: "Dashboard",
  system: "Sistema",
};

function resourceName(
  kind: Kind,
  resourceId: string,
  data: ReturnType<typeof useReferenceData>["data"],
) {
  if (kind === "organization") {
    return data.organizations.find((item) => item.id === resourceId)?.name || resourceId;
  }
  if (kind === "workspace") {
    return data.workspaces.find((item) => item.id === resourceId)?.name || resourceId;
  }
  if (kind === "dashboard") {
    return data.dashboards.find((item) => item.id === resourceId)?.name || resourceId;
  }
  if (kind === "system") {
    return data.systems.find((item) => item.id === resourceId)?.name || resourceId;
  }
  return data.tables.find((item) => item.id === resourceId)?.name || resourceId;
}

function resourcesForKind(
  kind: Kind,
  data: ReturnType<typeof useReferenceData>["data"],
  userId: string,
) {
  if (kind === "organization") {
    return data.organizations
      .filter((item) =>
        canManage(resourceRole(data, userId, "organization", item.id)),
      )
      .map((item) => [item.id, item.name] as const);
  }
  if (kind === "workspace") {
    return data.workspaces
      .filter((item) =>
        canManage(resourceRole(data, userId, "workspace", item.id)),
      )
      .map((item) => [item.id, item.name] as const);
  }
  if (kind === "dashboard") {
    return data.dashboards
      .filter((item) =>
        canManage(resourceRole(data, userId, "dashboard", item.id)),
      )
      .map((item) => [item.id, item.name] as const);
  }
  if (kind === "system") {
    return data.systems
      .filter((item) =>
        canManage(resourceRole(data, userId, "system", item.id)),
      )
      .map((item) => [item.id, item.name] as const);
  }
  return data.tables
    .filter((item) =>
      canManage(resourceRole(data, userId, kind, item.id)),
    )
    .map((item) => [item.id, item.name] as const);
}


function resourceOwnerId(
  kind: Kind,
  resourceId: string,
  data: ReturnType<typeof useReferenceData>["data"],
) {
  if (kind === "organization") {
    return data.organizations.find((item) => item.id === resourceId)?.ownerId || "";
  }
  if (kind === "workspace") {
    return data.workspaces.find((item) => item.id === resourceId)?.ownerId || "";
  }
  if (kind === "dashboard") {
    return data.dashboards.find((item) => item.id === resourceId)?.ownerId || "";
  }
  if (kind === "system") {
    return data.systems.find((item) => item.id === resourceId)?.ownerId || "";
  }
  return data.tables.find((item) => item.id === resourceId)?.ownerId || "";
}

export function SharedFeature({
  onOpen,
}: {
  onOpen?: (kind: Kind, id: string) => void;
}) {
  const { data, userId, email, ready, error, refresh } = useReferenceData();
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  const pending = useMemo(
    () =>
      data.grants.filter(
        (grant) =>
          !grant.acceptedAt &&
          !grant.userId &&
          grant.email.toLowerCase() === email.toLowerCase() &&
          Date.parse(grant.expiresAt) > Date.now(),
      ),
    [data.grants, email],
  );

  const accepted = useMemo(
    () =>
      data.grants.filter(
        (grant) =>
          grant.userId === userId &&
          !!grant.acceptedAt &&
          Date.parse(grant.expiresAt) > Date.now(),
      ),
    [data.grants, userId],
  );

  const accept = async (grant: AccessGrant) => {
    setBusyId(grant.id);
    setMessage("");
    try {
      const supabase = await getSupabase();
      const { error: updateError } = await supabase
        .from("access_grants")
        .update({
          user_id: userId,
          accepted_at: new Date().toISOString(),
        })
        .eq("id", grant.id);
      if (updateError) throw updateError;
      await logAudit(grant.ownerId, "access.accepted", grant.resourceId, {
        kind: grant.kind,
        grant: grant.id,
      });
      await refresh();
      setMessage("Convite aceito.");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Não foi possível aceitar o convite.",
      );
    } finally {
      setBusyId("");
    }
  };

  if (!ready) return <div className="ref-feature ref-loading"><div /></div>;

  if (error) {
    return (
      <section className="ref-feature">
        <div className="ref-empty"><FiUsers /><h2>Não foi possível carregar compartilhamentos</h2><p>{error}</p></div>
      </section>
    );
  }

  return (
    <section className="ref-feature">
      <header className="ref-heading">
        <div>
          <span className="ref-eyebrow">Collaboration</span>
          <h1>Compartilhados comigo</h1>
          <p>Convites e recursos compartilhados com sua conta NetzOS.</p>
        </div>
      </header>

      {message && <p className="ref-note success">{message}</p>}

      <div className="ref-section-heading">
        <div>
          <span className="ref-eyebrow">Convites</span>
          <h3>Convites para {email}</h3>
        </div>
        <span className="ref-count">{pending.length}</span>
      </div>

      {pending.length ? (
        <div className="ref-list">
          {pending.map((grant) => (
            <article key={grant.id}>
              <div className="ref-list-icon"><FiClock /></div>
              <div>
                <strong>{resourceName(grant.kind, grant.resourceId, data)}</strong>
                <span>
                  {KIND_LABELS[grant.kind]} · {ACCESS_ROLE_LABELS[grant.role]} · até{" "}
                  {new Date(grant.expiresAt).toLocaleDateString("pt-BR")}
                </span>
              </div>
              <button
                className="ref-button primary"
                type="button"
                disabled={busyId === grant.id}
                onClick={() => void accept(grant)}
              >
                <FiCheck />
                {busyId === grant.id ? "Aceitando…" : "Aceitar"}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="ref-note">Nenhum convite pendente.</p>
      )}

      <div className="ref-section-heading">
        <div>
          <span className="ref-eyebrow">Ativos</span>
          <h3>Recursos compartilhados</h3>
        </div>
      </div>

      {accepted.length ? (
        <div className="ref-card-grid">
          {accepted.map((grant) => (
            <article className="ref-resource-card" key={grant.id}>
              <div className="ref-resource-top">
                <span className="ref-resource-icon">
                  {grant.kind === "system" ? (
                    <FiLayout />
                  ) : grant.kind === "dashboard" ? (
                    <FiGrid />
                  ) : (
                    <FiFileText />
                  )}
                </span>
                <span className="ref-role small">{ACCESS_ROLE_LABELS[grant.role]}</span>
              </div>
              <h2>{resourceName(grant.kind, grant.resourceId, data)}</h2>
              <p>{KIND_LABELS[grant.kind]}</p>
              <small>
                {grant.rowScope === "own"
                  ? "Somente seus registros"
                  : grant.rowScope === "none"
                    ? "Sem consulta de registros"
                    : "Todos os registros autorizados"}
              </small>
              {onOpen && (
                <button
                  className="ref-button primary"
                  type="button"
                  onClick={() => onOpen(grant.kind, grant.resourceId)}
                >
                  Abrir
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="ref-empty compact">
          <FiUsers />
          <h3>Nenhum recurso compartilhado ativo</h3>
          <p>Quando você aceitar um convite, ele aparecerá aqui.</p>
        </div>
      )}
    </section>
  );
}

export function AccessFeature() {
  const { data, userId, ready, error, refresh } = useReferenceData();
  const [kind, setKind] = useState<Kind>("workspace");
  const [resourceId, setResourceId] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [role, setRole] = useState<AccessRole>("viewer");
  const [rowScope, setRowScope] = useState<"all" | "own" | "none">("all");
  const [columns, setColumns] = useState<string[] | null>(null);
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const resources = resourcesForKind(kind, data, userId);
  const selectedTable =
    kind === "table" || kind === "form"
      ? data.tables.find((item) => item.id === resourceId)
      : null;

  const ownedGrants = data.grants.filter(
    (grant) =>
      grant.ownerId === userId ||
      grant.createdBy === userId ||
      canManage(resourceRole(data, userId, grant.kind, grant.resourceId)),
  );

  const resetResource = (nextKind: Kind) => {
    setKind(nextKind);
    const items = resourcesForKind(nextKind, data, userId);
    setResourceId(items[0]?.[0] || "");
    setColumns(null);
    setRole(nextKind === "form" ? "operator" : "viewer");
    setRowScope(nextKind === "form" ? "own" : "all");
  };

  const createGrant = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const email = inviteEmail.trim().toLowerCase();
      if (!resourceId) throw new Error("Selecione um recurso.");
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Informe um e-mail válido.");
      if (columns && columns.length === 0) throw new Error("Selecione ao menos uma coluna.");

      const supabase = await getSupabase();
      const id = makeResourceId("grant");
      const expiresAt = new Date(
        Date.now() + Math.min(365, Math.max(1, days)) * 86400000,
      ).toISOString();

      const { error: insertError } = await supabase.from("access_grants").insert({
        id,
        owner_id: resourceOwnerId(kind, resourceId, data),
        created_by: userId,
        email,
        kind,
        resource_id: resourceId,
        role,
        columns,
        row_scope: role === "operator" ? "own" : rowScope,
        expires_at: expiresAt,
      });
      if (insertError) throw insertError;

      await logAudit(userId, "access.invited", resourceId, {
        grant: id,
        kind,
        email,
        role,
      });
      await refresh();
      setInviteEmail("");
      setMessage("Convite criado. O link pode ser copiado na lista abaixo.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Não foi possível criar o convite.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (grant: AccessGrant) => {
    setMessage("");
    const supabase = await getSupabase();
    const { error: deleteError } = await supabase
      .from("access_grants")
      .delete()
      .eq("id", grant.id);
    if (deleteError) {
      setMessage(deleteError.message);
      return;
    }
    await logAudit(userId, "access.revoked", grant.resourceId, {
      grant: grant.id,
      kind: grant.kind,
    });
    await refresh();
    setMessage("Acesso revogado.");
  };

  const copyInvite = async (grant: AccessGrant) => {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("invite", grant.id);
    await navigator.clipboard.writeText(url.toString());
    setMessage("Link do convite copiado.");
  };

  if (!ready) return <div className="ref-feature ref-loading"><div /></div>;
  if (error) {
    return (
      <section className="ref-feature"><div className="ref-empty"><FiShield /><h2>Não foi possível carregar acessos</h2><p>{error}</p></div></section>
    );
  }

  return (
    <section className="ref-feature access-feature">
      <header className="ref-heading">
        <div>
          <span className="ref-eyebrow">Permissions</span>
          <h1>Pessoas e Acessos</h1>
          <p>Convide pessoas, defina papéis e acompanhe o histórico de acesso.</p>
        </div>
      </header>

      <div className="access-layout">
        <form className="ref-editor-card ref-form" onSubmit={createGrant}>
          <div className="ref-section-heading compact">
            <div>
              <span className="ref-eyebrow">Novo acesso</span>
              <h3>Convidar pessoa</h3>
            </div>
            <FiPlus />
          </div>

          <label className="ref-field">
            <span>Tipo de recurso</span>
            <select value={kind} onChange={(event) => resetResource(event.target.value as Kind)}>
              {Object.entries(KIND_LABELS).map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </select>
          </label>

          <label className="ref-field">
            <span>Recurso</span>
            <select value={resourceId} onChange={(event) => { setResourceId(event.target.value); setColumns(null); }}>
              <option value="">Selecione</option>
              {resources.map(([id, label]) => (
                <option value={id} key={id}>{label}</option>
              ))}
            </select>
          </label>

          <label className="ref-field">
            <span>E-mail</span>
            <input
              type="email"
              value={inviteEmail}
              placeholder="pessoa@empresa.com"
              onChange={(event) => setInviteEmail(event.target.value)}
            />
          </label>

          <label className="ref-field">
            <span>Papel</span>
            <select
              value={role}
              onChange={(event) => {
                const next = event.target.value as AccessRole;
                setRole(next);
                if (next === "operator") setRowScope("own");
                if (["admin", "developer"].includes(next)) setColumns(null);
              }}
            >
              {Object.entries(ACCESS_ROLE_LABELS)
                .filter(([value]) => value !== "owner")
                .filter(([value]) => kind === "form" || value !== "operator")
                .map(([value, label]) => (
                  <option value={value} key={value}>{label}</option>
                ))}
            </select>
          </label>

          {(kind === "table" || kind === "form") && (
            <label className="ref-field">
              <span>Registros visíveis</span>
              <select
                value={role === "operator" ? "own" : rowScope}
                disabled={role === "operator"}
                onChange={(event) => setRowScope(event.target.value as typeof rowScope)}
              >
                {role !== "operator" && <option value="all">Todos os registros</option>}
                <option value="own">Somente os próprios envios</option>
                <option value="none">Não permitir consulta</option>
              </select>
            </label>
          )}

          {kind === "table" && ["viewer", "editor"].includes(role) && selectedTable && (
            <div className="access-columns">
              <label>
                <input
                  type="checkbox"
                  checked={columns === null}
                  onChange={(event) => setColumns(event.target.checked ? null : [])}
                />
                Todas as colunas
              </label>
              {columns !== null &&
                selectedTable.fields
                  .filter((field) => !field.archived)
                  .map((field) => (
                    <label key={field.id}>
                      <input
                        type="checkbox"
                        checked={columns.includes(field.id)}
                        onChange={(event) =>
                          setColumns((current) => {
                            const base = current || [];
                            return event.target.checked
                              ? [...new Set([...base, field.id])]
                              : base.filter((id) => id !== field.id);
                          })
                        }
                      />
                      {field.name}
                    </label>
                  ))}
            </div>
          )}

          <label className="ref-field">
            <span>Validade em dias</span>
            <input
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            />
          </label>

          <button
            className="ref-button primary"
            type="submit"
            disabled={busy || !resourceId || !inviteEmail.trim() || columns?.length === 0}
          >
            {busy ? "Criando…" : "Criar convite"}
          </button>
        </form>

        <div className="access-roles">
          <span className="ref-eyebrow">Papéis</span>
          {Object.entries(ACCESS_ROLE_LABELS).map(([value, label]) => (
            <article key={value}>
              <strong>{label}</strong>
              <p>
                {value === "owner"
                  ? "Responsável pelo ambiente."
                  : value === "admin"
                    ? "Administra recursos e acessos."
                    : value === "developer"
                      ? "Configura formulários, dados, sistemas e painéis."
                      : value === "editor"
                        ? "Inclui e altera registros autorizados."
                        : value === "viewer"
                          ? "Consulta os dados liberados."
                          : "Envia respostas e consulta os próprios envios quando permitido."}
              </p>
            </article>
          ))}
        </div>
      </div>

      {message && <p className="ref-note">{message}</p>}

      <div className="ref-section-heading">
        <div><span className="ref-eyebrow">Acessos</span><h3>Convites e permissões</h3></div>
        <span className="ref-count">{ownedGrants.length}</span>
      </div>

      <div className="ref-table-wrap">
        <table className="ref-table">
          <thead>
            <tr>
              <th>Pessoa</th>
              <th>Recurso</th>
              <th>Papel</th>
              <th>Situação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ownedGrants.map((grant) => {
              const expired = Date.parse(grant.expiresAt) < Date.now();
              return (
                <tr key={grant.id}>
                  <td>{grant.email}</td>
                  <td>
                    {KIND_LABELS[grant.kind]} · {resourceName(grant.kind, grant.resourceId, data)}
                    <small className="ref-cell-note">
                      {grant.columns ? "Colunas selecionadas" : "Todas as colunas"} ·{" "}
                      {grant.rowScope === "own"
                        ? "Somente próprios"
                        : grant.rowScope === "none"
                          ? "Sem consulta"
                          : "Todos os registros"}
                    </small>
                  </td>
                  <td>{ACCESS_ROLE_LABELS[grant.role]}</td>
                  <td>
                    {expired ? "Expirado" : grant.acceptedAt ? "Ativo" : "Pendente"}
                    <small className="ref-cell-note">
                      Até {new Date(grant.expiresAt).toLocaleDateString("pt-BR")}
                    </small>
                  </td>
                  <td>
                    <div className="ref-heading-actions">
                      {!grant.acceptedAt && !expired && (
                        <button
                          className="ref-icon-button"
                          type="button"
                          title="Copiar link"
                          onClick={() => void copyInvite(grant)}
                        >
                          <FiCopy />
                        </button>
                      )}
                      <button
                        className="ref-icon-button"
                        type="button"
                        title="Revogar"
                        onClick={() => void revoke(grant)}
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!ownedGrants.length && <p className="ref-note">Nenhum acesso criado.</p>}

      <div className="ref-section-heading">
        <div><span className="ref-eyebrow">Auditoria</span><h3>Histórico recente</h3></div>
      </div>

      <div className="activity-list">
        {data.events.slice(0, 80).map((event) => {
          const actor = data.profiles.find((profile) => profile.id === event.actorId);
          return (
            <div key={event.id}>
              <span>{new Date(event.createdAt).toLocaleString("pt-BR")}</span>
              <strong>{event.action}</strong>
              <span>{actor?.displayName || actor?.email || "Usuário identificado"}</span>
              <small>{event.resource}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}
