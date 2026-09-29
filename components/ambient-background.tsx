const cards = [
  { name: "Ava Green", handle: "@ava", body: "Built for focus, speed and clarity.", country: "AU" },
  { name: "Ana Miller", handle: "@ana", body: "Everything you need, where you expect it.", country: "DE" },
  { name: "Mateo Rossi", handle: "@mat", body: "A calmer way to work across your day.", country: "IT" },
  { name: "Maya Patel", handle: "@maya", body: "Fast, familiar and beautifully simple.", country: "IN" },
  { name: "Noah Smith", handle: "@noah", body: "One place for the things that matter.", country: "US" },
  { name: "Lucas Stone", handle: "@luc", body: "Designed to stay out of your way.", country: "FR" },
  { name: "Haruto Sato", handle: "@haru", body: "A smooth experience on every screen.", country: "JP" },
  { name: "Emma Lee", handle: "@emma", body: "Less friction. More flow.", country: "CA" },
];

function ReviewCard({ name, handle, body, country }: (typeof cards)[number]) {
  return (
    <article className="ambient-card">
      <div className="ambient-card__header">
        <div className="ambient-avatar" aria-hidden="true">
          {name
            .split(" ")
            .map((part) => part[0])
            .join("")}
        </div>
        <div>
          <p className="ambient-card__name">
            {name} <span>{country}</span>
          </p>
          <p className="ambient-card__handle">{handle}</p>
        </div>
      </div>
      <p className="ambient-card__copy">{body}</p>
    </article>
  );
}

function Column({ reverse = false }: { reverse?: boolean }) {
  return (
    <div className={`ambient-column${reverse ? " ambient-column--reverse" : ""}`}>
      {[0, 1].map((group) => (
        <div className="ambient-track" key={group} aria-hidden={group === 1}>
          {cards.map((card) => (
            <ReviewCard key={`${group}-${card.handle}`} {...card} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function AmbientBackground() {
  return (
    <div className="ambient-background" aria-hidden="true">
      <div className="ambient-scene">
        <Column />
        <Column reverse />
        <Column />
        <Column reverse />
      </div>

      <div className="ambient-fade ambient-fade--top" />
      <div className="ambient-fade ambient-fade--bottom" />
      <div className="ambient-fade ambient-fade--left" />
      <div className="ambient-fade ambient-fade--right" />
      <div className="ambient-center-wash" />
    </div>
  );
}
