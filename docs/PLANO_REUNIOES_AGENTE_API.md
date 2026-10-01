# Plano de integração — Reuniões, Agenda, Agente Netz e API operacional

Status: **planejamento de implementação**

Base funcional: **ZIP de referência do NetzOS + projeto atual conectado ao Supabase**

Objetivo: preservar o modelo operacional do ZIP e preparar o NetzOS para receber reuniões, áudios, textos e ações vindas de um agente presente em grupos/canais externos, sem criar entidades paralelas e sem duplicar Agenda, tarefas ou reuniões.

---

## 1. Princípio central

A regra principal do projeto continua sendo a mesma do ZIP:

> Uma reunião, tarefa ou compromisso existe uma vez no núcleo operacional. Agenda, Minhas tarefas, Organização, Workspace e futuras integrações apenas projetam ou manipulam esse mesmo registro.

Portanto:

- reunião é um registro real em `operational_items`;
- tarefa é um registro real em `operational_items`;
- compromisso é um registro real em `operational_items`;
- Agenda **não possui tabela própria de eventos duplicados**;
- áudio/gravação pertence à reunião por `operational_files`;
- transcrição pertence à reunião por `operational_transcripts`;
- comentários/textos de acompanhamento usam `operational_comments`;
- pauta, resumo, decisões, checklist e reunião anterior continuam em `operational_items.details`;
- uma tarefa criada a partir de uma reunião aponta para a reunião original por `meeting_id`;
- a futura integração com o agente Netz chama o mesmo serviço operacional usado pela aplicação manual.

Essa decisão é importante porque o agente externo não deverá “sincronizar cópias” do que existe no NetzOS. Ele deverá apenas criar ou atualizar os registros originais.

---

## 2. O que o ZIP já define e deve ser preservado

O ZIP de referência estabelece o seguinte comportamento operacional, que deve continuar sendo a especificação do produto:

### 2.1 Reuniões

Uma reunião pode conter:

- organização;
- workspace opcional;
- título;
- descrição;
- status;
- data;
- hora;
- duração;
- local;
- fuso horário;
- responsável;
- participantes;
- visibilidade `context` ou `private`;
- pauta por assuntos;
- notas por assunto;
- decisão por assunto;
- checklist;
- responsável por item de checklist;
- resumo;
- decisões gerais;
- observações;
- vínculo com reunião anterior;
- tarefas criadas a partir da reunião;
- comentários;
- anexos;
- gravações;
- transcrição;
- histórico/auditoria.

### 2.2 Agenda

A Agenda é uma projeção de:

- reuniões;
- compromissos;
- tarefas que possuem prazo.

Tarefas sem prazo continuam nas listas de tarefas, mas não geram evento artificial.

As visões continuam:

- Dia;
- Semana;
- Mês;
- Agenda/listagem.

### 2.3 Arquivos e gravações

A referência prevê:

- armazenamento privado;
- metadados separados do arquivo binário;
- vínculo direto com o registro operacional;
- reprodução/download com autorização;
- gravação marcada como `purpose=recording`;
- limite operacional controlado pelo backend;
- nenhum arquivo embutido em JSON/base64.

### 2.4 Transcrição

A transcrição continua separada da reunião:

- texto completo;
- segmentos;
- falante;
- início/fim em segundos;
- origem;
- data de geração;
- autor;
- versão.

### 2.5 Agente/canais

O ZIP também define a regra futura:

- Netz, WhatsApp, Telegram ou qualquer canal externo deve usar **o mesmo serviço operacional**;
- origem/canal é atribuída no servidor;
- integração externa nunca deve criar uma segunda reunião/tarefa apenas para representar a primeira;
- grupos não recebem automaticamente a soma das permissões dos participantes;
- cada mensagem externa precisa ser resolvida para identidade, organização, workspace e permissão;
- revogação no NetzOS deve interromper acesso pelo canal.

---

## 3. Estado atual do projeto

O projeto publicado hoje possui:

