"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "./supabase";
import { makeResourceId } from "./netzos-data";

export type AccessRole =
  | "owner"
  | "admin"
  | "developer"
  | "editor"
  | "viewer"
  | "operator";

export const ACCESS_ROLE_LABELS: Record<AccessRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  developer: "Desenvolvedor NetzOS",
  editor: "Editor",
  viewer: "Visualizador",
  operator: "Operador de formulário",
};

export type DataFieldType =
  | "text"
  | "long"
  | "number"
  | "date"
  | "single"
  | "multi";

export type DataField = {
  id: string;
  name: string;
  type: DataFieldType;
  required: boolean;
  width: 4 | 6 | 12;
  options: string[];
  section?: string;
  archived?: boolean;
  min?: number;
  max?: number;
};

export type Organization = {
  id: string;
  ownerId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type Workspace = {
  id: string;
  ownerId: string;
  organizationId: string;
  name: string;
  description: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DataTable = {
  id: string;
  ownerId: string;
  workspaceId: string;
  name: string;
  description: string;
  fields: DataField[];
  version: number;
  sourceKind: string | null;
  filename: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DataRecord = {
  id: string;
  tableId: string;
  authorId: string;
  values: Record<string, string | number | string[]>;
  createdAt: string;
  updatedAt: string;
};

export type DashboardCard = {
  id: string;
  title: string;
  source: string;
  visual:
    | "number"
    | "bar"
    | "hbar"
    | "line"
    | "pie"
    | "donut"
    | "progress"
    | "status"
    | "table"
    | "ranking";
  metric: "count" | "sum" | "avg" | "min" | "max" | "distinct";
  field: string;
  group: string;
  width: 3 | 4 | 6 | 12;
  target?: number;
};

export type Dashboard = {
  id: string;
  ownerId: string;
  workspaceId: string;
  name: string;
  cards: DashboardCard[];
  settings: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type SystemBlock = {
  id: string;
  type: "form" | "table" | "dashboard" | "queue" | "queue_summary" | "shortcut";
  source: string;
  title: string;
  width: 3 | 4 | 6 | 12;
  columns?: string[];
  queue?: {
    date: string;
    status: string;
    statusValue: string;
    tie?: string;
    partition?: string;
  };
};

export type SystemPage = {
  id: string;
  name: string;
  access?: {
    mode: "inherit" | "restricted";
    people: Array<{ email: string; level: "view" | "operate" }>;
  };
  blocks: SystemBlock[];
};

export type SystemDefinition = {
  tables: string[];
  homePage?: string;
  pages: SystemPage[];
};

export type SystemResource = {
  id: string;
  ownerId: string;
  workspaceId: string;
  name: string;
  description: string;
  definition: SystemDefinition;
  reviewNotes: string;
  sourceVersions: Record<string, number>;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type AccessGrant = {
  id: string;
  ownerId: string;
  email: string;
  userId: string | null;
  kind: "organization" | "workspace" | "form" | "table" | "dashboard" | "system";
  resourceId: string;
  role: AccessRole;
  columns: string[] | null;
  rowScope: "all" | "own" | "none";
  createdAt: string;
  acceptedAt: string | null;
  expiresAt: string;
};

export type AuditEvent = {
  id: string;
  ownerId: string;
  actorId: string;
  action: string;
  resource: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

export type IntegrationConnection = {
  id: string;
  actorId: string;
  organizationId: string | null;
  workspaceId: string | null;
  name: string;
  provider:
    | "supabase"
    | "sheets"
    | "database"
    | "api"
    | "drive"
    | "whatsapp"
    | "telegram"
    | "email"
    | "google_calendar";
  config: {
    reference?: string;
    resource?: string | null;
    resources?: string[];
    usage?: "personal" | "group" | "data" | "calendar";
    description?: string;
  };
  status: "draft" | "ready" | "connected" | "error" | "disabled";
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type AutomationWorkflow = {
  id: string;
  actorId: string;
  name: string;
  description: string;
  definition: {
    version: 1;
    triggers: Array<{
      source: string;
      field: string;
      from: string;
      to: string;
    }>;
    action: {
      kind: "email" | "whatsapp" | "telegram" | "task";
      connection: string | null;
      recipient: string;
      message: string;
    };
    description: string;
  };
  status: "draft" | "active" | "paused" | "disabled";
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type NetsRequest = {
  id: string;
  actorId: string;
  organizationId: string | null;
  workspaceId: string | null;
  prompt: string;
  status:
    | "queued"
    | "needs_connection"
    | "needs_review"
    | "questions"
    | "running"
    | "done"
    | "failed"
    | "cancelled";
  tool: string | null;
  plan: any;
  result: any;
  error: string | null;
  history: Array<{ action: string; created: string; detail?: string }>;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type Profile = {
  id: string;
  email: string | null;
  displayName: string | null;
};

export type ReferenceData = {
  organizations: Organization[];
  workspaces: Workspace[];
  tables: DataTable[];
  records: DataRecord[];
  dashboards: Dashboard[];
  systems: SystemResource[];
  grants: AccessGrant[];
  events: AuditEvent[];
  connections: IntegrationConnection[];
  workflows: AutomationWorkflow[];
  netsRequests: NetsRequest[];
  profiles: Profile[];
};

const EMPTY_DATA: ReferenceData = {
  organizations: [],
  workspaces: [],
  tables: [],
  records: [],
  dashboards: [],
  systems: [],
  grants: [],
  events: [],
  connections: [],
  workflows: [],
  netsRequests: [],
  profiles: [],
};

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function createField(type: DataFieldType = "text"): DataField {
  return {
    id: makeResourceId("field"),
    name: "Novo campo",
    type,
    required: false,
    width: 12,
    options: type === "single" || type === "multi" ? ["Opção 1"] : [],
  };
}

export function canDesign(role: AccessRole | null | undefined) {
  return !!role && ["owner", "admin", "developer"].includes(role);
}

export function canManage(role: AccessRole | null | undefined) {
  return !!role && ["owner", "admin"].includes(role);
}

export function canWrite(role: AccessRole | null | undefined) {
  return !!role && ["owner", "admin", "developer", "editor", "operator"].includes(role);
}

export function resourceRole(
  data: ReferenceData,
  userId: string,
  kind: AccessGrant["kind"],
  resourceId: string,
): AccessRole | null {
  const directOwner =
    kind === "organization"
      ? data.organizations.find((item) => item.id === resourceId)?.ownerId
      : kind === "workspace"
        ? data.workspaces.find((item) => item.id === resourceId)?.ownerId
        : kind === "dashboard"
          ? data.dashboards.find((item) => item.id === resourceId)?.ownerId
          : kind === "system"
            ? data.systems.find((item) => item.id === resourceId)?.ownerId
            : data.tables.find((item) => item.id === resourceId)?.ownerId;

  if (directOwner === userId) return "owner";

  const now = Date.now();
  const grant = data.grants.find(
    (item) =>
      item.userId === userId &&
      item.acceptedAt &&
      Date.parse(item.expiresAt) > now &&
      item.kind === kind &&
      item.resourceId === resourceId,
  );
  if (grant) return grant.role;

  let workspaceId: string | null = null;
  let organizationId: string | null = null;

  if (kind === "workspace") {
    const workspace = data.workspaces.find((item) => item.id === resourceId);
    organizationId = workspace?.organizationId || null;
  } else if (["form", "table"].includes(kind)) {
    const table = data.tables.find((item) => item.id === resourceId);
    workspaceId = table?.workspaceId || null;
  } else if (kind === "dashboard") {
    workspaceId =
      data.dashboards.find((item) => item.id === resourceId)?.workspaceId || null;
  } else if (kind === "system") {
    workspaceId =
      data.systems.find((item) => item.id === resourceId)?.workspaceId || null;
  }

  if (workspaceId) {
    const workspace = data.workspaces.find((item) => item.id === workspaceId);
    organizationId = workspace?.organizationId || null;
    const workspaceGrant = data.grants.find(
      (item) =>
        item.userId === userId &&
        item.acceptedAt &&
        Date.parse(item.expiresAt) > now &&
        item.kind === "workspace" &&
        item.resourceId === workspaceId,
    );
    if (workspaceGrant) return workspaceGrant.role;
  }

  if (organizationId) {
    const organizationGrant = data.grants.find(
      (item) =>
        item.userId === userId &&
        item.acceptedAt &&
        Date.parse(item.expiresAt) > now &&
        item.kind === "organization" &&
        item.resourceId === organizationId,
    );
    if (organizationGrant) return organizationGrant.role;
  }

  return null;
}

export async function logAudit(
  ownerId: string,
  action: string,
  resource: string,
  detail: Record<string, unknown> = {},
) {
  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("audit_events").insert({
    id: makeResourceId("event"),
    owner_id: ownerId,
    actor_id: user.id,
    action,
    resource,
    detail,
  });
}

export function useReferenceData() {
  const [data, setData] = useState<ReferenceData>(EMPTY_DATA);
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = await getSupabase();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) throw userError;
    if (!user) {
      setData(EMPTY_DATA);
      setUserId("");
      setEmail("");
      setReady(true);
      return;
    }

    setUserId(user.id);
    setEmail(user.email || "");

    const [
      organizations,
      workspaces,
      tables,
      records,
      dashboards,
      systems,
      grants,
      events,
      connections,
      workflows,
      netsRequests,
      profiles,
    ] = await Promise.all([
      supabase
        .from("organizations")
        .select("id,owner_id,name,created_at,updated_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("workspaces")
        .select(
          "id,owner_id,organization_id,name,description,favorite,created_at,updated_at",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("data_tables")
        .select(
          "id,owner_id,workspace_id,name,description,fields,version,source_kind,filename,created_at,updated_at",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("data_records")
        .select("id,table_id,author_id,values,created_at,updated_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("dashboards")
        .select(
          "id,owner_id,workspace_id,name,cards,settings,version,created_at,updated_at",
        )
        .order("updated_at", { ascending: false }),
      supabase
        .from("systems")
        .select(
          "id,owner_id,workspace_id,name,description,definition,review_notes,source_versions,version,created_at,updated_at",
        )
        .order("updated_at", { ascending: false }),
      supabase
        .from("access_grants")
        .select(
          "id,owner_id,email,user_id,kind,resource_id,role,columns,row_scope,created_at,accepted_at,expires_at",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("audit_events")
        .select("id,owner_id,actor_id,action,resource,detail,created_at")
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("integration_connections")
        .select(
          "id,actor_id,organization_id,workspace_id,name,provider,config,status,version,created_at,updated_at",
        )
        .order("updated_at", { ascending: false }),
      supabase
        .from("automation_workflows")
        .select(
          "id,actor_id,name,description,definition,status,version,created_at,updated_at",
        )
        .order("updated_at", { ascending: false }),
      supabase
        .from("nets_requests")
        .select(
          "id,actor_id,organization_id,workspace_id,prompt,status,tool,plan,result,error,history,version,created_at,updated_at",
        )
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("profiles").select("id,email,display_name"),
    ]);

    const firstError = [
      organizations,
      workspaces,
      tables,
      records,
      dashboards,
      systems,
      grants,
      events,
      connections,
      workflows,
      netsRequests,
      profiles,
    ].find((result) => result.error)?.error;

    if (firstError) throw firstError;

    setData({
      organizations: (organizations.data || []).map((item: any) => ({
        id: item.id,
        ownerId: item.owner_id,
        name: item.name,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })),
      workspaces: (workspaces.data || []).map((item: any) => ({
        id: item.id,
        ownerId: item.owner_id,
        organizationId: item.organization_id,
        name: item.name,
        description: item.description || "",
        favorite: !!item.favorite,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })),
      tables: (tables.data || []).map((item: any) => ({
        id: item.id,
        ownerId: item.owner_id,
        workspaceId: item.workspace_id,
        name: item.name,
        description: item.description || "",
        fields: asArray<DataField>(item.fields),
        version: item.version || 0,
        sourceKind: item.source_kind || null,
        filename: item.filename || null,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })),
      records: (records.data || []).map((item: any) => ({
        id: item.id,
        tableId: item.table_id,
        authorId: item.author_id,
        values: asObject(item.values) as DataRecord["values"],
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })),
      dashboards: (dashboards.data || []).map((item: any) => ({
        id: item.id,
        ownerId: item.owner_id,
        workspaceId: item.workspace_id,
        name: item.name,
        cards: asArray<DashboardCard>(item.cards),
        settings: asObject(item.settings),
        version: item.version || 0,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })),
      systems: (systems.data || []).map((item: any) => ({
        id: item.id,
        ownerId: item.owner_id,
        workspaceId: item.workspace_id,
        name: item.name,
        description: item.description || "",
        definition: {
          tables: asArray<string>(item.definition?.tables),
          homePage: item.definition?.homePage,
          pages: asArray<SystemPage>(item.definition?.pages),
        },
        reviewNotes: item.review_notes || "",
        sourceVersions: asObject(item.source_versions) as Record<string, number>,
        version: item.version || 0,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })),
      grants: (grants.data || []).map((item: any) => ({
        id: item.id,
        ownerId: item.owner_id,
        email: item.email,
        userId: item.user_id,
        kind: item.kind,
        resourceId: item.resource_id,
        role: item.role,
        columns: Array.isArray(item.columns) ? item.columns : null,
        rowScope: item.row_scope,
        createdAt: item.created_at,
        acceptedAt: item.accepted_at,
        expiresAt: item.expires_at,
      })),
      events: (events.data || []).map((item: any) => ({
        id: item.id,
        ownerId: item.owner_id,
        actorId: item.actor_id,
        action: item.action,
        resource: item.resource,
        detail: asObject(item.detail),
        createdAt: item.created_at,
      })),
      connections: (connections.data || []).map((item: any) => ({
        id: item.id,
        actorId: item.actor_id,
        organizationId: item.organization_id,
        workspaceId: item.workspace_id,
        name: item.name,
        provider: item.provider,
        config: asObject(item.config),
        status: item.status,
        version: item.version || 0,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })) as IntegrationConnection[],
      workflows: (workflows.data || []).map((item: any) => ({
        id: item.id,
        actorId: item.actor_id,
        name: item.name,
        description: item.description || "",
        definition: item.definition,
        status: item.status,
        version: item.version || 0,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })) as AutomationWorkflow[],
      netsRequests: (netsRequests.data || []).map((item: any) => ({
        id: item.id,
        actorId: item.actor_id,
        organizationId: item.organization_id,
        workspaceId: item.workspace_id,
        prompt: item.prompt,
        status: item.status,
        tool: item.tool,
        plan: item.plan,
        result: item.result,
        error: item.error,
        history: asArray(item.history),
        version: item.version || 0,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })) as NetsRequest[],
      profiles: (profiles.data || []).map((item: any) => ({
        id: item.id,
        email: item.email,
        displayName: item.display_name,
      })),
    });

    setError(null);
    setReady(true);
  }, []);

  useEffect(() => {
    let live = true;
    void refresh().catch((cause) => {
      if (!live) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar o ambiente NetzOS.",
      );
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, [refresh]);

  const myOrganizations = useMemo(
    () => data.organizations.filter((item) => item.ownerId === userId),
    [data.organizations, userId],
  );

  return {
    data,
    userId,
    email,
    ready,
    error,
    refresh,
    myOrganizations,
  };
}
