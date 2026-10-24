// Sends PostPilot reward tokens (SPL) to a user's wallet on Solana devnet.
// Runs on the server so the payout wallet's secret key never reaches the browser.

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, getMint, transfer } from "@solana/spl-token";

export async function POST(request: Request) {
  const { wallet, amount } = (await request.json()) as { wallet: string; amount: number; contributionId?: string };

  const secret = process.env.REWARD_WALLET_SECRET_KEY;
  const mintAddress = process.env.REWARD_MINT_ADDRESS;
  if (!secret || !mintAddress) {
    return Response.json({ error: "Reward wallet not configured (see .env.example)" }, { status: 500 });
  }

  try {
    const connection = new Connection(process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
    const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)));
    const mint = new PublicKey(mintAddress);
    const recipient = new PublicKey(wallet);

    const { decimals } = await getMint(connection, mint);
    const from = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);
    const to = await getOrCreateAssociatedTokenAccount(connection, payer, mint, recipient);

    const signature = await transfer(
      connection,
      payer,
      from.address,
      to.address,
      payer,
      BigInt(amount) * BigInt(10) ** BigInt(decimals),
    );

    // TODO: write signature back to CONTRIBUTIONS.tx_signature via the API
    return Response.json({ signature });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
