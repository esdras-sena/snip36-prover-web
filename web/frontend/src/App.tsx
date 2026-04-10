import { useEffect, useMemo, useState } from "react";
import { WalletAccount } from "starknet";
import { connect } from "@starknet-io/get-starknet";
import {
  get_snip36_proof,
  submit_snip36_tx,
  type Snip36ProofArtifact,
  type Snip36ProofBundle,
} from "@snip36/prover-web";

const FALLBACK_RPC_URL = "https://api.zan.top/public/starknet-sepolia/rpc/v0_10";
const STRK_TOKEN = "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5d3d0f7160c7f9c7e4f3c7f5f";
const CHAIN_ID = "SN_SEPOLIA";
const PROVE_TIMEOUT_MS = 90_000;
const BUILD_TIMEOUT_MS = 30_000;

type Status = "idle" | "loading" | "done" | "error";

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const id = setTimeout(() => {
        clearTimeout(id);
        reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);
    }),
  ]);
}

interface BuildPayloadResponse {
  rpc_url: string;
  chain_id: string;
  sender_address: string;
  nonce: string;
  tx_hash: string;
  payload: unknown;
}

function cleanErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  if (raw.includes("RETURN_INITIAL_READS") || raw.includes("unknown simulation flag")) {
    return "The configured RPC node does not support RETURN_INITIAL_READS. Point the backend at a Pathfinder/v0.10-compatible node instead of the public fallback RPC.";
  }

  if (raw === "Failed to fetch" || raw.includes("NetworkError")) {
    return "Could not reach the local SNIP-36 backend. Start snip36-server so the frontend can export the execution payload.";
  }

  if (raw.includes("PROTOCOL_ERROR") || raw.includes("RST_STREAM") || raw.includes("failed relay, insufficient results")) {
    return "Lava RPC failed upstream while exporting the execution payload (500 / PROTOCOL_ERROR). Try again or switch to a healthier RPC endpoint.";
  }

  if (raw.includes("wallet_addInvokeTransaction") || raw.includes("signed INVOKE payload needed to execute only inside the virtual OS")) {
    return "The injected wallet API only gives a sign-and-submit flow plus a transaction hash. It does not expose the signed invoke payload needed for proving only inside the virtual OS without broadcasting.";
  }

  const stripped = raw
    .replace(/^HTTP \d+:\s*/i, "")
    .replace(/warning:[\s\S]*?Error:/, "Error:")
    .trim();

  try {
    const parsed = JSON.parse(stripped) as { detail?: string };
    if (typeof parsed.detail === "string") {
      return cleanErrorMessage(parsed.detail);
    }
  } catch {
    // Not JSON. Fall through.
  }

  const detailMatch = stripped.match(/"detail"\s*:\s*"([\s\S]+)"/);
  if (detailMatch?.[1]) {
    const unescaped = detailMatch[1]
      .replace(/\\n/g, "\n")
      .replace(/\\\"/g, '"')
      .replace(/\\\\/g, "\\");
    return cleanErrorMessage(unescaped);
  }

  return stripped;
}

