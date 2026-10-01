import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.108.2";

const URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BUCKET = "netzos-operational";
const MAX_FILE = 100 * 1024 * 1024;
const WRITE_ROLES = ["owner", "admin", "developer", "editor"];
const ADMIN_ROLES = ["owner", "admin"];
const AUDIO_MIMES = [
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/webm",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
  "audio/flac"
];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-idempotency-key",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, OPTIONS",
  "Access-Control-Max-Age": "86400"
};

const admin = createClient(URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function id(prefix: string) {
  return prefix + "_" + crypto.randomUUID();
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function apiError(code: string, message: string, status: number, detail?: unknown): never {
  const error: any = new Error(message);
  error.code = code;
  error.status = status;
  error.detail = detail;
  throw error;
}

async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64url(bytes: Uint8Array) {
  let raw = "";
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function text(value: unknown, name: string, max = 500, optional = false) {
  if ((value === undefined || value === null || value === "") && optional) return null;
  if (typeof value !== "string") apiError("invalid_request", name + " inválido.", 400);
  const result = value.trim();
  if (!result || result.length > max) apiError("invalid_request", name + " inválido.", 400);
  return result;
}

function date(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    apiError("invalid_request", "Data inválida; use YYYY-MM-DD.", 400);
  }
  return value;
}

function time(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) {
    apiError("invalid_request", "Hora inválida; use HH:MM.", 400);
  }
  return value.slice(0, 5);
}

function details(value: unknown) {
  const raw: any = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    checklist: Array.isArray(raw.checklist) ? raw.checklist.slice(0, 500) : [],
    topics: Array.isArray(raw.topics) ? raw.topics.slice(0, 200) : [],
    summary: typeof raw.summary === "string" ? raw.summary.slice(0, 50000) : "",
    decisions: typeof raw.decisions === "string" ? raw.decisions.slice(0, 50000) : "",
    notes: typeof raw.notes === "string" ? raw.notes.slice(0, 50000) : "",
    previousMeetingId: typeof raw.previousMeetingId === "string" ? raw.previousMeetingId : null
  };
}

function cleanName(value: string) {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(-120) || "arquivo";
}

async function body(req: Request) {
  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > 1000000) apiError("payload_too_large", "Payload muito grande.", 413);
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, any>;
  } catch {
    apiError("invalid_request", "JSON inválido.", 400);
  }
}

function route(req: Request) {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const i = parts.lastIndexOf("netzos-api");
  return i >= 0 ? parts.slice(i + 1) : parts;
}

async function getBinding(bindingId: string) {
  const { data, error } = await admin.from("agent_channel_bindings").select("*").eq("id", bindingId).maybeSingle();
  if (error) throw error;
  return data;
}

async function authenticate(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) apiError("unauthorized", "Authorization Bearer obrigatório.", 401);
  const token = match[1].trim();

  if (token.startsWith("netzos_ak_")) {
    const tokenHash = await hash(token);
    const { data: credential, error } = await admin
      .from("agent_api_credentials")
      .select("id,owner_id,binding_id,active,expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error) throw error;
    if (!credential || !credential.active) apiError("unauthorized", "Credencial inválida.", 401);
    if (credential.expires_at && Date.parse(credential.expires_at) <= Date.now()) {
      apiError("unauthorized", "Credencial expirada.", 401);
    }
    const binding = await getBinding(credential.binding_id);
    if (!binding || !binding.active || binding.owner_id !== credential.owner_id) {
      apiError("forbidden", "Binding inativo.", 403);
    }
    await admin.from("agent_api_credentials").update({ last_used_at: new Date().toISOString() }).eq("id", credential.id);
    return {
      kind: "integration",
      ownerId: credential.owner_id,
      source: binding.provider === "mock" ? "mock_agent" : binding.provider,
      origin: binding.provider === "mock" ? "agent" : binding.provider,
      binding,
      credentialId: credential.id
    };
  }

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) apiError("unauthorized", "Sessão Supabase inválida.", 401);
  return { kind: "user", ownerId: data.user.id, source: "api", origin: "api", binding: null, credentialId: null };
}

async function grants(userId: string) {
  const { data, error } = await admin
    .from("access_grants")
    .select("kind,resource_id,role")
    .eq("user_id", userId)
    .not("accepted_at", "is", null)
    .gt("expires_at", new Date().toISOString());
  if (error) throw error;
  return data || [];
}

async function roleFor(userId: string, organizationId: string, workspaceId: string | null) {
  const { data: org, error } = await admin.from("organizations").select("id,owner_id").eq("id", organizationId).maybeSingle();
  if (error) throw error;
  if (!org) return null;
  if (org.owner_id === userId) return "owner";

  let workspace: any = null;
  if (workspaceId) {
    const result = await admin.from("workspaces").select("id,owner_id,organization_id").eq("id", workspaceId).maybeSingle();
    if (result.error) throw result.error;
    workspace = result.data;
    if (!workspace || workspace.organization_id !== organizationId) return null;
    if (workspace.owner_id === userId) return "owner";
  }

  const all = await grants(userId);
  const priority = ["viewer", "operator", "editor", "developer", "admin", "owner"];
  const matches = all
    .filter((g: any) =>
      (g.kind === "organization" && g.resource_id === organizationId) ||
      (workspace && g.kind === "workspace" && g.resource_id === workspace.id)
    )
    .map((g: any) => g.role)
    .sort((a: string, b: string) => priority.indexOf(b) - priority.indexOf(a));
  return matches[0] || null;
}

