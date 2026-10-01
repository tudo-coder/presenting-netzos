"use client";

import { useEffect, useState } from "react";
import {
  FiBarChart2,
  FiBriefcase,
  FiCalendar,
  FiCheckSquare,
  FiChevronLeft,
  FiDatabase,
  FiHelpCircle,
  FiHome,
  FiLayout,
  FiLink2,
  FiMenu,
  FiSettings,
  FiShare2,
  FiStar,
  FiUserCheck,
  FiZap,
} from "react-icons/fi";
import type { IconType } from "react-icons";
import { SiTelegram, SiWhatsapp } from "react-icons/si";
import { OrganizationsFeature } from "./organizations";
import { MyTasksFeature } from "./my-tasks";
import { MyAgendaFeature } from "./my-agenda";
import { MySpaceFeature } from "./my-space-feature";
import { DataFeature } from "./data-feature";
import { SystemsFeature } from "./systems-feature";
import {
  DashboardsFeature,
  PublishedDashboard,
} from "./dashboard-feature";
import { ConnectionsFeature } from "./connections-feature";
import { AutomationsFeature } from "./automations-feature";
import { AccessFeature, SharedFeature } from "./access-feature";
import { NetzFeature } from "./nets-feature";
import { AuthModal } from "./auth-modal";
import { SettingsFeature } from "./settings";
import { getSupabase } from "./supabase";
import type { Session } from "@supabase/supabase-js";

const agentActivity = [
  {
    channel: "WhatsApp",
    agent: "Sales Agent",
    body: "3 leads replied. Follow-ups are queued.",
    status: "active",
  },
  {
    channel: "Telegram",
    agent: "Alert Agent",
    body: "New request detected and routed to support.",
    status: "routing",
  },
  {
    channel: "Gmail",
    agent: "Inbox Agent",
    body: "8 messages classified. 2 need review.",
    status: "synced",
  },
  {
    channel: "Slack",
    agent: "Ops Agent",
    body: "Daily brief posted to #operations.",
    status: "sent",
  },
  {
    channel: "WhatsApp",
    agent: "Customer Agent",
    body: "Order update sent. Waiting for confirmation.",
    status: "waiting",
  },
  {
    channel: "Telegram",
    agent: "Community Agent",
    body: "5 new questions grouped by topic.",
    status: "working",
  },
  {
    channel: "Gmail",
    agent: "Support Agent",
    body: "Urgent thread identified and escalated.",
    status: "reviewing",
  },
  {
    channel: "Slack",
    agent: "Internal Agent",
    body: "Incident summary shared with the team.",
    status: "posted",
  },
  {
    channel: "Gmail",
    agent: "Follow-up Agent",
    body: "Reminder drafted for inactive conversations.",
    status: "ready",
  },
];

function ChannelIcon({ channel }: { channel: string }) {
  if (channel === "WhatsApp") {
    return <SiWhatsapp className="brand-icon brand-whatsapp" />;
  }

  if (channel === "Telegram") {
    return <SiTelegram className="brand-icon brand-telegram" />;
  }

  if (channel === "Gmail") {
    return (
      <svg
        className="brand-icon brand-gmail"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path fill="#4285F4" d="M3 5.8v12.4c0 .99.81 1.8 1.8 1.8H7V9.2L3 6.2v-.4Z" />
        <path fill="#34A853" d="M17 9.2V20h2.2c.99 0 1.8-.81 1.8-1.8V5.8l-4 3.4Z" />
        <path fill="#EA4335" d="M3 5.8c0-1.5 1.72-2.35 2.92-1.45L12 8.9l6.08-4.55C19.28 3.45 21 4.3 21 5.8v.4L12 13 3 6.2v-.4Z" />
        <path fill="#FBBC04" d="M17 9.2 21 6.2v3.35l-4 2.95V9.2Z" />
      </svg>
    );
  }

  return (
    <svg
      className="brand-icon brand-slack"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path fill="#36C5F0" d="M9.7 2a2.15 2.15 0 0 1 2.15 2.15v5.4H9.7a2.15 2.15 0 0 1 0-4.3V2Zm-2.2 7.55A2.15 2.15 0 1 1 5.35 7.4 2.15 2.15 0 0 1 7.5 9.55Z" />
      <path fill="#2EB67D" d="M22 9.7a2.15 2.15 0 0 1-2.15 2.15h-5.4V9.7a2.15 2.15 0 0 1 4.3 0H22Zm-7.55-2.2A2.15 2.15 0 1 1 16.6 5.35a2.15 2.15 0 0 1-2.15 2.15Z" />
      <path fill="#ECB22E" d="M14.3 22a2.15 2.15 0 0 1-2.15-2.15v-5.4h2.15a2.15 2.15 0 0 1 0 4.3V22Zm2.2-7.55a2.15 2.15 0 1 1 2.15 2.15 2.15 2.15 0 0 1-2.15-2.15Z" />
      <path fill="#E01E5A" d="M2 14.3a2.15 2.15 0 0 1 2.15-2.15h5.4v2.15a2.15 2.15 0 0 1-4.3 0H2Zm7.55 2.2A2.15 2.15 0 1 1 7.4 18.65a2.15 2.15 0 0 1 2.15-2.15Z" />
    </svg>
  );
}