export default function App() {
  const [recipientAddress, setRecipientAddress] = useState("");
  const [amount, setAmount] = useState("1");
  const [rpcUrl, setRpcUrl] = useState(FALLBACK_RPC_URL);
  const [senderAddress, setSenderAddress] = useState<string | null>(null);
  const [walletAccount, setWalletAccount] = useState<WalletAccount | null>(null);
  const [walletLabel, setWalletLabel] = useState<string | null>(null);
  const [nonce, setNonce] = useState<string | null>(null);
  const [outerSenderAddress, setOuterSenderAddress] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<Snip36ProofArtifact | null>(null);
  const [bundle, setBundle] = useState<Snip36ProofBundle | null>(null);
  const [payload, setPayload] = useState<unknown>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);


  const normalizedRecipient = recipientAddress.trim();
  const normalizedAmount = amount.trim();

  const transferCalldata = useMemo(() => {
    try {
      if (!normalizedRecipient || !normalizedAmount) return [];
      const amountValue = BigInt(normalizedAmount);
      if (amountValue < 0n) return [];
      const low = `0x${(amountValue & ((1n << 128n) - 1n)).toString(16)}`;
      const high = `0x${(amountValue >> 128n).toString(16)}`;
      return [normalizedRecipient, low, high];
    } catch {
      return [];
    }
  }, [normalizedAmount, normalizedRecipient]);

  const canProve = transferCalldata.length === 3;


  async function handleConnectWallet() {
    setStatus("loading");
    setError(null);
    try {
      const selectedWallet = await connect({ modalMode: "alwaysAsk", modalTheme: "dark" });
      if (!selectedWallet) {
        setStatus("idle");
        return;
      }
      const account = await WalletAccount.connect({ nodeUrl: rpcUrl }, selectedWallet, "1");
      setWalletAccount(account);
      setSenderAddress(account.address);
      setWalletLabel(selectedWallet.name ?? "Connected wallet");
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(cleanErrorMessage(err));
    }
  }

  async function handleProveInBrowser() {
    setStatus("loading");
    setError(null);
    setPayload(null);
    setArtifact(null);
    setBundle(null);
    setSenderAddress(null);
    setOuterSenderAddress(null);
    setNonce(null);
    try {
      if (!canProve) {
        throw new Error("Enter a valid recipient address and a non-negative transfer amount first.");
      }
      if (!walletAccount || !senderAddress) {
        throw new Error("Connect a Braavos or Argent wallet first.");
      }
      const nextBundle = await withTimeout(
        get_snip36_proof({
          rpc_url: rpcUrl,
          sender_address: senderAddress,
          signer: walletAccount,
          call: {
            contractAddress: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
            entrypoint: "transfer",
            calldata: transferCalldata
          },
          chain_id: CHAIN_ID,
          strk_fee_token_address: STRK_TOKEN,
        }),
        PROVE_TIMEOUT_MS,
        "proof generation",
      );
      setRpcUrl(rpcUrl);
      setOuterSenderAddress((nextBundle.artifact.transaction as { sender_address?: string })?.sender_address ?? null);
      setNonce((nextBundle.artifact.transaction as { nonce?: string })?.nonce ?? null);
      setArtifact(nextBundle.artifact);
      setBundle(nextBundle);
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(cleanErrorMessage(err));
    }
  }

  async function handleBuildPayload() {
    setStatus("error");
    setError("submit_snip36_tx is still disabled in this frontend until the normal submit path is wired end-to-end.");
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={{ marginTop: 0 }}>SNIP-36 web twin</h1>
        <p style={mutedStyle}>
          Thin test frontend only: proving must not broadcast. With the current injected WalletAccount API, the wallet only exposes a sign-and-submit flow that returns a transaction hash, not the signed invoke payload needed for virtual-OS-only execution.
        </p>

        <div style={gridStyle}>
          <Field label="Recipient address" value={recipientAddress} onChange={setRecipientAddress} />
          <Field label="Transfer amount (uint256)" value={amount} onChange={setAmount} />
        </div>

        <div style={metaStyle}>
          RPC source: <code>{rpcUrl}</code>
          {walletLabel ? <><br />Wallet: <code>{walletLabel}</code></> : null}
          {senderAddress ? <><br />Wallet: <code>{senderAddress}</code></> : null}
          {outerSenderAddress ? <><br />Virtual OS tx sender: <code>{outerSenderAddress}</code></> : null}
          {nonce ? <><br />Nonce: <code>{nonce}</code></> : null}
        </div>

        <div style={buttonRowStyle}>
          <button onClick={handleConnectWallet} style={buttonStyle} disabled={status === "loading"}>{walletAccount ? "Reconnect wallet" : "Connect wallet"}</button>
          <button onClick={handleProveInBrowser} style={buttonStyle} disabled={!walletAccount || !canProve || status === "loading"}>1. Prove with get_snip36_proof(...)</button>
          <button onClick={handleBuildPayload} style={buttonStyle} disabled={true}>2. Submit with submit_snip36_tx(...) — disabled until SNIP-9 submit wiring is finished</button>
        </div>

        <div style={statusStyle(status)}>
          <strong>Status:</strong> {status}
          {error ? <div style={{ marginTop: 8 }}>{error}</div> : null}
        </div>

        <Section title="Raw transfer calldata">
          <pre style={preStyle}>{transferCalldata.length ? JSON.stringify(transferCalldata, null, 2) : "—"}</pre>
        </Section>

        <Section title="Artifact">
          <pre style={preStyle}>{artifact ? JSON.stringify(artifact, null, 2) : "—"}</pre>
        </Section>

        <Section title="Proof bundle">
          <pre style={preStyle}>{bundle ? JSON.stringify(bundle, null, 2) : "—"}</pre>
        </Section>

        <Section title="Final payload">
          <pre style={preStyle}>{payload ? JSON.stringify(payload, null, 2) : "—"}</pre>
        </Section>
      </div>
    </div>
  );
}

function Field(props: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <div style={labelStyle}>{props.label}</div>
      <input value={props.value} onChange={(e) => props.onChange(e.target.value)} style={inputStyle} />
    </label>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 20 }}>
      <h2 style={{ fontSize: 16, marginBottom: 8 }}>{props.title}</h2>
      {props.children}
    </section>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#0b1020",
  color: "#f8fafc",
  padding: 24,
  fontFamily: "system-ui, sans-serif",
};

const cardStyle: React.CSSProperties = {
  maxWidth: 1100,
  margin: "0 auto",
  background: "#111827",
  border: "1px solid #374151",
  borderRadius: 16,
  padding: 24,
};

const mutedStyle: React.CSSProperties = { color: "#94a3b8", marginTop: 0 };
const gridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 };
const metaStyle: React.CSSProperties = { marginTop: 12, color: "#cbd5e1", fontSize: 13 };
const labelStyle: React.CSSProperties = { fontSize: 12, color: "#cbd5e1", marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: "100%", padding: 10, borderRadius: 8, border: "1px solid #475569", background: "#0f172a", color: "#f8fafc" };
const buttonRowStyle: React.CSSProperties = { display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" };
const buttonStyle: React.CSSProperties = { padding: "10px 14px", borderRadius: 8, border: 0, background: "#7c3aed", color: "white", fontWeight: 700, cursor: "pointer" };
const preStyle: React.CSSProperties = { whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#020617", color: "#cbd5e1", padding: 12, borderRadius: 10, border: "1px solid #1e293b", maxHeight: 320, overflow: "auto", fontSize: 12 };
const statusStyle = (status: Status): React.CSSProperties => ({ marginTop: 16, padding: 12, borderRadius: 10, background: status === "error" ? "#450a0a" : status === "done" ? "#052e16" : "#172554", border: "1px solid rgba(255,255,255,0.12)" });