async function requireRole(userId: string, organizationId: string, workspaceId: string | null, allowed: string[]) {
  const role = await roleFor(userId, organizationId, workspaceId);
  if (!role || !allowed.includes(role)) apiError("forbidden", "Sem permissão para este contexto.", 403);
  return role;
}

async function context(actor: any, payload: any, management = false) {
  if (actor.kind === "integration") {
    const b = actor.binding;
    await requireRole(actor.ownerId, b.organization_id, b.workspace_id, management ? ADMIN_ROLES : WRITE_ROLES);
    return {
      organizationId: b.organization_id,
      workspaceId: b.workspace_id,
      visibility: b.default_visibility,
      bindingId: b.id
    };
  }
  const organizationId = text(payload.organization_id, "organization_id", 200) as string;
  const workspaceId = text(payload.workspace_id, "workspace_id", 200, true) as string | null;
  await requireRole(actor.ownerId, organizationId, workspaceId, management ? ADMIN_ROLES : WRITE_ROLES);
  return {
    organizationId,
    workspaceId,
    visibility: payload.visibility === "private" ? "private" : "context",
    bindingId: null
  };
}

async function meeting(meetingId: string) {
  const { data, error } = await admin.from("operational_items").select("*").eq("id", meetingId).eq("kind", "meeting").maybeSingle();
  if (error) throw error;
  if (!data) apiError("not_found", "Reunião não encontrada.", 404);
  return data;
}

async function canRead(actor: any, item: any) {
  if (actor.kind === "integration") {
    const b = actor.binding;
    return b.active && b.organization_id === item.organization_id && b.workspace_id === item.workspace_id;
  }
  if (item.creator_id === actor.ownerId || item.responsible_id === actor.ownerId) return true;
  const { data } = await admin.from("operational_people").select("item_id").eq("item_id", item.id).eq("person_id", actor.ownerId).maybeSingle();
  if (data) return true;
  if (item.visibility === "private") return false;
  return !!(await roleFor(actor.ownerId, item.organization_id, item.workspace_id));
}

async function requireRead(actor: any, item: any) {
  if (!(await canRead(actor, item))) apiError("forbidden", "Sem acesso a esta reunião.", 403);
}

async function requireWrite(actor: any, item: any) {
  if (actor.kind === "integration") {
    const b = actor.binding;
    if (!b.active || b.organization_id !== item.organization_id || b.workspace_id !== item.workspace_id) {
      apiError("forbidden", "Reunião fora do binding.", 403);
    }
    await requireRole(actor.ownerId, item.organization_id, item.workspace_id, WRITE_ROLES);
    return;
  }
  if (item.creator_id === actor.ownerId || item.responsible_id === actor.ownerId) return;
  await requireRole(actor.ownerId, item.organization_id, item.workspace_id, WRITE_ROLES);
}

async function audit(actor: any, action: string, resource: string, detail: any = {}) {
  const { error } = await admin.from("audit_events").insert({
    id: id("audit"),
    owner_id: actor.ownerId,
    actor_id: actor.ownerId,
    action,
    resource,
    detail: {
      source: actor.source,
      binding_id: actor.binding?.id || null,
      credential_id: actor.credentialId || null,
      ...detail
    }
  });
  if (error) console.error("audit_error", error.message);
}

async function ref(actor: any, type: string, externalId: string) {
  const { data, error } = await admin
    .from("external_operation_refs")
    .select("id,operation_id,metadata,version")
    .eq("owner_id", actor.ownerId)
    .eq("source", actor.source)
    .eq("external_type", type)
    .eq("external_id", externalId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function saveRef(actor: any, type: string, externalId: string, operationId: string, metadata: any = {}) {
  const { error } = await admin.from("external_operation_refs").insert({
    id: id("xref"),
    owner_id: actor.ownerId,
    binding_id: actor.binding?.id || null,
    source: actor.source,
    external_type: type,
    external_id: externalId,
    operation_id: operationId,
    metadata,
    version: 0
  });
  if (error) throw error;
}

async function claim(actor: any, externalEventId: string, eventType: string, payload: any) {
  const payloadHash = await hash(JSON.stringify(payload));
  const { data: existing, error } = await admin
    .from("external_ingestion_events")
    .select("*")
    .eq("owner_id", actor.ownerId)
    .eq("source", actor.source)
    .eq("external_event_id", externalEventId)
    .maybeSingle();
  if (error) throw error;
  if (existing) {
    if (existing.payload_hash !== payloadHash) apiError("idempotency_conflict", "external_event_id já usado com payload diferente.", 409);
    return { duplicate: true, row: existing };
  }
  const rowId = id("evt");
  const insert = await admin.from("external_ingestion_events").insert({
    id: rowId,
    owner_id: actor.ownerId,
    binding_id: actor.binding?.id || null,
    source: actor.source,
    external_event_id: externalEventId,
    event_type: eventType,
    payload_hash: payloadHash,
    status: "processing",
    detail: {}
  });
  if (insert.error) {
    if (insert.error.code === "23505") return claim(actor, externalEventId, eventType, payload);
    throw insert.error;
  }
  return { duplicate: false, row: { id: rowId } };
}

async function finish(eventId: string, status: "processed" | "failed", values: any) {
  await admin.from("external_ingestion_events").update({
    status,
    operation_id: values.operationId || null,
    file_id: values.fileId || null,
    detail: values.detail || {},
    error: values.error || null,
    processed_at: new Date().toISOString()
  }).eq("id", eventId);
}

async function participantIds(value: unknown) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 100) apiError("invalid_request", "participants inválido.", 400);
  const ids = Array.from(new Set(value.filter((v) => typeof v === "string"))) as string[];
  if (!ids.length) return [];
  const { data, error } = await admin.from("profiles").select("id").in("id", ids);
  if (error) throw error;
  if ((data || []).length !== ids.length) apiError("invalid_request", "Participante inexistente.", 400);
  return ids;
}

