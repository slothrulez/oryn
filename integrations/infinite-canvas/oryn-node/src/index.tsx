// Oryn video node for Infinite Canvas.
//
// Turns canvas material into a finished, publishable 9:16 short video by driving
// a local Oryn instance (https://github.com/slothrulez/oryn): script LLM
// → free stock footage → free TTS voiceover + captions → FFmpeg compose, with the
// Compliance stack (AI-generated badge, ad-claim screening) on by default.
//
// Two modes, picked automatically:
//   - product mode: upstream IMAGE nodes are product photos — they are uploaded
//     into the project (product-card overlay in the final cut) and the node's
//     inputs feed the commerce script chain
//   - topic mode: no upstream images — one sentence in, finished video out
// The finished video lands back on the canvas as a builtin video node, connected
// downstream, so it can be referenced/remixed like any other canvas asset.
import { definePlugin, useEffect, useRef, useState } from "@infinite-canvas/plugin-sdk";
import type { CanvasNodeContentProps } from "@infinite-canvas/plugin-sdk";

type Cfg = { base: string; llmBaseUrl: string; llmApiKey: string; llmModel: string };
const CFG_KEY = "oryn-config";
const DEFAULT_CFG: Cfg = { base: "http://localhost:3000", llmBaseUrl: "", llmApiKey: "", llmModel: "" };

/** Loose JSON shape from the Oryn API — only the fields this plugin reads, all runtime-checked */
type ApiJson = {
    id?: string;
    projectId?: string;
    filled?: number;
    total?: number;
    compositionId?: string;
    composition?: { status?: string; url?: string };
    error?: string;
    raw?: string;
};

/** Minimal JSON client against the Oryn HTTP API */
async function api(base: string, path: string, init?: { method?: string; body?: unknown }): Promise<ApiJson> {
    let res: Response;
    try {
        res = await fetch(`${base}${path}`, {
            method: init?.method || "GET",
            headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
            body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
        });
    } catch {
        throw new Error(`Can't reach Oryn (${base}). Start an instance first and make sure it's v0.8.79 or later (cross-port CORS).`);
    }
    const text = await res.text();
    let data: ApiJson;
    try {
        data = text ? (JSON.parse(text) as ApiJson) : {};
    } catch {
        data = { raw: text };
    }
    if (!res.ok) throw new Error(data?.error || data?.raw || `HTTP ${res.status}`);
    return data;
}

/** Free-voice default: native English */
function voiceFor(): string {
    return "en-US-AvaNeural";
}

/** Poll the compose run until done/failed (compose is async on the Oryn side) */
async function pollCompose(base: string, projectId: string, compositionId: string, onTick: (s: string) => void): Promise<string> {
    const deadline = Date.now() + 660_000;
    for (;;) {
        const { composition } = await api(base, `/api/project/${projectId}/compose?compositionId=${encodeURIComponent(compositionId)}`);
        if (composition?.status === "done") {
            if (!composition.url) throw new Error("Composition finished but returned no video URL");
            return `${base}${composition.url}`;
        }
        if (composition?.status === "failed") throw new Error("Composition failed (FFmpeg/TTS error)");
        if (Date.now() > deadline) throw new Error("Composition timed out; check the result in the Oryn web app");
        onTick("Composing (voiceover + captions + edit)…");
        await new Promise((r) => setTimeout(r, 2500));
    }
}