- Next.js com `output: "export"`;
- frontend estático servido pelo Cloudflare;
- Supabase Auth;
- Supabase Postgres;
- Supabase Storage;
- RLS;
- `organizations`;
- `workspaces`;
- `operational_items`;
- `operational_people`;
- `operational_comments`;
- `operational_files`;
- `operational_transcripts`;
- bucket privado `netzos-operational`;
- Agenda e Minhas tarefas lendo do núcleo operacional;
- editor de reunião;
- gravação local via microfone;
- upload para Storage;
- transcrição manual;
- auditoria.

### Restrição arquitetural atual

Como o frontend é exportado estaticamente, **não é correto implementar a nova API como rotas Next.js dentro de `app/api`**.

O backend da integração deve ficar fora do bundle estático.

### Decisão para esta etapa

A API operacional será planejada como **Supabase Edge Function server-side**, porque:

- o banco já está no Supabase;
- Auth já está no Supabase;
- Storage já está no Supabase;
- a service role pode permanecer somente no servidor;
- não precisamos transformar o frontend em aplicação SSR;
- a API poderá ser chamada pelo agente externo posteriormente;
- o mesmo contrato pode ser mantido se no futuro for movido para um Cloudflare Worker dedicado.

Nome inicial proposto:

`supabase/functions/netzos-api`

Base pública:

`/functions/v1/netzos-api/v1`

---

## 4. Arquitetura alvo

```text
Grupo / canal externo
        |
        |  futuro adapter oficial
        v
+-----------------------+
| Agente Netz           |
| ou Mock Agent         |
+-----------------------+
        |
        | HTTPS + auth server-to-server
        | idempotency key
        v
+-------------------------------+
| Supabase Edge Function        |
| netzos-api / v1               |
|                               |
| - autenticação integração     |
| - validação do payload        |
| - resolve binding do grupo    |
| - valida permissões/contexto  |
| - idempotência                |
| - origem/canal                |
| - escrita transacional        |
+-------------------------------+
        |
        +------------+-------------------+
        |            |                   |
        v            v                   v
 operational_items  operational_files   operational_transcripts
 operational_people comments/audit      Supabase Storage
        |
        v
 Supabase Postgres / RLS
        |
        v
+---------------------------------------+
| NetzOS frontend                       |
|                                       |
| Reuniões                              |
| Agenda                                |
| Minhas tarefas                        |
| Organização / Workspace               |
+---------------------------------------+
```

Não haverá banco do agente separado para as entidades operacionais.

---

## 5. API operacional v1

A API será versionada desde o início.

Prefixo:

`/v1`

### 5.1 Criar reunião

`POST /v1/meetings`

Exemplo:

```json
{
  "external_id": "group-551-message-9981",
  "organization_id": "org_x",
  "workspace_id": "workspace_y",
  "title": "Reunião semanal de operação",
  "description": "Acompanhamento da semana",
  "date": "2026-10-02",
  "time": "09:00",
  "duration": 60,
  "timezone": "America/Belem",
  "location": "Grupo Operação",
  "visibility": "context",
  "participants": [],
  "metadata": {
    "source": "mock_group_agent",
    "external_group_id": "group-551"
  }
}
```

Resposta:

```json
{
  "ok": true,
  "meeting": {
    "id": "op_...",
    "external_id": "group-551-message-9981",
    "created": true
  }
}
```

Se o mesmo `external_id` for reenviado, a API deverá retornar o registro já vinculado em vez de criar uma segunda reunião.

### 5.2 Consultar reunião

`GET /v1/meetings/:meetingId`

Retorna:

- dados da reunião;
- participantes;
- pauta/details;
- arquivos;
- transcrição;
- comentários;
- tarefas vinculadas;
- histórico resumido.

### 5.3 Atualizar reunião

`PATCH /v1/meetings/:meetingId`

Permitirá alterar somente campos permitidos pelo contrato.

O contexto `organization_id/workspace_id` não deve ser alterado silenciosamente depois da criação.

### 5.4 Registrar texto simples

`POST /v1/meetings/:meetingId/texts`

Objetivo: receber texto vindo do agente/canal sem obrigar o chamador a conhecer a estrutura interna do banco.

