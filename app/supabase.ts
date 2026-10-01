import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

export const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://cuhqzqpyhzciqxxcjgtg.supabase.co";

let clientPromise: Promise<SupabaseClient> | null = null;

async function resolvePublishableKey() {
  const configuredKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (configuredKey) return configuredKey;

  const response = await fetch(
    supabaseUrl + "/functions/v1/public-config",
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error("Não foi possível carregar a configuração pública do Supabase.");
  }

  const config = (await response.json()) as {
    anon_key?: string;
  };

  if (!config.anon_key) {
    throw new Error("A configuração pública do Supabase está incompleta.");
  }

  return config.anon_key;
}

export function getSupabase() {
  if (!clientPromise) {
    clientPromise = resolvePublishableKey().then((publishableKey) =>
      createClient(supabaseUrl, publishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }),
    );
  }

  return clientPromise;
}
