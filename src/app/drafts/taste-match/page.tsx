import { Header } from "@/components/Header";
import { FlavorProfileCard, TasteMatchCard } from "@/components/TasteMatchCard";
import {
  PhoneFlavorProfileCard,
  PhoneTasteMatchCard,
} from "@/components/mobile/PhoneTasteMatchCard";
import { computeFlavorProfile, computeTasteMatch, type TasteInput } from "@/lib/tasteMatch";

/**
 * DRAFT — the Taste match and Your flavor profile cards, web and phone, from fixed sample counts so the
 * design can be looked at without a database or two friends with a history.
 *
 * The numbers go through the real `computeTasteMatch`; only the posts are
 * invented. Deleting this folder removes it; nothing else imports it.
 */
const place = (id: string, name: string, count = 3) => ({ id, name, count });

const YOU: TasteInput = {
  counts: {
    Mexican: 22,
    Japanese: 18,
    Italian: 9,
    Thai: 12,
    Korean: 14,
    Indian: 4,
    American: 15,
    Mediterranean: 6,
  },
  topPlaces: {},
};

const SAM: TasteInput = {
  counts: {
    Mexican: 20,
    Japanese: 10,
    Italian: 6,
    Thai: 8,
    Korean: 6,
    Indian: 18,
    American: 12,
    Mediterranean: 20,
  },
  topPlaces: {
    Indian: place("sample-indian", "Himalayan Kitchen", 7),
    Mediterranean: place("sample-med", "Olive & Thyme", 9),
  },
};

const SPARSE: TasteInput = { counts: { Mexican: 1, Thai: 1 }, topPlaces: {} };

export default function TasteMatchDraftPage() {
  const match = computeTasteMatch(YOU, SAM);
  const empty = computeTasteMatch(SPARSE, SAM);
  const flavor = computeFlavorProfile(YOU);
  const flavorEmpty = computeFlavorProfile(SPARSE);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-[860px] px-5 pb-24 pt-8">
        <h1 className="text-[32px]">Taste match</h1>
        <p className="mt-1.5 max-w-[70ch] text-[14px] text-pm-grey-text">
          Sample counts through the real model. Web card on the web profile,
          phone card at 390px, and the empty state both share.
        </p>

        <p className="mono-label mb-3 mt-8 text-zinc-900">Web</p>
        <div className="-mx-4 sm:-mx-6">
          <TasteMatchCard friendName="Sam" match={match} />
        </div>

        <p className="mono-label mb-3 mt-10 text-zinc-900">Phone (390px)</p>
        <div className="-mx-4 w-[390px] max-w-full">
          <PhoneTasteMatchCard friendName="Sam" match={match} />
        </div>

        <p className="mono-label mb-3 mt-10 text-zinc-900">Empty state</p>
        <div className="-mx-4 sm:-mx-6">
          <TasteMatchCard friendName="Sam" match={empty} />
        </div>
        <div className="-mx-4 mt-6 w-[390px] max-w-full">
          <PhoneTasteMatchCard friendName="Sam" match={empty} />
        </div>

        <p className="mono-label mb-3 mt-10 text-zinc-900">Your flavor profile</p>
        <div className="-mx-4 sm:-mx-6">
          <FlavorProfileCard flavor={flavor} />
        </div>
        <div className="-mx-4 mt-6 w-[390px] max-w-full">
          <PhoneFlavorProfileCard flavor={flavor} />
        </div>

        <p className="mono-label mb-3 mt-10 text-zinc-900">Your flavor profile, empty state</p>
        <div className="-mx-4 sm:-mx-6">
          <FlavorProfileCard flavor={flavorEmpty} />
        </div>
        <div className="-mx-4 mt-6 w-[390px] max-w-full">
          <PhoneFlavorProfileCard flavor={flavorEmpty} />
        </div>
      </main>
    </>
  );
}
