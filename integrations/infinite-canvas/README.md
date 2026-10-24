# Oryn × Infinite Canvas node plugin

Turns assets on [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) (an AI infinite-canvas workspace, AGPL-3.0) into **publish-ready product short videos** in one click: drop a "🎬 Oryn video" node on the canvas, connect product images and click "Make video" — script → free stock footage → free TTS + captions → FFmpeg compose, all driven by a local Oryn instance. The finished video lands back on the canvas as a first-class video node that can be referenced and remixed.

## Usage

1. Start Oryn (v0.8.79+, which ships local cross-port CORS): `pnpm dev` or the desktop app.
2. In infinite-canvas, open "Node plugins → Third-party plugins" and install this plugin by its JS URL (host [`dist/oryn.js`](dist/oryn.js) at any static URL; for local development put it in `web/public/plugins/`).
3. Canvas toolbar 🧩 → "Oryn video" to create a node → fill in the Oryn URL and LLM API (OpenAI-compatible, used only for the script) under ⚙ → enter a topic or connect an upstream image node (switches to product mode; product images are uploaded to the project and shown on the video's product card) → ▶ Make video.

Two modes are picked automatically:

- **Topic mode**: no upstream images, one sentence → video (the `/api/topic/script` chain).
- **Product mode**: an upstream image node → create project + upload product images + product script chain (`/api/project` → `/api/upload` → `/api/llm/script`), composed with a product card.

## Build

The plugin depends on the upstream repo's `@infinite-canvas/plugin-sdk` (a local `file:../sdk` dependency), so build it inside the upstream repo:

```bash
git clone https://github.com/basketikun/infinite-canvas.git
cp -r oryn-node infinite-canvas/plugins/canvas/oryn
cd infinite-canvas/plugins/canvas/sdk && bun install
cd ../oryn && bun install && bun run build   # → dist/oryn.js (copy to web/public/plugins/)
```

## License

Upstream infinite-canvas and Oryn are both **AGPL-3.0**; this plugin's source ships with the Oryn repo under AGPL-3.0. The build output is an ESM module (React external) matching the host loader contract and runs inside the canvas page.

## Security

Since v0.8.79, Oryn allows CORS on `/api/*` **only for localhost origins** (any port; extend explicitly with `ORYN_CORS_ORIGINS`). Remote web origins never match, so the browser-side defense of the local instance stays intact.
