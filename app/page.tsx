"use client";

import { useState } from "react";
import { SiTelegram, SiWhatsapp } from "react-icons/si";

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

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);

  if (loggedIn) {
    return (
      <main className="dashboard">
        <header className="dashboard-header">
          <div className="dashboard-wordmark">NetzOS</div>
          <button
            className="dashboard-logout"
            type="button"
            onClick={() => setLoggedIn(false)}
          >
            Logout
          </button>
        </header>

        <section className="dashboard-main">
          <div className="dashboard-toolbar">
            <div>
              <span className="dashboard-eyebrow">Command center</span>
              <h1>Overview</h1>
            </div>
            <div className="dashboard-toolbar-actions">
              <button className="dashboard-secondary-action" type="button">
                Activity
              </button>
              <button className="dashboard-primary-action" type="button">
                New agent
              </button>
            </div>
          </div>

          <div className="dashboard-layout">
            <div className="dashboard-primary-column">
              <section className="overview-panel">
                <div className="overview-panel-head">
                  <div>
                    <span className="panel-label">Live operations</span>
                    <h2>Everything is running smoothly.</h2>
                  </div>
                  <span className="live-badge">
                    <span className="live-dot" />
                    Live
                  </span>
                </div>

                <div className="overview-metrics">
                  <div className="metric">
                    <strong>4</strong>
                    <span>Active agents</span>
                  </div>
                  <div className="metric">
                    <strong>18</strong>
                    <span>Tasks today</span>
                  </div>
                  <div className="metric">
                    <strong>96%</strong>
                    <span>Handled automatically</span>
                  </div>
                </div>
              </section>

              <section className="activity-panel">
                <div className="section-heading">
                  <div>
                    <span className="panel-label">Recent activity</span>
                    <h2>Agent timeline</h2>
                  </div>
                  <button className="text-action" type="button">
                    View all
                  </button>
                </div>

                <div className="activity-list">
                  <div className="activity-row">
                    <span className="activity-icon">
                      <ChannelIcon channel="WhatsApp" />
                    </span>
                    <div className="activity-copy">
                      <strong>Sales Agent</strong>
                      <p>Qualified a new lead and queued the next follow-up.</p>
                    </div>
                    <time>2m</time>
                  </div>

                  <div className="activity-row">
                    <span className="activity-icon">
                      <ChannelIcon channel="Gmail" />
                    </span>
                    <div className="activity-copy">
                      <strong>Inbox Agent</strong>
                      <p>Sorted incoming conversations and flagged two for review.</p>
                    </div>
                    <time>8m</time>
                  </div>

                  <div className="activity-row">
                    <span className="activity-icon">
                      <ChannelIcon channel="Slack" />
                    </span>
                    <div className="activity-copy">
                      <strong>Ops Agent</strong>
                      <p>Shared the latest operations brief with the team.</p>
                    </div>
                    <time>14m</time>
                  </div>
                </div>
              </section>
            </div>

            <aside className="dashboard-side-column">
              <section className="agents-panel">
                <div className="section-heading compact">
                  <div>
                    <span className="panel-label">Agents</span>
                    <h2>Currently active</h2>
                  </div>
                </div>

                <div className="active-agent-list">
                  <div className="active-agent">
                    <span className="agent-orb">
                      <ChannelIcon channel="WhatsApp" />
                    </span>
                    <div>
                      <strong>Sales Agent</strong>
                      <span>Working now</span>
                    </div>
                    <span className="agent-online-dot" />
                  </div>

                  <div className="active-agent">
                    <span className="agent-orb">
                      <ChannelIcon channel="Gmail" />
                    </span>
                    <div>
                      <strong>Inbox Agent</strong>
                      <span>Monitoring</span>
                    </div>
                    <span className="agent-online-dot" />
                  </div>

                  <div className="active-agent">
                    <span className="agent-orb">
                      <ChannelIcon channel="Telegram" />
                    </span>
                    <div>
                      <strong>Alert Agent</strong>
                      <span>Listening</span>
                    </div>
                    <span className="agent-online-dot" />
                  </div>

                  <div className="active-agent">
                    <span className="agent-orb">
                      <ChannelIcon channel="Slack" />
                    </span>
                    <div>
                      <strong>Ops Agent</strong>
                      <span>Ready</span>
                    </div>
                    <span className="agent-online-dot" />
                  </div>
                </div>
              </section>

              <section className="quick-panel">
                <span className="panel-label">Quick actions</span>
                <div className="quick-actions">
                  <button type="button">Create agent</button>
                  <button type="button">Connect channel</button>
                  <button type="button">Open activity</button>
                </div>
              </section>
            </aside>
          </div>
        </section>
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
          onClick={() => setLoggedIn(true)}
        >
          Login
        </button>
      </section>
    </main>
  );
}
