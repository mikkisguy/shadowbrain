import type { Metadata } from "next";
import { AddPageForm } from "./add-page-form";

export const metadata: Metadata = {
  title: "Add · ShadowBrain",
};

interface AddPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function AddPage({ searchParams }: AddPageProps) {
  const params = await searchParams;

  // Extract pre-fill values from URL params
  const type = typeof params.type === "string" ? params.type : undefined;
  const text = typeof params.text === "string" ? params.text : undefined;
  const url = typeof params.url === "string" ? params.url : undefined;

  return (
    <main
      id="main-content"
      className="mx-auto flex w-full max-w-screen-2xl flex-col px-4 py-6 sm:px-6 sm:py-8"
    >
      <AddPageForm prefillType={type} prefillText={text} prefillUrl={url} />
    </main>
  );
}