async function replacePeople(itemId: string, people: string[], responsibleId: string | null) {
  const del = await admin.from("operational_people").delete().eq("item_id", itemId);
  if (del.error) throw del.error;
  if (!people.length) return;
  const ins = await admin.from("operational_people").insert(people.map((personId) => ({
    item_id: itemId,
    person_id: personId,
    role: personId === responsibleId ? "responsible" : "participant"
  })));
  if (ins.error) throw ins.error;
}

async function createMeeting(actor: any, payload: any) {
  const externalId = text(payload.external_id, "external_id", 500) as string;
  const existing = await ref(actor, "meeting", externalId);
  if (existing) {
    const item = await meeting(existing.operation_id);
    await requireRead(actor, item);
    return { item, created: false };
  }

  const ctx = await context(actor, payload);
  const title = text(payload.title, "title", 200) as string;
  const people = await participantIds(payload.participants);
  const responsibleId = text(payload.responsible_id, "responsible_id", 100, true) as string | null;
  if (responsibleId) await participantIds([responsibleId]);
  const duration = payload.duration === undefined ? 60 : Math.trunc(Number(payload.duration));
  if (!Number.isFinite(duration) || duration < 1 || duration > 10080) apiError("invalid_request", "duration inválida.", 400);

  const operationId = id("op");
  const now = new Date().toISOString();
  const row = {
    id: operationId,
    kind: "meeting",
    organization_id: ctx.organizationId,
    workspace_id: ctx.workspaceId,
    title,
    description: typeof payload.description === "string" ? payload.description.slice(0, 50000) : "",
    status: ["scheduled", "held", "cancelled"].includes(payload.status) ? payload.status : "scheduled",
    priority: "normal",
    visibility: actor.kind === "integration" ? ctx.visibility : payload.visibility === "private" ? "private" : "context",
    date: date(payload.date),
    time: time(payload.time),
    end_date: date(payload.end_date),
    end_time: time(payload.end_time),
    timezone: typeof payload.timezone === "string" && payload.timezone.length <= 100 ? payload.timezone : "America/Belem",
    duration,
    location: typeof payload.location === "string" ? payload.location.slice(0, 500) : "",
    responsible_id: responsibleId,
    meeting_id: null,
    origin: actor.origin,
    creator_id: actor.ownerId,
    details: details(payload.details),
    version: 0,
    created_at: now,
    updated_at: now
  };

  const ins = await admin.from("operational_items").insert(row);
  if (ins.error) throw ins.error;
  try {
    await replacePeople(operationId, people, responsibleId);
    await saveRef(actor, "meeting", externalId, operationId, {
      binding_id: ctx.bindingId,
      external_channel_id: actor.binding?.external_channel_id || null
    });
  } catch (cause) {
    await admin.from("operational_items").delete().eq("id", operationId);
    throw cause;
  }
  await audit(actor, "agent.meeting.created", operationId, { external_id: externalId });
  return { item: row, created: true };
}

async function bundle(actor: any, meetingId: string) {
  const item = await meeting(meetingId);
  await requireRead(actor, item);
  const [people, comments, files, transcript, tasks] = await Promise.all([
    admin.from("operational_people").select("person_id,role").eq("item_id", meetingId),
    admin.from("operational_comments").select("id,author_id,body,created_at").eq("item_id", meetingId).order("created_at"),
    admin.from("operational_files").select("id,name,mime,size,purpose,object_key,author_id,created_at").eq("item_id", meetingId).order("created_at", { ascending: false }),
    admin.from("operational_transcripts").select("text,segments,source,generated_at,author_id,updated_at,version").eq("item_id", meetingId).maybeSingle(),
    admin.from("operational_items").select("id,title,status,priority,date,time,responsible_id,version").eq("kind", "task").eq("meeting_id", meetingId).order("created_at")
  ]);
  const error = people.error || comments.error || files.error || transcript.error || tasks.error;
  if (error) throw error;
  const media = await Promise.all((files.data || []).map(async (file: any) => {
    const signed = await admin.storage.from(BUCKET).createSignedUrl(file.object_key, 300);
    return {
      id: file.id,
      name: file.name,
      mime: file.mime,
      size: file.size,
      purpose: file.purpose,
      author_id: file.author_id,
      created_at: file.created_at,
      signed_url: signed.data?.signedUrl || null,
      expires_in: 300
    };
  }));
  return {
    meeting: item,
    participants: people.data || [],
    comments: comments.data || [],
    files: media,
    transcript: transcript.data || null,
    tasks: tasks.data || []
  };
}

