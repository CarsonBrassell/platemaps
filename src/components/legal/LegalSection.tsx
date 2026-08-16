/** Shared building blocks for /terms and /privacy — same numbered-section,
 * table-of-contents shell so the two documents read as one system. */

export function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-9 scroll-mt-24">
      <h2 className="font-display mb-3 text-xl font-semibold text-zinc-900 sm:text-2xl">
        {title}
      </h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-zinc-700">{children}</div>
    </section>
  );
}

export function List({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5">{children}</ul>;
}

export function LegalTOC({
  sections,
}: {
  sections: { id: string; title: string }[];
}) {
  return (
    <nav className="mb-10 rounded-2xl bg-white p-4 sm:p-5">
      <p className="font-mono mb-3 text-xs uppercase tracking-[0.14em] text-zinc-500">
        Contents
      </p>
      <ol className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm text-zinc-700 sm:grid-cols-2">
        {sections.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} className="underline-offset-2 hover:underline">
              {s.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
