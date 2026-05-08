export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-background font-sans">
      <main className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">
          ShadowBrain
        </h1>
        <p className="max-w-md text-lg leading-8 text-muted-foreground">
          Your second brain for bookmarks, notes, and ideas. Coming soon.
        </p>
      </main>
    </div>
  );
}
