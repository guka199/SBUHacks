"use client";

import { useState } from "react";
import { api, type DashboardResponse } from "@/lib/api";

// TODO: replace with the logged-in user (wallet address) once wallet connect is added
const DEMO_USER = "demo";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setData(await api.dashboard(DEMO_USER));
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <button onClick={load} className="w-fit rounded-md border px-3 py-1.5 text-sm">
        Load my stats
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {/* TODO: charts (Recharts) comparing engagement by platform, format and week */}
      {data && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Platform</th>
              <th>Posts</th>
              <th>Avg engagement</th>
              <th>Total views</th>
            </tr>
          </thead>
          <tbody>
            {data.platforms.map((p) => (
              <tr key={p.platform} className="border-b border-black/5">
                <td className="py-2 capitalize">{p.platform}</td>
                <td>{p.posts}</td>
                <td>{(p.avg_engagement_rate * 100).toFixed(1)}%</td>
                <td>{p.total_views.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