async function patchMeeting(actor: any, meetingId: string, payload: any) {
  const item = await meeting(meetingId);
  await requireWrite(actor, item);
  if (!Number.isInteger(payload.version)) apiError("invalid_request", "version obrigatória.", 400);
  if (payload.version !== item.version) apiError("version_conflict", "Reunião alterada por outra origem.", 409, { current_version: item.version });

  const patch: any = { version: item.version + 1, updated_at: new Date().toISOString() };
  if (payload.title !== undefined) patch.title = text(payload.title, "title", 200);
  if (payload.description !== undefined) patch.description = String(payload.description).slice(0, 50000);
  if (payload.status !== undefined) {
    if (!["scheduled", "held", "cancelled"].includes(payload.status)) apiError("invalid_request", "status inválido.", 400);
    patch.status = payload.status;
  }
  if (payload.date !== undefined) patch.date = date(payload.date);
  if (payload.time !== undefined) patch.time = time(payload.time);
  if (payload.end_date !== undefined) patch.end_date = date(payload.end_date);
  if (payload.end_time !== undefined) patch.end_time = time(payload.end_time);
  if (payload.duration !== undefined) {
    const duration = Math.trunc(Number(payload.duration));
    if (!Number.isFinite(duration) || duration < 1 || duration > 10080) apiError("invalid_request", "duration inválida.", 400);
    patch.duration = duration;
  }
  if (payload.location !== undefined) patch.location = String(payload.location).slice(0, 500);
  if (payload.details !== undefined) patch.details = details(payload.details);
  if (actor.kind === "user" && payload.visibility !== undefined) patch.visibility = payload.visibility === "private" ? "private" : "context";

  const update = await admin.from("operational_items")
    .update(patch)
    .eq("id", meetingId)
    .eq("version", item.version)
    .select("*")
    .maybeSingle();
  if (update.error) throw update.error;
  if (!update.data) apiError("version_conflict", "Reunião alterada por outra origem.", 409);

  if (payload.participants !== undefined) {
    const people = await participantIds(payload.participants);
    await replacePeople(meetingId, people, update.data.responsible_id);
  }
  await audit(actor, "agent.meeting.updated", meetingId, { version: update.data.version });
  return update.data;
}

async function transcript(actor: any, meetingId: string, payload: any, skipClaim = false) {
  const item = await meeting(meetingId);
  await requireWrite(actor, item);
  const externalId = text(payload.external_id, "external_id", 500) as string;
  let event: any = null;
  if (!skipClaim) {
    event = await claim(actor, externalId, "meeting.transcript", payload);
    if (event.duplicate) return { duplicate: true, ...(event.row.detail || {}) };
  }

  try {
    const current = await admin.from("operational_transcripts").select("version").eq("item_id", meetingId).maybeSingle();
    if (current.error) throw current.error;
    const version = (current.data?.version || 0) + 1;
    const upsert = await admin.from("operational_transcripts").upsert({
      item_id: meetingId,
      text: typeof payload.text === "string" ? payload.text.slice(0, 500000) : "",
      segments: Array.isArray(payload.segments) ? payload.segments.slice(0, 10000) : [],
      source: actor.source,
      generated_at: typeof payload.generated_at === "string" ? payload.generated_at : new Date().toISOString(),
      author_id: actor.ownerId,
      updated_at: new Date().toISOString(),
      version
    }, { onConflict: "item_id" });
    if (upsert.error) throw upsert.error;
    const result = { meeting_id: meetingId, version };
    if (event && !event.duplicate) await finish(event.row.id, "processed", { operationId: meetingId, detail: result });
    await audit(actor, "agent.transcript.updated", meetingId, { external_id: externalId, version });
    return { duplicate: false, ...result };
  } catch (cause) {
    if (event && !event.duplicate) await finish(event.row.id, "failed", { operationId: meetingId, error: (cause as Error).message });
    throw cause;
  }
}

