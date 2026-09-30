"use client";

import { useEffect, useState } from "react";

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
  responsible: "me";
  people: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

const OPERATIONS_KEY = "netzos.operations.v1";
const ORGANIZATIONS_KEY = "netzos.organizations.v1";

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

export function useOperationsStore() {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationRef[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceRef[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const savedOperations = localStorage.getItem(OPERATIONS_KEY);
      if (savedOperations) {
        const parsed = JSON.parse(savedOperations);
        setOperations(Array.isArray(parsed) ? parsed : []);
      }

      const savedOrganizations = localStorage.getItem(ORGANIZATIONS_KEY);
      if (savedOrganizations) {
        const parsed = JSON.parse(savedOrganizations);
        setOrganizations(Array.isArray(parsed.organizations) ? parsed.organizations : []);
        setWorkspaces(Array.isArray(parsed.workspaces) ? parsed.workspaces : []);
      }
    } catch {
      setOperations([]);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(OPERATIONS_KEY, JSON.stringify(operations));
  }, [operations, ready]);

  return { operations, setOperations, organizations, workspaces, ready };
}
