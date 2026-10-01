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