Payload:

```json
{
  "external_id": "msg-10020",
  "type": "comment",
  "text": "Cliente confirmou a entrega para sexta.",
  "sender": {
    "external_id": "wa-user-99",
    "display_name": "Pessoa"
  },
  "occurred_at": "2026-10-02T12:30:00Z"
}
```

Tipos planejados:

- `comment`;
- `note`;
- `summary`;
- `decision`;
- `transcript`.

Mapeamento:

- `comment` -> `operational_comments`;
- `note` -> `details.notes`;
- `summary` -> `details.summary`;
- `decision` -> `details.decisions`;
- `transcript` -> serviço de transcrição.

A API de conveniência deve internamente chamar o mesmo serviço usado pelas rotas específicas.

### 5.5 Registrar transcrição

`PUT /v1/meetings/:meetingId/transcript`

Payload:

```json
{
  "external_id": "transcript-provider-778",
  "source": "mock_agent",
  "generated_at": "2026-10-02T13:10:00Z",
  "text": "Texto completo da reunião...",
  "segments": [
    {
      "start": 0,
      "end": 8.4,
      "speaker": "Pessoa A",
      "text": "Bom dia, vamos começar."
    }
  ]
}
```

A atualização deverá usar versão otimista.

Não deve existir uma segunda transcrição ativa para a mesma reunião.

### 5.6 Iniciar upload de áudio

O arquivo binário não deve atravessar desnecessariamente o frontend e nem ser convertido para base64.

`POST /v1/meetings/:meetingId/media/upload`

Payload:

```json
{
  "external_id": "audio-message-889",
  "name": "reuniao-2026-10-02.ogg",
  "mime": "audio/ogg",
  "size": 2849102,
  "purpose": "recording"
}
```

Resposta:

```json
{
  "upload_id": "file_...",
  "object_key": "...",
  "signed_upload": {
    "url": "...",
    "token": "..."
  }
}
```

O agente faz upload diretamente ao Storage.

### 5.7 Confirmar upload

`POST /v1/meetings/:meetingId/media/:uploadId/complete`

A API deverá:

1. conferir se o objeto existe;
2. conferir tamanho;
3. conferir MIME;
4. conferir o meeting/contexto;
5. registrar em `operational_files`;
6. registrar auditoria;
7. associar `purpose=recording`.

Se o upload não for confirmado, um job futuro poderá limpar objetos órfãos.

### 5.8 Listar arquivos

`GET /v1/meetings/:meetingId/media`

A resposta nunca deve expor o objeto como URL pública permanente.

Para download/reprodução, gerar URL assinada de curta duração.

### 5.9 Criar tarefa a partir da reunião

`POST /v1/meetings/:meetingId/tasks`

Payload:

```json
{
  "external_id": "agent-task-991",
  "title": "Enviar proposta atualizada",
  "description": "Decisão da reunião semanal.",
  "responsible_id": null,
  "date": "2026-10-04",
  "priority": "important",
  "topic_id": null
}
```

A API deve obrigatoriamente herdar:

- organização;
- workspace;
- visibilidade;
- timezone;
- `meeting_id`.

A origem será definida server-side como `agent` ou `meeting`, conforme a ação.

---

## 6. Endpoint genérico de ingestão para o agente

Além dos endpoints explícitos, o agente de grupo precisará de um endpoint de eventos.

`POST /v1/ingest/events`

Esse endpoint funciona como **adapter de entrada**, não como nova base de dados.

Exemplo:

```json
{
  "event_id": "mock:group-551:message-1001",
  "source": "mock_group_agent",
  "channel": {
    "provider": "mock",
    "external_channel_id": "group-551",
    "type": "group"
  },
  "sender": {
    "external_id": "person-88",
    "display_name": "João"
  },
  "event": {
    "type": "meeting.transcript",
    "external_meeting_id": "meeting-ext-123",
    "payload": {
      "text": "..."
    }
  },
  "occurred_at": "2026-10-02T14:00:00Z"
}
```

Fluxo:

