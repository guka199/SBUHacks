import { Dashboard } from "@/components/dashboard";
export default async function OptimizerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Dashboard
      key={id}
      analysisId={id}
      demo={id === "demo"}
      initialView="optimizer"
    />
  );
}
