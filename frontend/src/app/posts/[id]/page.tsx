import { PostReportView } from "@/components/post-report";
export default async function PostReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PostReportView key={id} id={id} />;
}
