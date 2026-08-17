/**
 * Placeholder for a /m screen that hasn't been designed yet.
 *
 * It exists so the nav is real. Comparing three navigation treatments is not
 * worth much if four of the five slots 404 — you cannot judge how a tab bar
 * feels without tapping between tabs and watching the active state move.
 *
 * Every one of these is meant to be deleted, replaced by the actual screen.
 */
export function PhoneStub({ title }: { title: string }) {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center px-8 text-center">
      <p className="mono-label text-pm-grey-text">Not built yet</p>
      <h1 className="font-display mt-3 text-[26px] font-semibold tracking-tight text-zinc-900">
        {title}
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        This slot is here so the navigation is real. Discover is the screen with
        something on it.
      </p>
    </div>
  );
}
