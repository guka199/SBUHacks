import { redirect } from "next/navigation";
// The content optimizer was removed from reports; keep old links working.
export default async function OptimizerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/analysis/${encodeURIComponent(id)}`);
}
