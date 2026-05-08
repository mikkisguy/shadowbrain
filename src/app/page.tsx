export default function Home() {
  return (
    <div className="bg-background flex flex-1 flex-col items-center justify-center font-sans">
      <main className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-foreground text-4xl font-semibold tracking-tight">
          ShadowBrain
        </h1>
        <p className="text-muted-foreground max-w-md text-lg leading-8">
          Your second brain for bookmarks, notes, and ideas. Coming soon.
        </p>
      </main>
    </div>
  );
}
