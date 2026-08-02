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
  return (
    <div className="px-5 py-5">
      <p className="mb-3 text-base font-bold text-zinc-900">Full menu</p>
      <div className="flex flex-col gap-5">
        {sections.map(({ section, dishes }) => (
          <div key={section}>
            <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {section}
              <span className="h-px flex-1 bg-zinc-100" aria-hidden="true" />
            </p>
            <div className="flex flex-col divide-y divide-zinc-100">
              {dishes.map((dish) => (
                <button
                  key={dish.id}
                  onClick={() => onSelect(dish.id)}
                  className="flex items-center justify-between gap-4 rounded-lg px-2 py-2.5 text-left text-sm transition-colors hover:bg-pm-orange-tint/40 active:bg-pm-orange-tint/60"
                >
                  <span className="text-zinc-700">{dish.name}</span>
                  <span className="shrink-0 font-medium text-zinc-500">{dish.price}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
