import { Header } from "@/components/Header";

export default function SavedPage() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-1 flex-col">
      <Header />
      <div className="flex flex-1 items-center justify-center bg-white px-5 py-16 text-center dark:bg-black">
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
