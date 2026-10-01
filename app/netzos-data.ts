"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

const LEGACY_ORGANIZATIONS_KEY = "netzos.organizations.v1";
const LEGACY_OPERATIONS_KEY = "netzos.operations.v1";
const migrationPromises = new Map<string, Promise<void>>();

type LegacyOrganization = {
  id: string;
  name: string;
  createdAt?: string;
};

type LegacyWorkspace = {
  id: string;
  organizationId: string;
  name: string;
  createdAt?: string;
};

type LegacyOperation = {
  id: string;
  kind: "task" | "meeting" | "event";
  organizationId: string;
  workspaceId?: string | null;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  date?: string | null;
  time?: string | null;
  endDate?: string | null;
  endTime?: string | null;
  timezone?: string;
  location?: string;
  responsible?: string;
  people?: string[];
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
};

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function legacyValue<T>(baseKey: string, userId: string) {
  return readJson<T>(baseKey + ":" + userId) || readJson<T>(baseKey);
}

export function makeResourceId(prefix: string) {
  const suffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix + "_" + suffix;
}

async function runMigration(supabase: SupabaseClient, userId: string) {
  if (typeof window === "undefined") return;

  const marker = "netzos.supabase.migrated.v1:" + userId;
  if (localStorage.getItem(marker) === "1") return;

  const context = legacyValue<{
    organizations?: LegacyOrganization[];
    workspaces?: LegacyWorkspace[];
  }>(LEGACY_ORGANIZATIONS_KEY, userId);

  const organizations = Array.isArray(context?.organizations)
    ? context!.organizations!.filter((item) => item?.id && item?.name)
    : [];
  const workspaces = Array.isArray(context?.workspaces)
    ? context!.workspaces!.filter((item) => item?.id && item?.name && item?.organizationId)
    : [];

  if (organizations.length > 0) {
    const { error } = await supabase.from("organizations").upsert(
      organizations.map((organization) => ({
        id: organization.id,
        owner_id: userId,
        name: organization.name.trim(),
        created_at: organization.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "id" },
    );
    if (error) throw error;
  }

  if (workspaces.length > 0) {
    const { error } = await supabase.from("workspaces").upsert(
      workspaces.map((workspace) => ({
        id: workspace.id,
        owner_id: userId,
        organization_id: workspace.organizationId,
        name: workspace.name.trim(),
        created_at: workspace.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "id" },
    );
    if (error) throw error;
  }

  const legacyOperations =
    legacyValue<LegacyOperation[]>(LEGACY_OPERATIONS_KEY, userId) || [];
  const operations = Array.isArray(legacyOperations)
    ? legacyOperations.filter(
        (item) =>
          item?.id &&
          item?.organizationId &&
          item?.title &&
          ["task", "meeting", "event"].includes(item.kind),
      )
    : [];

  if (operations.length > 0) {
    const { error } = await supabase.from("operational_items").upsert(
      operations.map((operation) => ({
        id: operation.id,
        kind: operation.kind,
        organization_id: operation.organizationId,
        workspace_id: operation.workspaceId || null,
        title: operation.title.trim(),
        description: operation.description || "",
        status:
          operation.status ||
          (operation.kind === "task" ? "todo" : "scheduled"),
        priority: operation.priority || "normal",
        visibility: "context",
        date: operation.date || null,
        time: operation.time || null,
        end_date: operation.endDate || null,
        end_time: operation.endTime || null,
        timezone: operation.timezone || "America/Belem",
        duration: 60,
        location: operation.location || "",
        responsible_id: userId,
        origin: "manual",
        creator_id: userId,
        details: {},
        version: 0,
        created_at: operation.createdAt || new Date().toISOString(),
        updated_at: operation.updatedAt || new Date().toISOString(),
        completed_at: operation.completedAt || null,
      })),
      { onConflict: "id" },
    );
    if (error) throw error;

    const people = operations
      .filter(
        (operation) =>
          operation.responsible === "me" ||
          (Array.isArray(operation.people) && operation.people.includes("me")),
      )
      .map((operation) => ({
        item_id: operation.id,
        person_id: userId,
        role: operation.responsible === "me" ? "responsible" : "participant",
      }));

    if (people.length > 0) {
      const { error } = await supabase
        .from("operational_people")
        .upsert(people, { onConflict: "item_id,person_id" });
      if (error) throw error;
    }
  }

  localStorage.setItem(marker, "1");
}

export function migrateLegacyNetzOSData(
  supabase: SupabaseClient,
  userId: string,
) {
  const existing = migrationPromises.get(userId);
  if (existing) return existing;

  const promise = runMigration(supabase, userId).catch((error) => {
    migrationPromises.delete(userId);
    throw error;
  });

  migrationPromises.set(userId, promise);
  return promise;
}