1. autenticar integração;
2. validar `event_id`;
3. verificar se já foi processado;
4. resolver o canal/grupo para um binding NetzOS;
5. resolver reunião externa para `operational_items.id`;
6. revalidar contexto;
7. chamar o serviço operacional interno;
8. registrar resultado;
9. responder com IDs internos;
10. nunca executar a mesma mutação duas vezes.

---

## 7. Modo mock do agente

Nesta etapa **não haverá integração real com WhatsApp/Telegram**.

O mock precisa testar o contrato real, não criar comportamento fictício escondido no frontend.

### 7.1 O que será mockado

Será possível simular:

- mensagem de grupo;
- criação de reunião;
- envio de texto;
- envio de transcrição;
- envio de áudio;
- criação de tarefa derivada;
- atualização de reunião;
- evento repetido/idempotente.

### 7.2 O que não será fingido

Não deve haver simulação de:

- conexão oficial com WhatsApp;
- membro real de grupo;
- leitura automática de mensagens externas;
- transcrição automática real;
- diarização real;
- análise de IA real;
- envio de resposta ao grupo;
- OAuth inexistente.

### 7.3 Ferramentas de teste

Implementar duas formas:

#### A. Requisição HTTP

Exemplos documentados com `curl` usando uma chave mock de desenvolvimento.

#### B. Painel de desenvolvimento

Tela opcional disponível somente em ambiente de desenvolvimento ou flag explícita:

`Mock Agent / Ingestion Simulator`

Campos:

- source;
- external group ID;
- external event ID;
- organização;
- workspace;
- tipo do evento;
- reunião externa;
- payload JSON/texto;
- arquivo.

Essa tela deve chamar **a API real**, e não gravar diretamente no Supabase.

Assim o fluxo testado será exatamente o mesmo que o agente futuro usará.

---

## 8. Bindings de grupos/canais

Adicionar tabela planejada:

`agent_channel_bindings`

Campos propostos:

```text
id
owner_id
provider
external_channel_id
channel_type
organization_id
workspace_id nullable
default_visibility
active
created_at
updated_at
```

Função:

Mapear:

```text
grupo externo -> organização/workspace permitido
```

Exemplo:

```text
WhatsApp group: 1203630...
       ->
Organização: Tudo Norte
Workspace: Comercial
```

O payload externo não poderá escolher livremente qualquer organização.

Quando existir binding de canal, o servidor deverá priorizar o binding sobre IDs arbitrários enviados pelo agente.

---

## 9. Identidade do agente e dos participantes

Nesta primeira implementação:

- o binding será criado por um usuário autenticado do NetzOS;
- o `creator_id` operacional pode continuar associado ao proprietário/ator autorizado do binding;
- `origin` identifica que a criação veio do agente;
- o evento externo preserva o remetente original separadamente;
- auditoria guarda source, channel, sender e event ID.

Não criar perfis Supabase falsos para cada telefone/nome externo.

Quando um usuário externo for posteriormente vinculado a uma conta NetzOS, poderá existir uma tabela de identidades externas.

Proposta futura:

`external_identities`

```text
provider
external_user_id
profile_id
verified_at
```

---

## 10. Idempotência e referências externas

Adicionar tabela:

`external_ingestion_events`

Campos:

```text
id
source
external_event_id
binding_id
event_type
payload_hash
status
operation_id nullable
file_id nullable
error nullable
received_at
processed_at
```

Unique:

```text
(source, external_event_id)
```

Adicionar também:

`external_operation_refs`

Campos:

```text
source
external_type
external_id
operation_id
version
metadata
created_at
updated_at
```

Unique:

```text
(source, external_type, external_id)
```

Isso implementa a regra do ZIP:

> integrações externas devem mapear IDs externos para os IDs reais, e não criar registros duplicados.

---

## 11. Origem operacional

Padronizar origens:

- `manual`;
- `meeting`;
- `netz`;
- `agent`;
- `whatsapp`;
- `telegram`;
- `system`;
- `api`.

A origem **não deve ser aceita cegamente do body**.