async function addText(actor: any, meetingId: string, payload: any, skipClaim = false) {
  const item = await meeting(meetingId);
  await requireWrite(actor, item);
  const externalId = text(payload.external_id, "external_id", 500) as string;
  const type = text(payload.type, "type", 40) as string;
  const value = text(payload.text, "text", 50000) as string;
  if (!["comment", "note", "summary", "decision", "transcript"].includes(type)) {
    apiError("invalid_request", "type não suportado.", 400);
  }

  let event: any = null;
  if (!skipClaim) {
    event = await claim(actor, externalId, "meeting." + type, payload);
    if (event.duplicate) return { duplicate: true, result: event.row.detail };
  }

  try {
    let result: any;
    if (type === "comment") {
      const commentId = id("comment");
      const ins = await admin.from("operational_comments").insert({
        id: commentId,
        item_id: meetingId,
        author_id: actor.ownerId,
        body: value
      });
      if (ins.error) throw ins.error;
      result = { comment_id: commentId };
    } else if (type === "transcript") {
      result = await transcript(actor, meetingId, {
        external_id: externalId,
        text: value,
        segments: [],
        generated_at: payload.occurred_at
      }, true);
    } else {
      const next = details(item.details);
      if (type === "note") next.notes = [next.notes, value].filter(Boolean).join("\n\n");
      if (type === "summary") next.summary = value;
      if (type === "decision") next.decisions = [next.decisions, value].filter(Boolean).join("\n\n");
      const update = await admin.from("operational_items")
        .update({ details: next, version: item.version + 1, updated_at: new Date().toISOString() })
        .eq("id", meetingId)
        .eq("version", item.version)
        .select("id,version")
        .maybeSingle();
      if (update.error) throw update.error;
      if (!update.data) apiError("version_conflict", "Reunião alterada durante a atualização.", 409);
      result = { meeting_id: meetingId, version: update.data.version };
    }
    if (event && !event.duplicate) await finish(event.row.id, "processed", { operationId: meetingId, detail: result });
    await audit(actor, "agent.text.received", meetingId, { external_id: externalId, type });
    return { duplicate: false, result };
  } catch (cause) {
    if (event && !event.duplicate) await finish(event.row.id, "failed", { operationId: meetingId, error: (cause as Error).message });
    throw cause;
  }
}

async function startUpload(actor: any, meetingId: string, payload: any) {
  const item = await meeting(meetingId);
  await requireWrite(actor, item);
  const externalId = text(payload.external_id, "external_id", 500) as string;
  const name = text(payload.name, "name", 300) as string;
  const mime = (text(payload.mime, "mime", 150) as string).toLowerCase();
  const size = Math.trunc(Number(payload.size));
  const purpose = payload.purpose === "attachment" ? "attachment" : "recording";

  if (!Number.isFinite(size) || size < 0 || size > MAX_FILE) apiError("payload_too_large", "Arquivo excede 100 MB.", 413);
  if (purpose === "recording" && !AUDIO_MIMES.includes(mime)) apiError("unsupported_media_type", "Tipo de áudio não suportado.", 415);

  const existing = await admin.from("external_media_uploads")
    .select("*")
    .eq("owner_id", actor.ownerId)
    .eq("operation_id", meetingId)
    .eq("external_id", externalId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.status === "completed") {
    return { completed: true, upload_id: existing.data.id, object_key: existing.data.object_key };
  }

  let upload = existing.data;
  if (!upload || upload.status !== "pending" || Date.parse(upload.expires_at) <= Date.now()) {
    const uploadId = id("file");
    const objectKey = actor.ownerId + "/" + meetingId + "/" + uploadId + "-" + cleanName(name);
    const row = {
      id: uploadId,
      owner_id: actor.ownerId,
      binding_id: actor.binding?.id || null,
      operation_id: meetingId,
      external_id: externalId,
      object_key: objectKey,
      name,
      mime,
      size,
      purpose,
      status: "pending",
      expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    };
    const upsert = await admin.from("external_media_uploads")
      .upsert(row, { onConflict: "owner_id,operation_id,external_id" })
      .select("*")
      .single();
    if (upsert.error) throw upsert.error;
    upload = upsert.data;
  }

  const signed = await admin.storage.from(BUCKET).createSignedUploadUrl(upload.object_key);
  if (signed.error) throw signed.error;
  await audit(actor, "agent.recording.upload_started", meetingId, {
    external_id: externalId,
    upload_id: upload.id,
    mime,
    size
  });
  return {
    completed: false,
    upload_id: upload.id,
    object_key: upload.object_key,
    expires_at: upload.expires_at,
    signed_upload: signed.data
  };
}

async function completeUpload(actor: any, meetingId: string, uploadId: string) {
  const item = await meeting(meetingId);
  await requireWrite(actor, item);
  const result = await admin.from("external_media_uploads")
    .select("*")
    .eq("id", uploadId)
    .eq("owner_id", actor.ownerId)
    .eq("operation_id", meetingId)
    .maybeSingle();
  if (result.error) throw result.error;
  const upload = result.data;
  if (!upload) apiError("not_found", "Upload não encontrado.", 404);
  if (upload.status === "completed") return { file_id: upload.id, completed: true };
  if (Date.parse(upload.expires_at) <= Date.now()) {
    await admin.from("external_media_uploads").update({ status: "expired" }).eq("id", upload.id);
    apiError("invalid_request", "Upload expirado.", 422);
  }

  const slash = upload.object_key.lastIndexOf("/");
  const folder = upload.object_key.slice(0, slash);
  const filename = upload.object_key.slice(slash + 1);
  const listed = await admin.storage.from(BUCKET).list(folder, { limit: 100, search: filename });
  if (listed.error) throw listed.error;
  const object = (listed.data || []).find((entry: any) => entry.name === filename);
  if (!object) apiError("invalid_request", "Arquivo ainda não enviado ao Storage.", 422);
  const storedSize = Number((object.metadata as any)?.size || 0);
  if (storedSize && storedSize !== Number(upload.size)) {
    await admin.from("external_media_uploads").update({ status: "failed" }).eq("id", upload.id);
    apiError("invalid_request", "Tamanho do arquivo diferente do esperado.", 422);
  }

  const file = await admin.from("operational_files").upsert({
    id: upload.id,
    item_id: meetingId,
    object_key: upload.object_key,
    name: upload.name,
    mime: upload.mime,
    size: upload.size,
    purpose: upload.purpose,
    author_id: actor.ownerId
  }, { onConflict: "id" });
  if (file.error) throw file.error;

  await admin.from("external_media_uploads").update({
    status: "completed",
    completed_at: new Date().toISOString()
  }).eq("id", upload.id);
  await audit(actor, "agent.recording.attached", meetingId, {
    file_id: upload.id,
    external_id: upload.external_id
  });
  return { file_id: upload.id, completed: true };
}

