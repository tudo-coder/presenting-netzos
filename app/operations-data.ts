"use client";

import { useCallback, useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import { migrateLegacyNetzOSData } from "./netzos-data";
import { logAudit } from "./reference-data";

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

export type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
  responsibleId?: string | null;
  order: number;
};

export type MeetingTopic = {
  id: string;
  title: string;
  notes: string;
  decision: string;
  linkedTaskIds: string[];
  order: number;
};

export type OperationDetails = {
  checklist: ChecklistItem[];
  topics: MeetingTopic[];
  summary: string;
  decisions: string;
  notes: string;
  previousMeetingId: string | null;
};

export const EMPTY_OPERATION_DETAILS: OperationDetails = {
  checklist: [],
  topics: [],
  summary: "",
  decisions: "",
  notes: "",
  previousMeetingId: null,
};

export type Operation = {
  id: string;
  kind: OperationKind;
  organizationId: string;
  workspaceId: string | null;
  title: string;
  description: string;
  status: TaskStatus | EventStatus;
  priority: Priority;
  visibility: "context" | "private";
  date: string | null;
  time: string | null;
  endDate: string | null;
  endTime: string | null;
  timezone: string;
  duration: number;
  location: string;
  responsible: "me" | null;
  responsibleId: string | null;
  people: string[];
  participantIds: string[];
  meetingId: string | null;
  origin: string;
  creatorId: string;
  details: OperationDetails;
  version: number;
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
  visibility: "context" | "private";
  date: string | null;
  time: string | null;
  end_date: string | null;
  end_time: string | null;
  timezone: string;
  duration: number;
  location: string;
  responsible_id: string | null;
  meeting_id: string | null;
  origin: string;
  creator_id: string;
  details: unknown;
  version: number;
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

export function makeOperationPartId(prefix: string) {
  const suffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix + "_" + suffix;
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

function normalizeDetails(value: unknown): OperationDetails {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<OperationDetails>)
      : {};

  return {
    checklist: Array.isArray(raw.checklist)
      ? raw.checklist.map((item, index) => ({
          id: item.id || makeOperationPartId("check"),
          text: item.text || "",
          done: !!item.done,
          responsibleId: item.responsibleId || null,
          order: typeof item.order === "number" ? item.order : index,
        }))
      : [],
    topics: Array.isArray(raw.topics)
      ? raw.topics.map((item, index) => ({
          id: item.id || makeOperationPartId("topic"),
          title: item.title || "",
          notes: item.notes || "",
          decision: item.decision || "",
          linkedTaskIds: Array.isArray(item.linkedTaskIds)
            ? item.linkedTaskIds
            : [],
          order: typeof item.order === "number" ? item.order : index,
        }))
      : [],
    summary: typeof raw.summary === "string" ? raw.summary : "",
    decisions: typeof raw.decisions === "string" ? raw.decisions : "",
    notes: typeof raw.notes === "string" ? raw.notes : "",
    previousMeetingId:
      typeof raw.previousMeetingId === "string" ? raw.previousMeetingId : null,
  };
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
            "id,kind,organization_id,workspace_id,title,description,status,priority,visibility,date,time,end_date,end_time,timezone,duration,location,responsible_id,meeting_id,origin,creator_id,details,version,created_at,updated_at,completed_at",
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
      current.push(person.person_id);
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
      ((operationResult.data || []) as OperationRow[]).map((operation) => {
        const participantIds = peopleByItem.get(operation.id) || [];
        return {
          id: operation.id,
          kind: operation.kind,
          organizationId: operation.organization_id,
          workspaceId: operation.workspace_id,
          title: operation.title,
          description: operation.description,
          status: operation.status,
          priority: operation.priority,
          visibility: operation.visibility || "context",
          date: operation.date,
          time: shortTime(operation.time),
          endDate: operation.end_date,
          endTime: shortTime(operation.end_time),
          timezone: operation.timezone,
          duration: operation.duration || 60,
          location: operation.location,
          responsible:
            operation.responsible_id === user.id ? "me" : null,
          responsibleId: operation.responsible_id,
          people: participantIds.includes(user.id) ? ["me"] : [],
          participantIds,
          meetingId: operation.meeting_id,
          origin: operation.origin || "manual",
          creatorId: operation.creator_id,
          details: normalizeDetails(operation.details),
          version: operation.version || 0,
          createdAt: operation.created_at,
          updatedAt: operation.updated_at,
          completedAt: operation.completed_at,
        } satisfies Operation;
      }),
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

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let channel: RealtimeChannel | null = null;

    const scheduleRefresh = () => {
      if (!active) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void refresh().catch((cause) => {
          if (!active) return;
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível atualizar os dados operacionais.",
          );
        });
      }, 120);
    };

    void getSupabase().then((supabase) => {
      if (!active) return;

      channel = supabase
        .channel("netzos-operational-live")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "operational_items" },
          scheduleRefresh,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "operational_people" },
          scheduleRefresh,
        )
        .subscribe();
    });

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      if (channel) {
        void getSupabase().then((supabase) => supabase.removeChannel(channel!));
      }
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

      const creatorId = operation.creatorId || currentUserId;
      const responsibleId =
        operation.responsibleId ||
        (operation.responsible === "me" ? currentUserId : null);

      const row = {
        id: operation.id,
        kind: operation.kind,
        organization_id: operation.organizationId,
        workspace_id: operation.workspaceId,
        title: operation.title.trim(),
        description: operation.description,
        status: operation.status,
        priority: operation.priority,
        visibility: operation.visibility || "context",
        date: operation.date,
        time: operation.time,
        end_date: operation.endDate,
        end_time: operation.endTime,
        timezone: operation.timezone || "America/Belem",
        duration: operation.duration || 60,
        location: operation.location,
        responsible_id: responsibleId,
        meeting_id: operation.meetingId,
        origin: operation.origin || "manual",
        creator_id: creatorId,
        details: operation.details || EMPTY_OPERATION_DETAILS,
        version: (operation.version || 0) + (operations.some((item) => item.id === operation.id) ? 1 : 0),
        updated_at: new Date().toISOString(),
        completed_at: operation.completedAt,
      };

      const { error: itemError } = await supabase
        .from("operational_items")
        .upsert(row, { onConflict: "id" });
      if (itemError) throw itemError;

      if (creatorId === currentUserId) {
        const { error: peopleDeleteError } = await supabase
          .from("operational_people")
          .delete()
          .eq("item_id", operation.id);
        if (peopleDeleteError) throw peopleDeleteError;

        const participantIds = [
          ...new Set(
            [
              ...(operation.participantIds || []),
              ...(operation.people.includes("me") ? [currentUserId] : []),
            ].filter(Boolean),
          ),
        ];

        if (participantIds.length > 0) {
          const { error: peopleInsertError } = await supabase
            .from("operational_people")
            .insert(
              participantIds.map((personId) => ({
                item_id: operation.id,
                person_id: personId,
                role:
                  personId === responsibleId ? "responsible" : "participant",
              })),
            );
          if (peopleInsertError) throw peopleInsertError;
        }
      }

      await logAudit(creatorId, "operation.saved", operation.id, {
        kind: operation.kind,
        version: row.version,
      });

      await refresh();
    },
    [operations, refresh, userId],
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
          version: operation.version + 1,
          updated_at: now,
        })
        .eq("id", operation.id);

      if (updateError) throw updateError;

      await logAudit(operation.creatorId, "operation.status", operation.id, {
        status,
      });
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
    userId,
    refresh,
    saveOperation,
    updateOperationStatus,
  };
}
