const agentActivity = [
  {
    channel: "WhatsApp",
    mark: "WA",
    agent: "Sales Agent",
    body: "3 leads replied. Follow-ups are queued.",
    status: "active",
  },
  {
    channel: "Telegram",
    mark: "TG",
    agent: "Alert Agent",
    body: "New request detected and routed to support.",
    status: "routing",
  },
  {
    channel: "Gmail",
    mark: "GM",
    agent: "Inbox Agent",
    body: "8 messages classified. 2 need review.",
    status: "synced",
  },
  {
    channel: "Slack",
    mark: "SL",
    agent: "Ops Agent",
    body: "Daily brief posted to #operations.",
    status: "sent",
  },
  {
    channel: "WhatsApp",
    mark: "WA",
    agent: "Customer Agent",
    body: "Order update sent. Waiting for confirmation.",
    status: "waiting",
  },
  {
    channel: "Telegram",
    mark: "TG",
    agent: "Community Agent",
    body: "5 new questions grouped by topic.",
    status: "working",
  },
  {
    channel: "Gmail",
    mark: "GM",
    agent: "Support Agent",
    body: "Urgent thread identified and escalated.",
    status: "reviewing",
  },
  {
    channel: "Slack",
    mark: "SL",
    agent: "Internal Agent",
    body: "Incident summary shared with the team.",
    status: "posted",
  },
  {
    channel: "Gmail",
    mark: "GM",
    agent: "Follow-up Agent",
    body: "Reminder drafted for inactive conversations.",
    status: "ready",
  },
];

function AgentCard({
  item,
}: {
  item: (typeof agentActivity)[number];
}) {
  return (
    <article className="agent-card">
      <div className="agent-card-top">
        <div className="channel-badge">
          <span className="channel-mark">{item.mark}</span>
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
