"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "./supabase";
import { migrateLegacyNetzOSData } from "./netzos-data";

export type OrganizationRef = {
  id: string;
  name: string;
};

export type WorkspaceRef = {
  id: string;
  organizationId: string;
  name: string;
};

export type OperationKind = "task" | "meeting" | "event";
export type TaskStatus = "todo" | "doing" | "done" | "cancelled";
export type EventStatus = "scheduled" | "held" | "cancelled";
export type Priority = "normal" | "important" | "urgent";

export type Operation = {
  id: string;
  kind: OperationKind;
  organizationId: string;
  workspaceId: string | null;
  title: string;
  description: string;
  status: TaskStatus | EventStatus;
  priority: Priority;
  date: string | null;
  time: string | null;
  endDate: string | null;
  endTime: string | null;
  timezone: string;
  location: string;
  responsible: "me" | null;
  people: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type OperationRow = {
  id: string;
  kind: OperationKind;
  organization_id: string;
  workspace_id: string | null;
  title: string;
  description: string;
  status: TaskStatus | EventStatus;
  priority: Priority;
  date: string | null;
  time: string | null;
  end_date: string | null;
  end_time: string | null;
  timezone: string;
  location: string;
  responsible_id: string | null;
  creator_id: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "A fazer",
  doing: "Em andamento",
  done: "Concluída",
  cancelled: "Cancelada",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  normal: "Normal",
  important: "Importante",
  urgent: "Urgente",
};

export const KIND_LABELS: Record<OperationKind, string> = {
  task: "Tarefa",
  meeting: "Reunião",
  event: "Compromisso",
};

export function makeOperationId() {
  const suffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return "op_" + suffix;
}

export function todayBelem(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Belem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((key) => parts.find((part) => part.type === key)?.value)
    .join("-");
}

export function addDays(date: string, amount: number) {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function startOfWeek(date: string) {
  const value = new Date(date + "T12:00:00Z");
  const offset = (value.getUTCDay() + 6) % 7;
  return addDays(date, -offset);
}

export function formatDate(date: string) {
  return new Date(date + "T12:00:00Z").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: date.slice(0, 4) !== todayBelem().slice(0, 4) ? "numeric" : undefined,
    timeZone: "UTC",
  });
}

export function formatLongDate(date: string) {
  return new Date(date + "T12:00:00Z").toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function shortTime(value: string | null) {
  return value ? value.slice(0, 5) : null;
}

export function useOperationsStore() {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationRef[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceRef[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = await getSupabase();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) throw userError;
    if (!user) {
      setOperations([]);
      setOrganizations([]);
      setWorkspaces([]);
      setUserId(null);
      setReady(true);
      return;
    }

    setUserId(user.id);
    await migrateLegacyNetzOSData(supabase, user.id);

    const [organizationResult, workspaceResult, operationResult, peopleResult] =
      await Promise.all([
        supabase
          .from("organizations")
          .select("id,name")
          .order("created_at", { ascending: false }),
        supabase
          .from("workspaces")
          .select("id,organization_id,name")
          .order("created_at", { ascending: false }),
        supabase
          .from("operational_items")
          .select(
            "id,kind,organization_id,workspace_id,title,description,status,priority,date,time,end_date,end_time,timezone,location,responsible_id,creator_id,created_at,updated_at,completed_at",
          )
          .order("created_at", { ascending: false }),
        supabase.from("operational_people").select("item_id,person_id"),
      ]);

    const firstError =
      organizationResult.error ||
      workspaceResult.error ||
      operationResult.error ||
      peopleResult.error;
    if (firstError) throw firstError;

    const peopleByItem = new Map<string, string[]>();
    for (const person of peopleResult.data || []) {
      const current = peopleByItem.get(person.item_id) || [];
      if (person.person_id === user.id) current.push("me");
      peopleByItem.set(person.item_id, current);
    }

    setOrganizations(
      (organizationResult.data || []).map((organization) => ({
        id: organization.id,
        name: organization.name,
      })),
    );

    setWorkspaces(
      (workspaceResult.data || []).map((workspace) => ({
        id: workspace.id,
        organizationId: workspace.organization_id,
        name: workspace.name,
      })),
    );

    setOperations(
      ((operationResult.data || []) as OperationRow[]).map((operation) => ({
        id: operation.id,
        kind: operation.kind,
        organizationId: operation.organization_id,
        workspaceId: operation.workspace_id,
        title: operation.title,
        description: operation.description,
        status: operation.status,
        priority: operation.priority,
        date: operation.date,
        time: shortTime(operation.time),
        endDate: operation.end_date,
        endTime: shortTime(operation.end_time),
        timezone: operation.timezone,
        location: operation.location,
        responsible: operation.responsible_id === user.id ? "me" : null,
        people: peopleByItem.get(operation.id) || [],
        createdAt: operation.created_at,
        updatedAt: operation.updated_at,
        completedAt: operation.completed_at,
      })),
    );

    setError(null);
    setReady(true);
  }, []);

  useEffect(() => {
    let active = true;

    void refresh().catch((cause) => {
      if (!active) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar os dados operacionais.",
      );
      setReady(true);
    });

    return () => {
      active = false;
    };
  }, [refresh]);

  const saveOperation = useCallback(
    async (operation: Operation) => {
      const supabase = await getSupabase();
      const currentUserId =
        userId ||
        (
          await supabase.auth.getUser()
        ).data.user?.id;

      if (!currentUserId) throw new Error("Sua sessão expirou.");

      const row = {
        id: operation.id,
        kind: operation.kind,
        organization_id: operation.organizationId,
        workspace_id: operation.workspaceId,
        title: operation.title.trim(),
        description: operation.description,
        status: operation.status,
        priority: operation.priority,
        visibility: "context",
        date: operation.date,
        time: operation.time,
        end_date: operation.endDate,
        end_time: operation.endTime,
        timezone: operation.timezone || "America/Belem",
        duration: 60,
        location: operation.location,
        responsible_id:
          operation.responsible === "me" ? currentUserId : null,
        origin: "manual",
        creator_id: currentUserId,
        details: {},
        updated_at: new Date().toISOString(),
        completed_at: operation.completedAt,
      };

      const { error: itemError } = await supabase
        .from("operational_items")
        .upsert(row, { onConflict: "id" });
      if (itemError) throw itemError;

      const { error: peopleDeleteError } = await supabase
        .from("operational_people")
        .delete()
        .eq("item_id", operation.id);
      if (peopleDeleteError) throw peopleDeleteError;

      if (operation.people.includes("me")) {
        const { error: peopleInsertError } = await supabase
          .from("operational_people")
          .insert({
            item_id: operation.id,
            person_id: currentUserId,
            role: "participant",
          });
        if (peopleInsertError) throw peopleInsertError;
      }

      await refresh();
    },
    [refresh, userId],
  );

  const updateOperationStatus = useCallback(
    async (operation: Operation, status: TaskStatus | EventStatus) => {
      const now = new Date().toISOString();
      const completed =
        status === "done" || status === "held" ? now : null;

      const supabase = await getSupabase();
      const { error: updateError } = await supabase
        .from("operational_items")
        .update({
          status,
          completed_at: completed,
          updated_at: now,
        })
        .eq("id", operation.id);

      if (updateError) throw updateError;
      await refresh();
    },
    [refresh],
  );

  return {
    operations,
    organizations,
    workspaces,
    ready,
    error,
    refresh,
    saveOperation,
    updateOperationStatus,
  };
}
