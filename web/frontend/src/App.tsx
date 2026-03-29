import { useMemo, useState } from "react";
import {
  buildPayload,
  proveTransactionInBrowser,
  type Snip36ProofArtifact,
  type Snip36ProofBundle,
} from "@snip36/prover-web";

const STRK_TOKEN = "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5d3d0f7160c7f9c7e4f3c7f5f";

type Status = "idle" | "loading" | "done" | "error";

export default function App() {
  const [rpcUrl, setRpcUrl] = useState("http://localhost:9545");
  const [blockNumber, setBlockNumber] = useState(0);
  const [txHash, setTxHash] = useState("");
  const [senderAddress, setSenderAddress] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [nonce, setNonce] = useState("0x0");
  const [chainId, setChainId] = useState("SN_SEPOLIA");
  const [calldataText, setCalldataText] = useState("[]");
  const [artifact, setArtifact] = useState<Snip36ProofArtifact | null>(null);
  const [bundle, setBundle] = useState<Snip36ProofBundle | null>(null);
  const [payload, setPayload] = useState<unknown>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const parsedCalldata = useMemo(() => {
    try {
      const parsed = JSON.parse(calldataText);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }, [calldataText]);

  async function handleProveInBrowser() {
    setStatus("loading");
    setError(null);
    setPayload(null);
    setArtifact(null);
    setBundle(null);
    try {
      const nextBundle = await proveTransactionInBrowser({
        rpc_url: rpcUrl,
        block_number: Number(blockNumber),
        tx_hash: txHash || undefined,
        chain_id: chainId,
        strk_fee_token_address: STRK_TOKEN,
      });
      setArtifact(nextBundle.artifact);
      setBundle(nextBundle);
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleBuildPayload() {
    if (!bundle?.proof_base64) return;
    setStatus("loading");
    setError(null);
    try {
      const nextPayload = await buildPayload({
        sender_address: senderAddress,
        private_key: privateKey,
        calldata: parsedCalldata,
        proof_base64: bundle.proof_base64,
        proof_facts: bundle.proof_facts,
        nonce,
        chain_id: chainId,
      });
      setPayload(nextPayload);
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={{ marginTop: 0 }}>snip36-web browser proving test</h1>
        <p style={mutedStyle}>
          Fetch the transaction from RPC, run the SNIP-36 execution path in wasm,
          generate the proof in browser, then build the final payload locally.
        </p>

        <div style={gridStyle}>
          <Field label="RPC URL" value={rpcUrl} onChange={setRpcUrl} />
          <Field label="Block number" value={String(blockNumber)} onChange={(v) => setBlockNumber(Number(v || 0))} />
          <Field label="Tx hash" value={txHash} onChange={setTxHash} />
          <Field label="Chain ID" value={chainId} onChange={setChainId} />
          <Field label="Sender address" value={senderAddress} onChange={setSenderAddress} />
          <Field label="Private key" value={privateKey} onChange={setPrivateKey} />
          <Field label="Nonce" value={nonce} onChange={setNonce} />
        </div>

        <label style={{ display: "block", marginTop: 16 }}>
          <div style={labelStyle}>Calldata JSON array</div>
          <textarea
            value={calldataText}
            onChange={(e) => setCalldataText(e.target.value)}
            rows={4}
            style={textareaStyle}
          />
        </label>

        <div style={buttonRowStyle}>
          <button onClick={handleProveInBrowser} style={buttonStyle}>1. Prove transaction in browser</button>
          <button onClick={handleBuildPayload} style={buttonStyle} disabled={!bundle?.proof_base64}>2. Build payload</button>
        </div>

        <div style={statusStyle(status)}>
          <strong>Status:</strong> {status}
          {error ? <div style={{ marginTop: 8 }}>{error}</div> : null}
        </div>

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
const labelStyle: React.CSSProperties = { fontSize: 12, color: "#cbd5e1", marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: "100%", padding: 10, borderRadius: 8, border: "1px solid #475569", background: "#0f172a", color: "#f8fafc" };
const textareaStyle: React.CSSProperties = { width: "100%", padding: 10, borderRadius: 8, border: "1px solid #475569", background: "#0f172a", color: "#f8fafc", fontFamily: "monospace" };
const buttonRowStyle: React.CSSProperties = { display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" };
const buttonStyle: React.CSSProperties = { padding: "10px 14px", borderRadius: 8, border: 0, background: "#7c3aed", color: "white", fontWeight: 700, cursor: "pointer" };
const preStyle: React.CSSProperties = { whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#020617", color: "#cbd5e1", padding: 12, borderRadius: 10, border: "1px solid #1e293b", maxHeight: 320, overflow: "auto", fontSize: 12 };
const statusStyle = (status: Status): React.CSSProperties => ({ marginTop: 16, padding: 12, borderRadius: 10, background: status === "error" ? "#450a0a" : status === "done" ? "#052e16" : "#172554", border: "1px solid rgba(255,255,255,0.12)" });
