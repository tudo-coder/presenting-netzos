# NetzOS + Supabase

O NetzOS usa Supabase Auth como identidade principal do usuário. A conta ChatGPT é vinculada separadamente à conta NetzOS.

## Sign in with ChatGPT

As Edge Functions abaixo estão publicadas no projeto Supabase:

- `chatgpt-connect-start`: inicia OAuth Authorization Code + PKCE para um usuário NetzOS autenticado.
- `chatgpt-connect-callback`: consome o callback OpenAI, valida state/nonce/ID token e guarda a conexão.
- `chatgpt-proxy`: descobre modelos elegíveis e faz chamadas server-side à Responses API.

Callback a registrar com a OpenAI:

`https://cuhqzqpyhzciqxxcjgtg.supabase.co/functions/v1/chatgpt-connect-callback`

A conexão hospedada só fica ativa depois que a OpenAI provisionar o client de Sign in with ChatGPT para o domínio do NetzOS. Configure nas secrets das Edge Functions:

- `OPENAI_SIWC_CLIENT_ID`
- `OPENAI_SIWC_REDIRECT_URI`
- `OPENAI_SIWC_SCOPES`
- `OPENAI_SIWC_CLIENT_SECRET` quando o client provisionado for confidencial
- `OPENAI_SIWC_TOKEN_AUTH_METHOD` conforme o client provisionado
- `CHATGPT_TOKEN_ENCRYPTION_KEY` com um segredo aleatório dedicado

Para uso do plano ChatGPT, os scopes liberados pela OpenAI precisam incluir os scopes de invocação e uso direto do plano.

## Frontend

O build estático precisa receber:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

A chave utilizada no navegador deve ser somente a chave pública/publishable do projeto. Nunca exponha a service role.


## Operational data

The current app now persists its operational core in Supabase instead of browser-only localStorage:

- `organizations` — root context owned by the authenticated NetzOS user.
- `workspaces` — child context linked to one organization.
- `operational_items` — single source of truth for tasks, meetings and commitments.
- `operational_people` — people linked to an operational item.
- `operational_comments`, `operational_files`, `operational_transcripts` — reference-compatible extensions prepared for richer operation/meeting detail.

The Agenda does not store duplicate calendar rows. It projects dated `operational_items`, matching the architecture from the supplied NetzOS reference package.

All exposed tables use RLS. The current product model is ownership-first: organizations/workspaces belong to the signed-in Supabase user, and operational items are visible to their creator/responsible user. The frontend uses the authenticated Supabase session directly.

Existing browser data is migrated once after sign-in by `app/netzos-data.ts`. After migration, normal reads and writes use Supabase; localStorage remains only as the legacy migration source.


## NetzOS operational API

The meeting/agent ingestion API is deployed as the `netzos-api` Edge Function.

Base path:

`https://cuhqzqpyhzciqxxcjgtg.supabase.co/functions/v1/netzos-api/v1`

The function intentionally sets `verify_jwt = false` at the platform layer because it performs its own authentication and supports two caller types:

- a Supabase user JWT in `Authorization: Bearer <jwt>`;
- a NetzOS integration credential in `Authorization: Bearer netzos_ak_...`.

Integration credentials are generated from an authenticated NetzOS binding. Only a SHA-256 hash is persisted in `agent_api_credentials`; the plaintext token is returned once.

Implemented v1 routes:

- `GET /health`
- `GET|POST /bindings`
- `PATCH /bindings/:id`
- `POST /bindings/:id/credentials`
- `POST /meetings`
- `GET|PATCH /meetings/:id`
- `POST /meetings/:id/texts`
- `PUT /meetings/:id/transcript`
- `GET /meetings/:id/media`
- `POST /meetings/:id/media/upload`
- `POST /meetings/:id/media/:uploadId/complete`
- `POST /meetings/:id/tasks`
- `POST /ingest/events`

The mock group agent lives under **Conexões > Canais** and calls this real API. It can create a binding, generate a one-time integration API key, insert meetings/text/transcripts/tasks, upload meeting audio through a signed Storage upload, and revoke the binding.

Schema additions are versioned in `supabase/agent-ingestion.sql`. The API source is versioned in `supabase/functions/netzos-api/index.ts`.

Operational Realtime is enabled for `operational_items`, `operational_people`, `operational_comments`, `operational_files`, and `operational_transcripts`, so API-originated meeting data can refresh the product without creating parallel calendar entities.
