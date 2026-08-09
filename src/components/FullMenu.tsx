type MenuDish = {
  id: string;
  name: string;
  price: string;
};

export function FullMenu({
  sections,
  onSelect,
}: {
  sections: { section: string; dishes: MenuDish[] }[];
  onSelect: (dishId: string) => void;
}) {
  if (sections.length === 0) {
    return (
      <section id="full-menu" className="scroll-mt-4 rounded-2xl bg-white px-5 py-5 sm:px-6">
        <h2 className="mono-label text-zinc-500">Full menu</h2>
        {/* An honest gap rather than an empty heading: not every restaurant's
            menu has been read in yet, and saying so beats a blank panel. */}
        <div className="mt-4 rounded-xl bg-pm-grey-tint/60 px-4 py-8 text-center">
          <p className="text-sm font-medium text-zinc-700">No menu here yet</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-zinc-500">
            Post a plate from here and the dish you name becomes the first one on it.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section id="full-menu" className="scroll-mt-4 rounded-2xl bg-white px-5 py-5 sm:px-6">
      <h2 className="mono-label text-zinc-500">Full menu</h2>
      <div className="mt-4 flex flex-col gap-6">
        {sections.map(({ section, dishes }) => (
          <div key={section}>
            <p className="mono-label mb-1.5 text-zinc-500">{section}</p>
            <div className="flex flex-col">
              {dishes.map((dish) => (
                <button
                  key={dish.id}
                  onClick={() => onSelect(dish.id)}
                  className="flex min-h-11 items-center justify-between gap-4 rounded-xl px-2 py-2.5 text-left text-sm transition-colors hover:bg-pm-grey-tint/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pm-orange active:bg-pm-grey-tint"
                >
                  <span className="text-zinc-700">{dish.name}</span>
                  <span className="shrink-0 font-mono text-xs text-zinc-500">{dish.price}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