async function media(actor: any, meetingId: string) {
  const item = await meeting(meetingId);
  await requireRead(actor, item);
  const result = await admin.from("operational_files")
    .select("id,name,mime,size,purpose,object_key,author_id,created_at")
    .eq("item_id", meetingId)
    .order("created_at", { ascending: false });
  if (result.error) throw result.error;
  return Promise.all((result.data || []).map(async (file: any) => {
    const signed = await admin.storage.from(BUCKET).createSignedUrl(file.object_key, 300);
    return {
      id: file.id,
      name: file.name,
      mime: file.mime,
      size: file.size,
      purpose: file.purpose,
      author_id: file.author_id,
      created_at: file.created_at,
      signed_url: signed.data?.signedUrl || null,
      expires_in: 300
    };
  }));
}

async function createTask(actor: any, meetingId: string, payload: any) {
  const item = await meeting(meetingId);
  await requireWrite(actor, item);
  const externalId = text(payload.external_id, "external_id", 500) as string;
  const existing = await ref(actor, "task", externalId);
  if (existing) return { id: existing.operation_id, created: false };

  const taskId = id("op");
  const responsibleId = (text(payload.responsible_id, "responsible_id", 100, true) as string | null) || actor.ownerId;
  await participantIds([responsibleId]);
  const title = text(payload.title, "title", 200) as string;
  const priority = ["normal", "important", "urgent"].includes(payload.priority) ? payload.priority : "normal";
  const now = new Date().toISOString();
  const insert = await admin.from("operational_items").insert({
    id: taskId,
    kind: "task",
    organization_id: item.organization_id,
    workspace_id: item.workspace_id,
    title,
    description: typeof payload.description === "string" ? payload.description.slice(0, 50000) : "",
    status: "todo",
    priority,
    visibility: item.visibility,
    date: date(payload.date),
    time: time(payload.time),
    timezone: item.timezone,
    duration: 60,
    location: "",
    responsible_id: responsibleId,
    meeting_id: meetingId,
    origin: "meeting",
    creator_id: actor.ownerId,
    details: details(null),
    version: 0,
    created_at: now,
    updated_at: now
  });
  if (insert.error) throw insert.error;
  try {
    await replacePeople(taskId, [responsibleId], responsibleId);
    await saveRef(actor, "task", externalId, taskId, { meeting_id: meetingId, topic_id: payload.topic_id || null });
  } catch (cause) {
    await admin.from("operational_items").delete().eq("id", taskId);
    throw cause;
  }
  await audit(actor, "agent.task.created", taskId, { meeting_id: meetingId, external_id: externalId });
  return { id: taskId, created: true };
}

async function listBindings(actor: any) {
  if (actor.kind !== "user") apiError("forbidden", "Somente usuário NetzOS gerencia bindings.", 403);
  const result = await admin.from("agent_channel_bindings")
    .select("id,provider,external_channel_id,channel_type,label,organization_id,workspace_id,default_visibility,active,created_at,updated_at")
    .eq("owner_id", actor.ownerId)
    .order("created_at", { ascending: false });
  if (result.error) throw result.error;
  return result.data || [];
}

async function saveBinding(actor: any, payload: any) {
  if (actor.kind !== "user") apiError("forbidden", "Somente usuário NetzOS cria bindings.", 403);
  const organizationId = text(payload.organization_id, "organization_id", 200) as string;
  const workspaceId = text(payload.workspace_id, "workspace_id", 200, true) as string | null;
  await requireRole(actor.ownerId, organizationId, workspaceId, ADMIN_ROLES);
  const provider = (text(payload.provider || "mock", "provider", 40) as string);
  if (!["mock", "api", "whatsapp", "telegram"].includes(provider)) apiError("invalid_request", "provider inválido.", 400);
  const externalChannelId = text(payload.external_channel_id, "external_channel_id", 300) as string;
  const row = {
    id: id("binding"),
    owner_id: actor.ownerId,
    provider,
    external_channel_id: externalChannelId,
    channel_type: ["group", "direct", "system"].includes(payload.channel_type) ? payload.channel_type : "group",
    label: typeof payload.label === "string" ? payload.label.slice(0, 150) : "",
    organization_id: organizationId,
    workspace_id: workspaceId,
    default_visibility: payload.default_visibility === "private" ? "private" : "context",
    active: payload.active !== false,
    updated_at: new Date().toISOString()
  };
  const result = await admin.from("agent_channel_bindings")
    .upsert(row, { onConflict: "owner_id,provider,external_channel_id" })
    .select("id,provider,external_channel_id,channel_type,label,organization_id,workspace_id,default_visibility,active,created_at,updated_at")
    .single();
  if (result.error) throw result.error;
  await audit(actor, "integration.binding.saved", result.data.id, { provider, external_channel_id: externalChannelId });
  return result.data;
}