O backend escolhe a origem a partir da credencial/adapter que recebeu a requisição.

Exemplo:

```text
credencial mock-agent -> origin=agent
adapter whatsapp -> origin=whatsapp
usuário na interface -> origin=manual
tarefa criada dentro da reunião -> origin=meeting
```

---

## 12. Autenticação da API externa

A API terá dois modos de autenticação.

### 12.1 Usuário NetzOS

Para chamadas da própria aplicação:

`Authorization: Bearer <Supabase user access token>`

A Edge Function valida o JWT e usa as permissões do usuário.

### 12.2 Integração/agente

Para server-to-server:

- segredo da integração armazenado somente como secret do servidor;
- nunca `NEXT_PUBLIC_*`;
- nunca salvo no browser;
- API key inicial mock ou assinatura HMAC;
- credencial associada a um `agent_channel_binding`;
- rate limit;
- rotação/revogação;
- `X-Idempotency-Key` obrigatório para mutações externas.

Formato inicial sugerido:

```http
Authorization: Bearer <integration-secret>
X-Idempotency-Key: mock:group-551:event-8877
```

A implementação real poderá evoluir para assinatura HMAC ou OAuth/mTLS sem mudar os endpoints de domínio.

---

## 13. Segurança do contexto de grupos

Regra obrigatória:

> Um grupo não herda a soma das permissões das pessoas que estão nele.

A API deve tratar grupo/canal como uma audiência específica.

Para cada evento:

1. resolve binding;
2. verifica se binding está ativo;
3. obtém organização/workspace fixos;
4. identifica ator autorizado;
5. verifica permissão de escrita;
6. restringe recurso privado;
7. não retorna dados privados ao grupo sem política explícita;
8. registra auditoria;
9. permite revogação imediata.

Um agente não pode usar um ID de organização enviado pelo texto do usuário para escapar do binding.

---

## 14. Supabase Storage

Bucket:

`netzos-operational`

Estrutura proposta:

```text
operations/
  <organization-id>/
    <meeting-id>/
      <random-object-id>
```

ou, mantendo o padrão atual do projeto:

```text
<owner-or-integration-id>/
  <meeting-id>/
    <file-id>-<safe-name>
```

Requisitos:

- bucket privado;
- MIME allowlist;
- tamanho validado;
- nome externo sanitizado;
- key interna aleatória;
- URL pública permanente proibida;
- download/reprodução com signed URL;
- auditoria do upload;
- gravação aceita somente quando `kind=meeting`;
- upload idempotente por `external_id`.

---

## 15. Atualização da interface após inserção externa

O resultado precisa aparecer automaticamente em:

- Organização -> Reuniões;
- Workspace -> Reuniões;
- Minha Agenda, se o usuário participar/for responsável;
- Agenda da organização;
- Agenda do workspace;
- detalhe da reunião;
- Arquivos;
- Transcrição;
- tarefas vinculadas.

### Estratégia

Fase inicial:

- após mutação feita pelo próprio frontend: refresh normal;
- ao abrir uma tela: buscar estado do Supabase.

Fase seguinte:

ativar Supabase Realtime para:

- `operational_items`;
- `operational_people`;
- `operational_comments`;
- `operational_files`;
- `operational_transcripts`.

Quando uma reunião chegar pela API externa enquanto o usuário está com o NetzOS aberto, a interface deverá atualizar sem reload manual.

---

## 16. Fluxo completo — reunião criada pelo agente do grupo

### Cenário

O agente está futuramente presente em um grupo de trabalho.

O grupo está vinculado ao workspace Comercial.

### Etapas

1. alguém inicia uma reunião no grupo;
2. adapter externo gera `external_event_id`;
3. adapter chama `POST /v1/meetings` ou `POST /v1/ingest/events`;
4. API autentica o adapter;
5. API encontra `agent_channel_binding`;
6. API define organização/workspace;
7. API cria `operational_items(kind=meeting)`;
8. API cria `external_operation_refs`;
9. API registra audit;
10. Supabase passa a conter a reunião real;
11. Agenda projeta essa mesma reunião;
12. UI mostra a reunião em Organização/Workspace/Agenda;
13. nenhum calendário duplicado é criado.

