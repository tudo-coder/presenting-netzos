"use client";

import { useState } from "react";
import { FiArrowRight, FiLock, FiMail, FiX } from "react-icons/fi";
import { getSupabase } from "./supabase";

export function AuthModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    setBusy(true);

    try {
      const supabase = await getSupabase();

      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        onClose();
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
          },
        });
        if (signUpError) throw signUpError;

        if (data.session) {
          onClose();
        } else {
          setMessage("Conta criada. Confira seu e-mail para confirmar o acesso.");
        }
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível concluir a autenticação.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-backdrop" onMouseDown={onClose}>
      <section
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-label={mode === "signin" ? "Entrar no NetzOS" : "Criar conta no NetzOS"}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="auth-modal-header">
          <div>
            <span>NetzOS account</span>
            <h2>{mode === "signin" ? "Entrar" : "Criar conta"}</h2>
            <p>
              {mode === "signin"
                ? "Acesse seu workspace com sua conta NetzOS."
                : "Sua identidade e sessão serão gerenciadas pelo Supabase Auth."}
            </p>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose}>
            <FiX aria-hidden="true" />
          </button>
        </header>

        <form className="auth-form" onSubmit={submit}>
          <label>
            <span>E-mail</span>
            <div className="auth-input">
              <FiMail aria-hidden="true" />
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="voce@empresa.com"
              />
            </div>
          </label>

          <label>
            <span>Senha</span>
            <div className="auth-input">
              <FiLock aria-hidden="true" />
              <input
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mínimo de 8 caracteres"
              />
            </div>
          </label>

          {error && <p className="auth-feedback error">{error}</p>}
          {message && <p className="auth-feedback success">{message}</p>}

          <button className="auth-submit" type="submit" disabled={busy}>
            <span>{busy ? "Aguarde…" : mode === "signin" ? "Entrar" : "Criar conta"}</span>
            {!busy && <FiArrowRight aria-hidden="true" />}
          </button>
        </form>

        <footer className="auth-modal-footer">
          <span>
            {mode === "signin" ? "Ainda não tem uma conta?" : "Já possui uma conta?"}
          </span>
          <button
            type="button"
            onClick={() => {
              setMode((current) => (current === "signin" ? "signup" : "signin"));
              setError(null);
              setMessage(null);
            }}
          >
            {mode === "signin" ? "Criar conta" : "Entrar"}
          </button>
        </footer>
      </section>
    </div>
  );
}
