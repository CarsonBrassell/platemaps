"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { useAuth } from "@/lib/auth";

const inputClass =
  "mb-4 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm transition-colors focus:border-pm-orange focus:outline-none";

export default function SignInPage() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const success = signIn(email, password);
    if (!success) {
      setError("That email and password don't match an account on this device.");
      return;
    }
    router.push("/");
  }

  return (
    <div className="mx-auto my-6 w-full max-w-5xl overflow-hidden rounded-xl border border-zinc-200 shadow-sm">
      <Header />
      <div className="flex justify-center bg-white px-5 py-12">
        <form onSubmit={handleSubmit} className="w-full max-w-sm">
          <h1 className="mb-1 text-lg font-medium text-zinc-900">Sign in</h1>
          <p className="mb-6 text-sm text-zinc-500">
            Welcome back to PlateMap.
          </p>

          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@email.com"
            className={inputClass}
          />

          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            className={inputClass}
          />

          {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            className="mb-3 w-full rounded-lg bg-pm-orange px-3 py-2 text-sm font-medium text-white transition-transform active:scale-[0.97]"
          >
            Sign in
          </button>
          <p className="text-center text-sm text-zinc-500">
            Don&apos;t have an account?{" "}
            <Link href="/account/signup" className="text-pm-orange-text">
              Create one
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
