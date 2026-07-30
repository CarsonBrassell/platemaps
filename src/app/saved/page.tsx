import { Header } from "@/components/Header";

export default function SavedPage() {
  return (
    <div className="mx-auto my-6 w-full max-w-5xl overflow-hidden rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800">
      <Header />
      <div className="flex items-center justify-center bg-white px-5 py-16 text-center dark:bg-zinc-950">
        <div>
          <p className="mb-1 text-base font-medium">Nothing saved yet</p>
          <p className="text-sm text-zinc-500">
            Save a spot from the discover feed to see it here.
          </p>
        </div>
      </div>
    </div>
  );
}