async function patchBinding(actor: any, bindingId: string, payload: any) {
  if (actor.kind !== "user") apiError("forbidden", "Somente usuário NetzOS altera bindings.", 403);
  const current = await admin.from("agent_channel_bindings").select("*").eq("id", bindingId).eq("owner_id", actor.ownerId).maybeSingle();
  if (current.error) throw current.error;
  if (!current.data) apiError("not_found", "Binding não encontrado.", 404);
  await requireRole(actor.ownerId, current.data.organization_id, current.data.workspace_id, ADMIN_ROLES);
  const patch: any = { updated_at: new Date().toISOString() };
  if (payload.active !== undefined) patch.active = !!payload.active;
  if (payload.label !== undefined) patch.label = String(payload.label).slice(0, 150);
  if (payload.default_visibility !== undefined) patch.default_visibility = payload.default_visibility === "private" ? "private" : "context";
  const result = await admin.from("agent_channel_bindings")
    .update(patch)
    .eq("id", bindingId)
    .eq("owner_id", actor.ownerId)
    .select("id,provider,external_channel_id,channel_type,label,organization_id,workspace_id,default_visibility,active,created_at,updated_at")
    .single();
  if (result.error) throw result.error;
  await audit(actor, "integration.binding.updated", bindingId, patch);
  return result.data;
}

async function credential(actor: any, bindingId: string, payload: any) {
  if (actor.kind !== "user") apiError("forbidden", "Somente usuário NetzOS gera credenciais.", 403);
  const current = await admin.from("agent_channel_bindings").select("*").eq("id", bindingId).eq("owner_id", actor.ownerId).maybeSingle();
  if (current.error) throw current.error;
  if (!current.data) apiError("not_found", "Binding não encontrado.", 404);
  await requireRole(actor.ownerId, current.data.organization_id, current.data.workspace_id, ADMIN_ROLES);

  const token = "netzos_ak_" + b64url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await hash(token);
  const credentialId = id("cred");
  const expiresAt = typeof payload.expires_at === "string" ? payload.expires_at : null;
  const insert = await admin.from("agent_api_credentials").insert({
    id: credentialId,
    owner_id: actor.ownerId,
    binding_id: bindingId,
    name: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim().slice(0, 150) : "Mock Agent",
    token_hash: tokenHash,
    token_prefix: token.slice(0, 18),
    active: true,
    expires_at: expiresAt
  });
  if (insert.error) throw insert.error;
  await audit(actor, "integration.credential.created", bindingId, { credential_id: credentialId });
  return {
    id: credentialId,
    token,
    token_prefix: token.slice(0, 18),
    expires_at: expiresAt,
    warning: "O token é exibido uma única vez."
  };
}

async function ingest(actor: any, payload: any) {
  let effective = actor;
  if (actor.kind === "user") {
    const bindingId = text(payload.binding_id, "binding_id", 200) as string;
    const b = await getBinding(bindingId);
    if (!b || b.owner_id !== actor.ownerId || !b.active) apiError("invalid_context", "Binding mock inválido.", 422);
    effective = {
      ...actor,
      source: b.provider === "mock" ? "mock_agent" : b.provider,
      origin: b.provider === "mock" ? "agent" : b.provider,
      binding: b
    };
  }

  const eventId = text(payload.event_id, "event_id", 500) as string;
  const event = payload.event;
  if (!event || typeof event !== "object" || Array.isArray(event)) apiError("invalid_request", "event obrigatório.", 400);
  const eventType = text(event.type, "event.type", 120) as string;
  if (payload.channel?.external_channel_id && effective.binding && payload.channel.external_channel_id !== effective.binding.external_channel_id) {
    apiError("invalid_context", "Canal diferente do binding.", 422);
  }

  const eventClaim = await claim(effective, eventId, eventType, payload);
  if (eventClaim.duplicate) {
    await audit(effective, "integration.event.duplicate", eventClaim.row.operation_id || eventId, { event_id: eventId });
    return { duplicate: true, event: eventClaim.row };
  }

  try {
    let result: any;
    let operationId: string | null = null;

    if (eventType === "meeting.created") {
      result = await createMeeting(effective, { ...(event.payload || {}), external_id: event.external_meeting_id || eventId });
      operationId = result.item.id;
    } else {
      const externalMeetingId = text(event.external_meeting_id, "event.external_meeting_id", 500) as string;
      const meetingRef = await ref(effective, "meeting", externalMeetingId);
      if (!meetingRef) apiError("not_found", "Reunião externa não encontrada.", 404);
      operationId = meetingRef.operation_id;

      if (eventType === "meeting.text") {
        result = await addText(effective, operationId, { ...(event.payload || {}), external_id: event.payload?.external_id || eventId }, true);
      } else if (eventType === "meeting.transcript") {
        result = await transcript(effective, operationId, { ...(event.payload || {}), external_id: event.payload?.external_id || eventId }, true);
      } else if (eventType === "meeting.task") {
        result = await createTask(effective, operationId, { ...(event.payload || {}), external_id: event.payload?.external_id || eventId });
      } else if (eventType === "meeting.media.upload") {
        result = await startUpload(effective, operationId, { ...(event.payload || {}), external_id: event.payload?.external_id || eventId });
      } else {
        apiError("invalid_request", "Tipo de evento não suportado.", 400);
      }
    }

    await finish(eventClaim.row.id, "processed", { operationId, detail: result });
    return { duplicate: false, event_id: eventClaim.row.id, result };
  } catch (cause) {
    await finish(eventClaim.row.id, "failed", { error: (cause as Error).message });
    await audit(effective, "integration.event.failed", eventId, { event_type: eventType });
    throw cause;
  }
}

