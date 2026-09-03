export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="font-display text-4xl text-text">Overlap</h1>
      <p className="max-w-md text-text-muted">
        Shows you when your friends are actually free. This is the v1 scaffold
        — group creation, the Signal, and the heatmap land in later tickets
        (see docs/agent-prompt.md).
      </p>
    </main>
  );
}
