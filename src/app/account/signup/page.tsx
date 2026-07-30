"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { useAuth } from "@/lib/auth";

const inputClass =
  "mb-4 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm transition-colors focus:border-pm-orange focus:outline-none";

export default function SignUpPage() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name || !email || !password) {
      setError("Fill in every field to create your account.");
      return;
    }
    signUp({ name, email, password });
    router.push("/");
  }

  return (
    <div className="mx-auto my-6 w-full max-w-5xl overflow-hidden rounded-xl border border-zinc-200 shadow-sm">
      <Header />
      <div className="flex justify-center bg-white px-5 py-12">
        <form onSubmit={handleSubmit} className="w-full max-w-sm">
          <h1 className="mb-1 text-lg font-medium text-zinc-900">
            Create your account
          </h1>
          <p className="mb-6 text-sm text-zinc-500">
            Save your favorite San Diego spots and get picks tailored to you.
          </p>

          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Carson Brassell"
            className={inputClass}
          />

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
            placeholder="Create a password"
            className={inputClass}
          />

          {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            className="mb-3 w-full rounded-lg bg-pm-orange px-3 py-2 text-sm font-medium text-white transition-transform active:scale-[0.97]"
          >
            Create account
          </button>
          <p className="text-center text-sm text-zinc-500">
            Already have an account?{" "}
            <Link href="/account/signin" className="text-pm-orange-text">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