function AgentCard({
  item,
}: {
  item: (typeof agentActivity)[number];
}) {
  return (
    <article className="agent-card">
      <div className="agent-card-top">
        <div className="channel-badge">
          <span className="channel-mark" aria-hidden="true">
            <ChannelIcon channel={item.channel} />
          </span>
          <span>{item.channel}</span>
        </div>
        <span className="agent-status">
          <span className="status-dot" />
          {item.status}
        </span>
      </div>

      <div className="agent-name">{item.agent}</div>
      <p>{item.body}</p>
    </article>
  );
}

function MarqueeColumn({
  reverse = false,
  offset = 0,
}: {
  reverse?: boolean;
  offset?: number;
}) {
  const ordered = [
    ...agentActivity.slice(offset),
    ...agentActivity.slice(0, offset),
  ];

  return (
    <div className="marquee-column">
      <div className={`marquee-track ${reverse ? "reverse" : ""}`}>
        {[0, 1, 2].map((copy) => (
          <div className="marquee-group" key={copy}>
            {ordered.map((item) => (
              <AgentCard
                key={`${copy}-${item.channel}-${item.agent}`}
                item={item}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const primaryNavigation: Array<{ label: string; Icon: IconType }> = [
  { label: "Meu espaço", Icon: FiHome },
  { label: "Minhas tarefas", Icon: FiCheckSquare },
  { label: "Minha Agenda", Icon: FiCalendar },
  { label: "Organizações", Icon: FiBriefcase },
  { label: "Dados", Icon: FiDatabase },
  { label: "Sistemas", Icon: FiLayout },
  { label: "Dashboards", Icon: FiBarChart2 },
  { label: "Conexões", Icon: FiLink2 },
  { label: "Automações", Icon: FiZap },
  { label: "Compartilhados comigo", Icon: FiShare2 },
  { label: "Pessoas e Acessos", Icon: FiUserCheck },
  { label: "Netz", Icon: FiStar },
];

const secondaryNavigation: Array<{ label: string; Icon: IconType }> = [
  { label: "Settings", Icon: FiSettings },
  { label: "Help", Icon: FiHelpCircle },
];

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("Meu espaço");
  const [dataInitialTableId, setDataInitialTableId] = useState("");
  const [publicationId, setPublicationId] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    void getSupabase()
      .then(async (supabase) => {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;

        setSession(data.session);
        setAuthReady(true);

        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, nextSession) => {
          setSession(nextSession);
          setAuthReady(true);
          if (nextSession) setAuthOpen(false);
        });

        unsubscribe = () => subscription.unsubscribe();
      })
      .catch(() => {
        if (mounted) setAuthReady(true);
      });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("settings") === "chatgpt") {
      setActiveNav("Settings");
    }
    if (params.get("invite")) {
      setActiveNav("Compartilhados comigo");
    }
    const publication = params.get("publication");
    if (publication) setPublicationId(publication);
  }, [session]);

  if (session) {
    const renderNavItem = ({
      label,
      Icon,
    }: {
      label: string;
      Icon: IconType;
    }) => {
      const active = activeNav === label;

      return (
        <button
          className={`sidebar-item ${active ? "active" : ""}`}
          type="button"
          key={label}
          aria-current={active ? "page" : undefined}
          aria-label={sidebarCollapsed ? label : undefined}
          title={sidebarCollapsed ? label : undefined}
          onClick={() => {
            setActiveNav(label);
            setSidebarOpen(false);
          }}
        >
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </button>
      );
    };

    if (publicationId) {
      return (
        <PublishedDashboard
          publicationId={publicationId}
          onClose={() => {
            setPublicationId("");
            const params = new URLSearchParams(window.location.search);
            params.delete("publication");
            const query = params.toString();
            window.history.replaceState(
              {},
              "",
              window.location.pathname + (query ? "?" + query : ""),
            );
          }}
        />
      );
    }

    return (
      <main className="dashboard">
        <header className="dashboard-header">
          <div className="dashboard-wordmark">NetzOS</div>
          <button
            className="dashboard-logout"
            type="button"
            onClick={async () => {
              const supabase = await getSupabase();
              await supabase.auth.signOut();
              setActiveNav("Meu espaço");
              setSidebarOpen(false);
            }}
          >
            Logout
          </button>
        </header>

        <div className="dashboard-shell">
          {!sidebarOpen && (
            <button
              className="sidebar-mobile-trigger"
              type="button"
              aria-label="Open navigation"
              aria-expanded={false}
              onClick={() => setSidebarOpen(true)}
            >
              <FiMenu aria-hidden="true" />
            </button>
          )}

          <button
            className={`sidebar-backdrop ${sidebarOpen ? "visible" : ""}`}
            type="button"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          />

          <aside
            className={[
              "dashboard-sidebar",
              sidebarCollapsed ? "collapsed" : "",
              sidebarOpen ? "mobile-open" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label="Primary navigation"
          >
            <div className="sidebar-inner">
              <div className="sidebar-main">
                <div className="sidebar-topline">
                  <span className="sidebar-section-label">Workspace</span>
                  <button
                    className="sidebar-mobile-close"
                    type="button"
                    aria-label="Close navigation"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <FiChevronLeft aria-hidden="true" />
                  </button>
                </div>
                <nav className="sidebar-nav">
                  {primaryNavigation.map(renderNavItem)}
                </nav>
              </div>

              <div className="sidebar-bottom">
                <span className="sidebar-section-label">System</span>
                <nav className="sidebar-nav">
                  {secondaryNavigation.map(renderNavItem)}
                </nav>

                <button
                  className="sidebar-collapse"
                  type="button"
                  aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                  aria-pressed={sidebarCollapsed}
                  onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
                >
                  <FiChevronLeft aria-hidden="true" />
                  <span>Collapse</span>
                </button>
              </div>
            </div>
          </aside>

          <div className="dashboard-content">
            {activeNav === "Meu espaço" && (
              <MySpaceFeature
                onOpenTasks={() => setActiveNav("Minhas tarefas")}
                onOpenAgenda={() => setActiveNav("Minha Agenda")}
                onOpenOrganizations={() => setActiveNav("Organizações")}
                onOpenData={() => {
                  setDataInitialTableId("");
                  setActiveNav("Dados");
                }}
                onOpenSystems={() => setActiveNav("Sistemas")}
                onOpenShared={() => setActiveNav("Compartilhados comigo")}
                onOpenNetz={() => setActiveNav("Netz")}
              />
            )}

            {activeNav === "Minhas tarefas" && (
              <MyTasksFeature
                onOpenOrganizations={() => setActiveNav("Organizações")}
              />
            )}

            {activeNav === "Minha Agenda" && (
              <MyAgendaFeature
                onOpenOrganizations={() => setActiveNav("Organizações")}
              />
            )}

            {activeNav === "Organizações" && (
              <OrganizationsFeature
                onOpenData={() => {
                  setDataInitialTableId("");
                  setActiveNav("Dados");
                }}
                onOpenSystems={() => setActiveNav("Sistemas")}
              />
            )}

            {activeNav === "Dados" && (
              <DataFeature
                key={"data-" + dataInitialTableId}
                initialTableId={dataInitialTableId}
              />
            )}

            {activeNav === "Sistemas" && (
              <SystemsFeature
                onOpenData={(tableId) => {
                  setDataInitialTableId(tableId);
                  setActiveNav("Dados");
                }}
              />
            )}

            {activeNav === "Dashboards" && <DashboardsFeature />}

            {activeNav === "Conexões" && <ConnectionsFeature />}

            {activeNav === "Automações" && <AutomationsFeature />}

            {activeNav === "Compartilhados comigo" && (
              <SharedFeature
                onOpen={(kind, id) => {
                  if (kind === "table" || kind === "form") {
                    setDataInitialTableId(id);
                    setActiveNav("Dados");
                  } else if (kind === "dashboard") {
                    setActiveNav("Dashboards");
                  } else if (kind === "system") {
                    setActiveNav("Sistemas");
                  } else {
                    setActiveNav("Organizações");
                  }
                }}
              />
            )}

            {activeNav === "Pessoas e Acessos" && <AccessFeature />}

            {activeNav === "Netz" && (
              <NetzFeature
                onOpenAgenda={() => setActiveNav("Minha Agenda")}
                onOpenTasks={() => setActiveNav("Minhas tarefas")}
                onOpenAutomations={() => setActiveNav("Automações")}
              />
            )}

            {activeNav === "Settings" && (
              <SettingsFeature user={session.user} />
            )}

            {activeNav === "Help" && (
              <section className="ref-feature">
                <header className="ref-heading">
                  <div>
                    <span className="ref-eyebrow">NetzOS</span>
                    <h1>Ajuda</h1>
                    <p>
                      Organizações reúnem workspaces; dados alimentam sistemas e
                      dashboards; tarefas, reuniões e compromissos formam a
                      operação e a agenda.
                    </p>
                  </div>
                </header>
                <div className="ref-empty compact">
                  <FiHelpCircle />
                  <h3>Use a Netz para ações operacionais guiadas</h3>
                  <p>
                    Para integrações externas, prepare primeiro uma Conexão e
                    revise as automações antes de ativá-las.
                  </p>
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="home">
      <div className="agent-background" aria-hidden="true">
        <div className="agent-plane">
          <MarqueeColumn />
          <MarqueeColumn reverse offset={2} />
          <MarqueeColumn offset={4} />
          <MarqueeColumn reverse offset={6} />
        </div>
        <div className="background-wash" />
      </div>

      <section className="hero" aria-label="NetzOS">
        <h1 className="wordmark">NetzOS</h1>
        <button
          className="login"
          type="button"
          disabled={!authReady}
          onClick={() => setAuthOpen(true)}
        >
          Login
        </button>
      </section>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </main>
  );
}
