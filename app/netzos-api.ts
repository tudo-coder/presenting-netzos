"use client";

import { getSupabase, supabaseUrl } from "./supabase";

type ApiOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH";
  body?: unknown;
};

export async function netzosApi<T = any>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const supabase = await getSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Sua sessão expirou.");
  }

  const response = await fetch(
    supabaseUrl +
      "/functions/v1/netzos-api/v1/" +
      path.replace(/^\/+/, ""),
    {
      method: options.method || "GET",
      headers: {
        Authorization: "Bearer " + session.access_token,
        "Content-Type": "application/json",
      },
      body:
        options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
      cache: "no-store",
    },
  );

  const payload = await response
    .json()
    .catch(() => ({ error: { message: "Resposta inválida da API NetzOS." } }));

  if (!response.ok || payload?.ok === false) {
    throw new Error(
      payload?.error?.message ||
        "A API operacional do NetzOS retornou um erro.",
    );
  }

  return payload as T;
}

export async function uploadToSignedNetzosUrl({
  objectKey,
  token,
  file,
}: {
  objectKey: string;
  token: string;
  file: File;
}) {
  const supabase = await getSupabase();
  const { error } = await supabase.storage
    .from("netzos-operational")
    .uploadToSignedUrl(objectKey, token, file, {
      contentType: file.type || "application/octet-stream",
    });

  if (error) throw error;
}
