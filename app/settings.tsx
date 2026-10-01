"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  FiCheck,
  FiExternalLink,
  FiRefreshCw,
  FiShield,
  FiUser,
  FiZap,
} from "react-icons/fi";
import { getSupabase } from "./supabase";

type ChatGPTConnection = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  scopes: string[];
  plan_usage_enabled: boolean;
  status: "connected" | "expired" | "revoked" | "error";
  expires_at: string | null;
  connected_at: string;
};

export function SettingsFeature({ user }: { user: User }) {
  const [connection, setConnection] = useState<ChatGPTConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [modelCount, setModelCount] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshConnection = useCallback(async () => {
    setLoading(true);
    const supabase = await getSupabase();
    const { data, error: queryError } = await supabase
      .from("chatgpt_connections")
      .select(
        "id,email,display_name,avatar_url,scopes,plan_usage_enabled,status,expires_at,connected_at",
      )
      .maybeSingle();

    if (queryError) {
      setError("Não foi possível consultar a conexão ChatGPT.");
      setConnection(null);
    } else {
      setConnection((data as ChatGPTConnection | null) || null);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void refreshConnection();

    const params = new URLSearchParams(window.location.search);
    const result = params.get("chatgpt");
    const reason = params.get("reason");

    if (result === "connected") {
      setNotice("Conta ChatGPT conectada. O uso do plano foi autorizado.");
      void refreshConnection();
    } else if (result === "identity_connected") {
      setNotice("Conta ChatGPT conectada, mas o uso do plano ainda não foi autorizado.");
      void refreshConnection();
    } else if (result === "error") {
      setError(
        reason === "account_already_linked"
          ? "Essa conta ChatGPT já está vinculada a outro usuário NetzOS."
          : "A conexão com ChatGPT não pôde ser concluída.",
      );
    }

    if (result) {
      params.delete("chatgpt");
      params.delete("reason");
      params.delete("request_id");
      const query = params.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (query ? "?" + query : ""),
      );
    }
  }, [refreshConnection]);

  const connectChatGPT = async () => {
    setConnecting(true);
    setError(null);
    setNotice(null);

    const supabase = await getSupabase();

    const returnTo = new URL(window.location.href);
    returnTo.search = "";
    returnTo.searchParams.set("settings", "chatgpt");

    const { data, error: invokeError } = await supabase.functions.invoke(
      "chatgpt-connect-start",
      {
        body: { return_to: returnTo.toString() },
      },
    );

    if (invokeError || !data?.authorize_url) {
      setError(
        "O fluxo está instalado no NetzOS, mas o OAuth client da OpenAI ainda precisa ser provisionado/configurado para este domínio.",
      );
      setConnecting(false);
      return;
    }

    window.location.assign(data.authorize_url);
  };

  const testPlan = async () => {
    setTesting(true);
    setError(null);

    const supabase = await getSupabase();
    const { data, error: invokeError } = await supabase.functions.invoke(
      "chatgpt-proxy",
      {
        body: { action: "models" },
      },
    );

    if (invokeError) {
      setError("Não foi possível validar os modelos disponíveis nessa conta.");
      setModelCount(null);
    } else {
      const count = Array.isArray(data?.models) ? data.models.length : 0;
      setModelCount(count);
      setNotice(
        count > 0
          ? `Conexão validada: ${count} modelo${count === 1 ? "" : "s"} disponível${count === 1 ? "" : "is"}.`
          : "A conexão respondeu, mas não retornou modelos visíveis.",
      );
    }

    setTesting(false);
  };

  return (
    <section className="settings-feature">
      <header className="settings-heading">
        <div>
          <span className="settings-eyebrow">System</span>
          <h1>Settings</h1>
          <p>Conta NetzOS, identidade e conexão de IA.</p>
        </div>
      </header>

      <div className="settings-grid">
        <section className="settings-panel">
          <div className="settings-panel-icon">
            <FiUser aria-hidden="true" />
          </div>
          <div className="settings-panel-copy">
            <span>NetzOS account</span>
            <h2>{user.email || "Usuário"}</h2>
            <p>
              Sessão autenticada pelo Supabase. O acesso aos dados da conta é
              protegido no backend.
            </p>
          </div>
          <span className="settings-status connected">
            <FiCheck aria-hidden="true" />
            Authenticated
          </span>
        </section>

        <section className="settings-panel chatgpt-connection-panel">
          <div className="settings-panel-icon">
            <FiZap aria-hidden="true" />
          </div>

          <div className="settings-panel-copy">
            <span>AI provider</span>
            <h2>ChatGPT</h2>

            {loading ? (
              <p>Verificando conexão…</p>
            ) : connection ? (
              <>
                <p>
                  {connection.display_name || connection.email || "Conta ChatGPT"} ·{" "}
                  {connection.plan_usage_enabled
                    ? "usando o plano ChatGPT para solicitações elegíveis."
                    : "identidade conectada; uso do plano não autorizado."}
                </p>
                <div className="settings-connection-meta">
                  <span>{connection.email || "Conta verificada"}</span>
                  {connection.expires_at && (
                    <span>
                      Token atual expira{" "}
                      {new Date(connection.expires_at).toLocaleString("pt-BR")}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <p>
                Conecte uma conta ChatGPT para usar o plano elegível no NetzOS
                sem pedir API token ao usuário.
              </p>
            )}
          </div>

          <div className="settings-panel-actions">
            {connection?.plan_usage_enabled ? (
              <>
                <span className="settings-status connected">
                  <FiShield aria-hidden="true" />
                  Using ChatGPT plan
                </span>
                <button
                  className="settings-secondary-action"
                  type="button"
                  onClick={testPlan}
                  disabled={testing}
                >
                  <FiRefreshCw aria-hidden="true" />
                  {testing ? "Validando…" : "Validar acesso"}
                </button>
              </>
            ) : (
              <button
                className="settings-chatgpt-action"
                type="button"
                onClick={connectChatGPT}
                disabled={connecting}
              >
                <span>{connecting ? "Abrindo…" : "Continue with ChatGPT"}</span>
                <FiExternalLink aria-hidden="true" />
              </button>
            )}
          </div>
        </section>
      </div>

      {modelCount !== null && (
        <p className="settings-inline-note">
          Catálogo atual: {modelCount} modelo{modelCount === 1 ? "" : "s"}.
        </p>
      )}
      {notice && <p className="settings-inline-note success">{notice}</p>}
      {error && <p className="settings-inline-note error">{error}</p>}
    </section>
  );
}