async function handle(req: Request, requestId: string) {
  if (!URL || !SERVICE_KEY) apiError("dependency_unavailable", "Configuração Supabase indisponível.", 503);
  const parts = route(req);
  if (parts[0] !== "v1") apiError("not_found", "Rota não encontrada.", 404);

  if (req.method === "GET" && parts[1] === "health") {
    return json({ ok: true, service: "netzos-api", version: "v1", request_id: requestId });
  }

  const actor = await authenticate(req);

  if (parts[1] === "bindings") {
    if (req.method === "GET" && parts.length === 2) {
      return json({ ok: true, bindings: await listBindings(actor), request_id: requestId });
    }
    if (req.method === "POST" && parts.length === 2) {
      return json({ ok: true, binding: await saveBinding(actor, await body(req)), request_id: requestId }, 201);
    }
    if (req.method === "PATCH" && parts.length === 3) {
      return json({ ok: true, binding: await patchBinding(actor, parts[2], await body(req)), request_id: requestId });
    }
    if (req.method === "POST" && parts.length === 4 && parts[3] === "credentials") {
      return json({ ok: true, credential: await credential(actor, parts[2], await body(req)), request_id: requestId }, 201);
    }
  }

  if (parts[1] === "meetings") {
    if (req.method === "POST" && parts.length === 2) {
      const result = await createMeeting(actor, await body(req));
      return json({ ok: true, meeting: { ...result.item, created: result.created }, request_id: requestId }, result.created ? 201 : 200);
    }

    if (parts.length >= 3) {
      const meetingId = parts[2];
      if (req.method === "GET" && parts.length === 3) {
        return json({ ok: true, ...(await bundle(actor, meetingId)), request_id: requestId });
      }
      if (req.method === "PATCH" && parts.length === 3) {
        return json({ ok: true, meeting: await patchMeeting(actor, meetingId, await body(req)), request_id: requestId });
      }
      if (req.method === "POST" && parts.length === 4 && parts[3] === "texts") {
        return json({ ok: true, ...(await addText(actor, meetingId, await body(req))), request_id: requestId }, 201);
      }
      if (req.method === "PUT" && parts.length === 4 && parts[3] === "transcript") {
        return json({ ok: true, ...(await transcript(actor, meetingId, await body(req))), request_id: requestId });
      }
      if (parts[3] === "media") {
        if (req.method === "GET" && parts.length === 4) {
          return json({ ok: true, files: await media(actor, meetingId), request_id: requestId });
        }
        if (req.method === "POST" && parts.length === 5 && parts[4] === "upload") {
          return json({ ok: true, ...(await startUpload(actor, meetingId, await body(req))), request_id: requestId }, 201);
        }
        if (req.method === "POST" && parts.length === 6 && parts[5] === "complete") {
          return json({ ok: true, ...(await completeUpload(actor, meetingId, parts[4])), request_id: requestId });
        }
      }
      if (req.method === "POST" && parts.length === 4 && parts[3] === "tasks") {
        return json({ ok: true, task: await createTask(actor, meetingId, await body(req)), request_id: requestId }, 201);
      }
    }
  }

  if (req.method === "POST" && parts[1] === "ingest" && parts[2] === "events") {
    return json({ ok: true, ...(await ingest(actor, await body(req))), request_id: requestId }, 202);
  }

  apiError("not_found", "Rota não encontrada.", 404);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const requestId = id("req");
  const started = Date.now();
  try {
    const response = await handle(req, requestId);
    console.log(JSON.stringify({
      request_id: requestId,
      method: req.method,
      path: new URL(req.url).pathname,
      status: response.status,
      duration_ms: Date.now() - started
    }));
    return response;
  } catch (cause) {
    const error: any = cause;
    const status = error.status || 500;
    const code = error.code || "internal_error";
    const message = status >= 500 ? "Erro interno da API NetzOS." : error.message;
    console.error(JSON.stringify({
      request_id: requestId,
      method: req.method,
      path: new URL(req.url).pathname,
      status,
      code,
      error: error.message,
      duration_ms: Date.now() - started
    }));
    return json({
      ok: false,
      error: {
        code,
        message,
        request_id: requestId,
        ...(error.detail === undefined ? {} : { detail: error.detail })
      }
    }, status);
  }
});