---

## 17. Fluxo completo — áudio enviado pelo agente

1. agente informa metadata do arquivo;
2. API valida reunião/binding;
3. API cria upload pendente;
4. API gera upload assinado;
5. agente envia binário diretamente ao Storage;
6. agente confirma upload;
7. backend confere objeto;
8. backend cria `operational_files`;
9. `purpose=recording`;
10. audit é criado;
11. detalhe da reunião passa a mostrar o áudio;
12. reprodução usa signed URL.

---

## 18. Fluxo completo — texto/transcrição enviado depois

1. provedor externo transcreve ou agente recebe texto;
2. envia `external_event_id`;
3. API verifica idempotência;
4. resolve reunião externa;
5. grava/atualiza `operational_transcripts`;
6. preserva `source` e `generated_at`;
7. incrementa versão;
8. cria auditoria;
9. UI passa a mostrar a transcrição;
10. nenhuma tarefa é criada automaticamente nesta fase.

---

## 19. Extração futura de tarefas

A referência deixa uma regra importante:

A análise de uma reunião deve **propor**, não criar silenciosamente.

Fluxo futuro:

```text
áudio
 -> transcrição
 -> análise
 -> propostas
     - decisão
     - tarefa
     - compromisso
     - ideia futura
 -> revisão humana
 -> confirmação
 -> registro operacional real
```

Quando o agente/IA sugerir uma tarefa:

- status inicial `pending`;
- usuário revisa;
- usuário aceita ou ignora;
- só depois a tarefa é criada;
- tarefa herda contexto da reunião;
- idempotência impede criação repetida.

---

## 20. Contratos internos

A API externa não deve escrever diretamente em tabelas espalhadas.

Criar um módulo de domínio compartilhado server-side.

Proposta:

```text
supabase/functions/_shared/operations/
  model.ts
  validation.ts
  permissions.ts
  meetings.ts
  tasks.ts
  transcripts.ts
  media.ts
  ingestion.ts
  audit.ts
  idempotency.ts
```

A Edge Function chama esse módulo.

No futuro:

- adapter WhatsApp;
- adapter Telegram;
- adapter Netz;
- automações;

todos chamam as mesmas funções.

---

## 21. Estrutura de código planejada

```text
supabase/
  functions/
    netzos-api/
      index.ts

    _shared/
      auth.ts
      cors.ts
      response.ts
      operations/
        model.ts
        validation.ts
        context.ts
        permissions.ts
        meetings.ts
        tasks.ts
        transcripts.ts
        media.ts
        ingestion.ts
        audit.ts

  migrations/
    <timestamp>_agent_ingestion.sql

docs/
  PLANO_REUNIOES_AGENTE_API.md
```

Frontend opcional:

```text
app/
  mock-agent-feature.tsx
  operation-detail.tsx
  operations-data.ts
```

---

## 22. Novas tabelas planejadas

### `agent_channel_bindings`

Liga canal/grupo a contexto NetzOS.

### `external_ingestion_events`

Controla:

- idempotência;
- processamento;
- erros;
- auditoria técnica.

### `external_operation_refs`

Liga ID externo à entidade real.

### Não criar

Não criar:

- `agent_meetings`;
- `calendar_events_copy`;
- `whatsapp_tasks`;
- `agent_transcripts`;
- tabela paralela de agenda.

---

## 23. Versionamento e concorrência

As operações devem continuar usando `version`.

Update:

```text
PATCH meeting version=5
```

Servidor só aceita se banco ainda estiver em `version=5`.

Se banco estiver em `version=6`:

```http
409 Conflict
```

Resposta:

```json
{
  "error": "version_conflict",
  "message": "A reunião foi alterada por outra origem.",
  "current_version": 6
}
```

O agente deve reler antes de repetir a mutação.

---

## 24. Códigos de erro

Padronizar:

