import { ModelTester } from "./model-tester";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-24">
      <div className="w-full max-w-3xl">
        <p className="text-sm font-medium uppercase tracking-[0.3em] text-zinc-500">
          SDK Operations
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-950 sm:text-6xl dark:text-zinc-50">
          Ready to build.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          A clean Next.js workspace with Bun, TypeScript, Tailwind, and Biome.
        </p>
        <ModelTester />
      </div>
    </main>
  );
}
