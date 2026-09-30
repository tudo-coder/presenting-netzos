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
        <button className="login" type="button">
          Login
        </button>
      </section>
    </main>
  );
}