- `400 invalid_request`;
- `401 unauthorized`;
- `403 forbidden`;
- `404 not_found`;
- `409 idempotency_conflict`;
- `409 version_conflict`;
- `413 payload_too_large`;
- `415 unsupported_media_type`;
- `422 invalid_context`;
- `429 rate_limited`;
- `500 internal_error`;
- `503 dependency_unavailable`.

Formato:

```json
{
  "ok": false,
  "error": {
    "code": "invalid_context",
    "message": "O canal não está vinculado a este workspace.",
    "request_id": "req_..."
  }
}
```

---

## 25. Observabilidade

Toda request de API deve ter:

- `request_id`;
- source;
- binding;
- external event ID;
- duração;
- status;
- operation ID resultante;
- erro sem segredo;
- timestamp.

Não logar:

- access token;
- integration secret;
- signed upload token;
- conteúdo bruto de áudio;
- conteúdo de transcrição completa em logs técnicos.

---

## 26. Auditoria de negócio

Continuar usando `audit_events`.

Ações propostas:

- `agent.meeting.created`;
- `agent.meeting.updated`;
- `agent.text.received`;
- `agent.recording.attached`;
- `agent.transcript.updated`;
- `agent.task.proposed`;
- `agent.task.created`;
- `integration.event.duplicate`;
- `integration.event.failed`.

Detalhe deve incluir IDs técnicos, não segredos.

---

## 27. Limites iniciais do mock

Definir limites conservadores e configuráveis.

Exemplos de regras:

- texto por evento limitado;
- quantidade de segmentos limitada;
- payload JSON limitado;
- MIME explícito;
- rate limit por integração;
- upload de arquivo segue limite operacional do produto;
- no máximo uma reunião criada por referência externa;
- nenhuma execução arbitrária;
- nenhum SQL recebido pelo agente;
- nenhum código recebido pelo agente.

Os valores exatos devem ficar em constantes server-side e testes.

---

## 28. Testes necessários

### 28.1 Unitários

- validação de reunião;
- data/hora/fuso;
- mapping de evento;
- idempotência;
- origin;
- parsing de transcript;
- sanitização de arquivo;
- resolução do binding;
- version conflict.

### 28.2 Integração Supabase

- criar reunião;
- reunião aparece na consulta;
- criar reunião via external ID duas vezes não duplica;
- anexar áudio;
- metadata corresponde ao Storage;
- inserir transcrição;
- atualização incrementa versão;
- criar tarefa da reunião;
- tarefa herda contexto;
- revogar binding bloqueia integração;
- grupo não acessa contexto não vinculado;
- private meeting bloqueia ator não autorizado.

### 28.3 Interface

- reunião externa aparece na lista;
- reunião externa aparece na Agenda;
- áudio aparece em Arquivos;
- transcrição aparece na aba Transcrição;
- tarefa gerada aparece em Minhas tarefas;
- tarefa com prazo aparece na Agenda;
- nenhuma entidade duplicada.

### 28.4 Mock Agent

Cenário end-to-end:

```text
1. criar binding mock
2. POST meeting.created
3. repetir o mesmo evento
4. confirmar somente 1 reunião
5. enviar comentário
6. enviar áudio
7. confirmar upload
8. enviar transcrição
9. abrir reunião no frontend
10. conferir tudo na mesma entidade
```

---

## 29. Critérios de aceite da fase mock

A fase só é considerada concluída quando:

- [ ] existe uma API server-side funcional;
- [ ] nenhum segredo está no frontend;
- [ ] um grupo mock pode estar vinculado a organização/workspace;
- [ ] a API cria reunião real;
- [ ] a reunião aparece na Agenda sem duplicação;
- [ ] a API aceita texto;
- [ ] a API aceita transcrição;
- [ ] a API oferece fluxo de upload de áudio;
- [ ] áudio fica privado no Storage;
- [ ] arquivo aparece na reunião;
- [ ] evento repetido não duplica dados;
- [ ] tarefa criada da reunião mantém o vínculo;
- [ ] auditoria registra origem externa;
- [ ] revogação do binding bloqueia novas ações;
- [ ] build de produção passa;
- [ ] testes de integração passam.

