"use client";

import { useState } from "react";
import { api } from "@/lib/api";

const DEMO_USER = "demo";

export default function RewardsPage() {
  // TODO: replace the text box with Solana wallet adapter (Phantom) connect
  const [wallet, setWallet] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function shareData() {
    setStatus("Recording contribution...");
    try {
      const c = await api.contribute(DEMO_USER, wallet, 10);
      setStatus("Sending tokens on devnet...");
      const res = await fetch("/api/reward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, amount: c.tokens_owed, contributionId: c.contribution_id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setStatus(`Sent ${c.tokens_owed} tokens. Transaction: ${body.signature}`);
    } catch (e) {
      setStatus(`Failed: ${String(e)}`);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Rewards</h1>
      <p className="max-w-xl opacity-70">
        Share your anonymized post stats to improve PostPilot&apos;s predictions and earn tokens on Solana devnet.
      </p>
      <input
        value={wallet}
        onChange={(e) => setWallet(e.target.value)}
        placeholder="Your Solana wallet address"
        className="rounded-md border p-2 font-mono text-sm"
      />
      <button
        onClick={shareData}
        disabled={!wallet}
        className="w-fit rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-40"
      >
        Share data and earn tokens
      </button>
      {status && <p className="break-all text-sm">{status}</p>}
    </section>
  );
}