function OrynContent({ ctx }: CanvasNodeContentProps) {
    const [cfg, setCfg] = useState<Cfg>(DEFAULT_CFG);
    const [cfgOpen, setCfgOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [stage, setStage] = useState("");
    const [error, setError] = useState("");
    const cfgLoaded = useRef(false);

    // plugin-scoped persisted settings (instance URL + LLM config), loaded once
    useEffect(() => {
        ctx.storage.get<Cfg>(CFG_KEY).then((saved) => {
            if (saved) setCfg({ ...DEFAULT_CFG, ...saved });
            cfgLoaded.current = true;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const saveCfg = (patch: Partial<Cfg>) => {
        const next = { ...cfg, ...patch };
        setCfg(next);
        if (cfgLoaded.current) void ctx.storage.set(CFG_KEY, next);
    };

    const name = String(ctx.node.metadata?.cfName || "");
    const points = String(ctx.node.metadata?.cfPoints || "");
    const duration = Number(ctx.node.metadata?.cfDuration || 25);
    const upstreamImages = ctx
        .getUpstream()
        .filter((n) => n.type === "image" && typeof n.metadata?.content === "string" && n.metadata.content)
        .map((n) => String(n.metadata!.content));
    const productMode = upstreamImages.length > 0;

    const llmReady = !!(cfg.llmBaseUrl && cfg.llmApiKey && cfg.llmModel);
    const llmConfig = { baseUrl: cfg.llmBaseUrl, apiKey: cfg.llmApiKey, model: cfg.llmModel };
    const base = cfg.base.replace(/\/+$/, "");

    const run = async () => {
        if (busy) return;
        if (!name.trim()) return setError(productMode ? "Enter a product name first" : "Enter a one-sentence topic first");
        if (!llmReady) {
            setCfgOpen(true);
            return setError("Configure an LLM (OpenAI-compatible API) in ⚙ settings first");
        }
        setBusy(true);
        setError("");
        try {
            let projectId: string;
            if (productMode) {
                // commerce chain: project → upload product photos → commerce script
                setStage("Creating project…");
                const proj = await api(base, "/api/project", {
                    method: "POST",
                    body: { name: name.trim(), productName: name.trim(), productDescription: points.trim(), productImages: [] },
                });
                projectId = String(proj.id || "");
                if (!projectId) throw new Error("Project creation failed");
                setStage(`Uploading product images (${upstreamImages.length})…`);
                const fd = new FormData();
                for (let i = 0; i < upstreamImages.length; i++) {
                    const blob = await (await fetch(upstreamImages[i])).blob();
                    const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
                    fd.append("files", blob, `canvas-${i + 1}.${ext}`);
                }
                fd.append("projectId", projectId);
                const upRes = await fetch(`${base}/api/upload`, { method: "POST", body: fd });
                const up = await upRes.json();
                if (!upRes.ok || !Array.isArray(up.paths)) throw new Error(up?.error || "Product image upload failed");
                await api(base, `/api/project/${projectId}`, { method: "PATCH", body: { productImages: up.paths } });
                setStage("AI is writing the product script…");
                await api(base, "/api/llm/script", {
                    method: "POST",
                    body: {
                        projectId,
                        productName: name.trim(),
                        productDescription: points.trim(),
                        productImages: up.paths,
                        styleType: "auto",
                        targetDuration: duration,
                        llmConfig,
                    },
                });
            } else {
                // topic chain: one sentence → script + project in one call
                setStage("AI is writing the narration script…");
                const scriptRes = await api(base, "/api/topic/script", {
                    method: "POST",
                    body: { topic: [name.trim(), points.trim()].filter(Boolean).join(", "), narrationStyle: "knowledge", targetDuration: duration, llmConfig },
                });
                projectId = String(scriptRes.projectId || "");
                if (!projectId) throw new Error(String(scriptRes.error || "Script generation failed"));
            }

            setStage("Filling visuals from the free stock library…");
            const fill = await api(base, `/api/project/${projectId}/stock-fill`, {
                method: "POST",
                body: { source: "all", mediaType: "image", llmConfig },
            });
            if (!fill.filled) throw new Error("The stock library found no visuals; try a more specific topic");

            setStage("Submitting composition…");
            const composeBody: Record<string, unknown> = { freeTts: { enabled: true }, freeBgm: true, bgmDuck: true };
            const voice = voiceFor();
            if (voice) (composeBody.freeTts as Record<string, unknown>).voice = voice;
            if (productMode) composeBody.productCard = true;
            const submitted = await api(base, `/api/project/${projectId}/compose`, { method: "POST", body: composeBody });
            const compositionId = String(submitted.compositionId || "");
            if (!compositionId) throw new Error("Composition submission failed");
            const videoUrl = await pollCompose(base, projectId, compositionId, setStage);

            // land the finished video on the canvas as a first-class builtin video node
            const outId = `oryn-out-${ctx.node.id}-${Date.now().toString(36)}`;
            ctx.applyOps([
                {
                    type: "add_node",
                    id: outId,
                    nodeType: "video",
                    title: name.trim().slice(0, 24) || "Oryn video",
                    x: ctx.node.position.x + ctx.node.width + 60,
                    y: ctx.node.position.y,
                    width: 270,
                    height: 480,
                    metadata: { content: videoUrl, status: "success", mimeType: "video/mp4" },
                },
                { type: "connect_nodes", fromNodeId: ctx.node.id, toNodeId: outId },
            ]);
            ctx.updateMetadata({ cfVideoUrl: videoUrl, cfProjectId: projectId });
            setStage(`Done ✓ project ${projectId.slice(0, 8)}… (continue multi-platform export in the Oryn web app)`);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setStage("");
        } finally {
            setBusy(false);
        }
    };

    const t = ctx.theme;
    const inputStyle = { width: "100%", boxSizing: "border-box", padding: "5px 8px", borderRadius: 8, border: `1px solid ${t.node.stroke}`, background: t.node.panel, color: t.node.text, fontSize: 12, outline: "none" } as const;
    const labelStyle = { fontSize: 11, color: t.node.muted } as const;
    const btn = { padding: "6px 12px", borderRadius: 8, border: `1px solid ${t.node.activeStroke}`, background: t.toolbar.activeBg, color: t.toolbar.activeText, cursor: "pointer", fontSize: 12, fontWeight: 600 } as const;

    return (
        <div data-canvas-no-zoom onMouseDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", gap: 6, padding: 12, boxSizing: "border-box", color: t.node.text, overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>🎬 Oryn video</span>
                <span style={{ ...labelStyle, marginLeft: "auto" }}>{productMode ? `Product · ${upstreamImages.length} images` : "Topic mode"}</span>
                <button type="button" title="Settings" onClick={() => setCfgOpen((v) => !v)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 13, color: t.node.muted }}>⚙</button>
            </div>
            {cfgOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 8, borderRadius: 8, border: `1px dashed ${t.node.stroke}` }}>
                    <span style={labelStyle}>Oryn URL</span>
                    <input style={inputStyle} value={cfg.base} onChange={(e) => saveCfg({ base: e.target.value })} placeholder="http://localhost:3000" />
                    <span style={labelStyle}>LLM API (OpenAI-compatible, writes the script)</span>
                    <input style={inputStyle} value={cfg.llmBaseUrl} onChange={(e) => saveCfg({ llmBaseUrl: e.target.value })} placeholder="https://api.atlascloud.ai/v1" />
                    <input style={inputStyle} type="password" value={cfg.llmApiKey} onChange={(e) => saveCfg({ llmApiKey: e.target.value })} placeholder="API Key" />
                    <input style={inputStyle} value={cfg.llmModel} onChange={(e) => saveCfg({ llmModel: e.target.value })} placeholder="Model ID" />
                </div>
            )}
            <span style={labelStyle}>{productMode ? "Product name (connect an upstream image node = product images)" : "One-sentence topic (connect an upstream image node for product mode)"}</span>
            <input style={inputStyle} value={name} onChange={(e) => ctx.updateMetadata({ cfName: e.target.value })} placeholder={productMode ? "e.g. Black walnut phone stand" : "e.g. How to make great pour-over coffee at home"} />
            <span style={labelStyle}>Selling points / notes (optional)</span>
            <input style={inputStyle} value={points} onChange={(e) => ctx.updateMetadata({ cfPoints: e.target.value })} placeholder="e.g. Solid wood feel, sturdy, premium on any desk" />
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <select style={{ ...inputStyle, width: "auto" }} value={duration} onChange={(e) => ctx.updateMetadata({ cfDuration: Number(e.target.value) })}>
                    <option value={15}>15s</option>
                    <option value={25}>25s</option>
                    <option value={40}>40s</option>
                </select>
                <button type="button" style={{ ...btn, opacity: busy ? 0.5 : 1, cursor: busy ? "wait" : "pointer" }} disabled={busy} onClick={run}>
                    {busy ? "Rendering…" : "▶ Make video"}
                </button>
            </div>
            {stage && <div style={{ fontSize: 11, color: t.node.muted }}>{stage}</div>}
            {error && <div style={{ fontSize: 11, color: "#ef4444", whiteSpace: "pre-wrap" }}>{error}</div>}
            {typeof ctx.node.metadata?.cfVideoUrl === "string" && !busy && (
                <a href={String(ctx.node.metadata.cfVideoUrl)} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: t.node.label }}>↗ Open video mp4</a>
            )}
        </div>
    );
}

export default definePlugin({
    id: "oryn",
    name: "Oryn video",
    version: "1.0.0",
    description: "Turn canvas assets into a publish-ready product short in one click: script → visuals → voiceover/captions → render, all driven by a local Oryn instance.",
    nodes: [
        {
            type: "oryn:ad-video",
            title: "Oryn video",
            icon: "🎬",
            description: "Connect product images and render a 9:16 product video in one click (driven by a local Oryn instance)",
            defaultSize: { width: 320, height: 330 },
            defaultMetadata: { cfName: "", cfPoints: "", cfDuration: 25 },
            minimapColor: "#7c3aed",
            // downstream consumers see the finished video as this node's resource
            resource: (node) =>
                typeof node.metadata?.cfVideoUrl === "string" && node.metadata.cfVideoUrl
                    ? { kind: "video", url: node.metadata.cfVideoUrl }
                    : null,
            Content: OrynContent,
        },
    ],
});