---

## 30. Fases de implementação

### Fase 1 — Schema de integração

Implementar:

- `agent_channel_bindings`;
- `external_ingestion_events`;
- `external_operation_refs`;
- índices;
- RLS;
- funções auxiliares;
- migration versionada.

### Fase 2 — Serviço operacional server-side

Extrair/reutilizar contratos para:

- meeting create/update;
- task create/update;
- comments;
- transcripts;
- media;
- audit;
- idempotency.

### Fase 3 — API v1

Implementar Edge Function:

- auth;
- router;
- validação;
- endpoints de meetings;
- texts;
- transcript;
- media;
- ingest/events.

### Fase 4 — Mock Agent

Implementar:

- integração mock;
- secret de desenvolvimento;
- binding;
- exemplos `curl`;
- simulator opcional no frontend;
- fixtures.

### Fase 5 — UI em tempo real

Implementar:

- subscription Realtime;
- refresh dirigido por tabela;
- atualização do detalhe aberto;
- atualização automática da Agenda.

### Fase 6 — Integração real futura

Somente depois da API mock estar estabilizada:

- provider oficial;
- challenge/binding do canal;
- identidade externa;
- recebimento de webhook;
- adapter -> `/v1/ingest/events`;
- resposta ao grupo conforme política de audiência.

A integração real **não muda o domínio**, apenas substitui o adapter mock.

---

## 31. Decisões assumidas para não bloquear a implementação

### Projeto

O ZIP usa o workspace atual como contexto de projeto. Nesta fase não será criada uma entidade paralela de projeto somente para satisfazer a API.

### Criador de registros externos

O binding possui um proprietário/ator autorizado. O registro operacional continuará pertencendo a um contexto NetzOS real; o evento externo preservará sender/source separadamente.

### Áudio

A API não precisa transcrever áudio nesta fase. Ela precisa garantir que o áudio seja recebido, armazenado, associado e exibido corretamente.

### Texto

Textos externos serão tratados por intenção explícita do endpoint/evento; o backend não tentará interpretar linguagem livre como ação definitiva sem confirmação.

### Agente

O mock simula o transporte e o adapter. Não simula capacidade inexistente de WhatsApp/Telegram.

---

## 32. Resultado esperado

Ao final desta etapa, será possível demonstrar o fluxo abaixo sem depender do agente real:

```text
Grupo mock
  -> API NetzOS
  -> reunião criada
  -> áudio anexado
  -> texto/transcrição inserido
  -> Supabase
  -> reunião aparece na Organização/Workspace
  -> reunião aparece na Agenda
  -> áudio aparece em Arquivos
  -> transcrição aparece na reunião
  -> tarefa derivada aparece em Minhas tarefas/Agenda
```

Quando o agente real estiver pronto, ele só precisará implementar o adapter e autenticar-se na mesma API.

O núcleo operacional, Agenda, Supabase, Storage e interface não deverão ser reescritos.

---

## 33. Próximo passo de engenharia

Ordem recomendada para iniciar imediatamente:

1. criar migration das três tabelas de integração;
2. criar `netzos-api` como Supabase Edge Function;
3. criar autenticação de integração mock;
4. implementar idempotência;
5. implementar `POST /v1/meetings`;
6. implementar transcript/text;
7. implementar upload assinado + complete;
8. implementar `/v1/ingest/events`;
9. criar fixtures/curl do mock agent;
10. ligar atualização Realtime no frontend;
11. validar fluxo end-to-end;
12. somente então substituir o adapter mock pelo agente real.

---

## 34. Regra de ouro

Qualquer funcionalidade futura deve respeitar:

> O agente é uma nova porta de entrada para o NetzOS; ele não é um segundo NetzOS.

O agente pode criar, consultar e atualizar recursos autorizados pelo serviço operacional.

Supabase continua sendo a fonte de verdade.

Agenda continua sendo projeção.

Reunião continua sendo a entidade original.

Áudio e transcrição continuam vinculados a essa reunião.

Tarefas derivadas continuam sendo tarefas reais do mesmo núcleo.
