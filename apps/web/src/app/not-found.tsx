import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-6">
      <section className="surface-strong w-full rounded-[2.5rem] p-10 text-center">
        <div className="eyebrow">Project not found</div>
        <h1 className="display mt-4 text-5xl text-[#1f1814]">This album is still blank.</h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-8 text-[#5d524b]">
          The requested project does not exist or your account does not have access to it yet.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex rounded-full bg-[#1f1814] px-5 py-3 text-sm font-medium text-[#f7efe7] transition-transform hover:-translate-y-0.5"
        >
          Back to dashboard
        </Link>
      </section>
    </main>
  );
}
