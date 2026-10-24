# Oryn MCP Server

Lets **Claude Desktop / Claude Code / Cursor** or any other MCP client call Oryn's one-sentence video pipeline directly — give it a topic and it renders a video.

> This server is a thin wrapper over the Oryn HTTP API and reuses all of its orchestration (script engine / free stock / free Edge TTS / FFmpeg composition). Start an Oryn instance first (`pnpm dev` or `pnpm start`).

## Tools

| Tool | Description | Needs LLM key |
|---|---|---|
| `oryn_create_video` | Sentence → script → free visuals → free voiceover + captions → vertical video; returns a downloadable mp4 URL | ✅ |
| `oryn_ingest_product` | Paste a product link → scrape title/price/images (JSON-LD > OG > Twitter > title) → create a product project with images; the link-first commerce entry point | — |
| `oryn_generate_script` | Generate a narration storyboard script only (with English stock search terms) | ✅ |
| `oryn_search_stock` | Search the free commercial-use stock library (keyless Openverse images first) | — |
| `oryn_list_projects` | List Oryn projects | — |
| `oryn_compose` | Compose a project that already has a script and assets (free Edge TTS); optional karaoke captions / product card / AI-disclosure badge / purchase CTA / BGM mood / voiceover ducking | — |
| `oryn_list_voices` | List the available free Edge TTS English voices (for the `voice` parameter) | — |
| `oryn_get_video` | Get a project's latest composition (status / download URL) without re-rendering; for polling async output or fetching old videos | — |
| `oryn_master` | Read-only analysis of real cut continuity and EBU R128 loudness by default; with explicit apply, saves a two-pass loudness or deflicker master without overwriting the original | — |
| `oryn_transcript_inspect` | Page through an imported clip's word-level transcript, stable word IDs, current revision and render status | — |
| `oryn_find_clips` | Find segments by quote and target duration; returns previewable time ranges and a dry-runnable plan; local and read-only | — |
| `oryn_transcript_edit` | Dry-run or apply a text-based edit plan; returns only a diff by default and renders a new revision after confirmation | — |
| `oryn_timeline_export` | Export a text edit plan as OTIO / EDL / CSV; no DB writes and no absolute local paths | — |

> Stock footage (Openverse) and voiceover (Edge TTS) are **key-less**; only script generation needs an OpenAI-compatible LLM key.

> **Safe footage-edit flow**: inspect for `latestRevision` and stable word IDs, dry-run with `apply:false`, show the diff, then reuse the same `operationId` with `apply:true` only after explicit confirmation. Retries are idempotent and stale revisions are rejected.

> **NLE handoff**: pass the same complete plan to `oryn_timeline_export`. OTIO keeps editable A/V slices, EDL targets traditional editors and CSV is for human review. Output relinks by original file name only, never exposes absolute local paths and never triggers a render.

> **Short clips from long footage**: `oryn_find_clips` returns the actual quote, `sourceRange`, `plan` and `latestRevision`; once adopted it follows the same dry-run and revision flow. See the [clip workbench](../docs/transcript-clips.md).

> **Post-compose tools** (also MCP tools): read-only-first continuity/mastering via `oryn_master`, release gate `oryn_gate` (readiness + QC + licensing in one verdict — don't deliver on `fail`), `oryn_qc`, `oryn_contact_sheet` (visual self-check), `oryn_credits`, `oryn_export_platform`, `oryn_native_feel`, plus cover/carousel/QR/end-card — full list and the delivery checklist live in [`skills/oryn-video/SKILL.md`](../skills/oryn-video/SKILL.md).

Platform export supports pinned versions, three framings, crop position and native image previews: see [framing and export](../docs/platform-framing.md). Use `framing`, `preview` and `previewTime` with `oryn_export_platform`; pin `compositionId` across preview and final exports.

> **Output options**: `create_video` / `compose` accept `voice` (an English Edge voice from `oryn_list_voices`; defaults to `en-US-AvaNeural`), `aspectRatio` (`9:16` default / `16:9` / `1:1`), `quality` (`fast`/`standard`/`hd`) and `bgm` (`true` = add free CC background music from Wikimedia Commons, ducked under the voiceover; CC tracks usually need attribution). When no visual can be found at all, `create_video` returns an actionable hint instead of a blank video.

> **Video B-roll**: `footage:"auto"` (default) picks **video first, falling back to image per shot** — real motion B-roll with **no key at all** (Wikimedia Commons CC/public-domain video, ≤720p webm transcoded). Pass `footage:"image"` for the fastest path or `footage:"video"` for video only; add `ORYN_PEXELS_KEY` / `ORYN_PIXABAY_KEY` for extra Pexels/Pixabay footage.

## Environment

| Variable | Required | Description |
|---|---|---|
| `ORYN_BASE_URL` | — | Oryn instance URL, default `http://localhost:3000` |
| `ORYN_LLM_BASE_URL` | for scripts | OpenAI-compatible API, e.g. `https://api.openai.com/v1` |
| `ORYN_LLM_API_KEY` | for scripts | LLM key |
| `ORYN_LLM_MODEL` | for scripts | Model name, e.g. `gpt-4o-mini` |
| `ORYN_PEXELS_KEY` | — | Enables Pexels real-footage **video** B-roll (free signup) |
| `ORYN_PIXABAY_KEY` | — | Enables Pixabay real-footage **video** B-roll (free signup) |

## Claude Desktop / Cursor

Add this to your MCP config (Claude Desktop: `claude_desktop_config.json`; Cursor: `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "oryn": {
      "command": "node",
      "args": ["/absolute/path/oryn/mcp/oryn-mcp.mjs"],
      "env": {
        "ORYN_BASE_URL": "http://localhost:3000",
        "ORYN_LLM_BASE_URL": "https://api.openai.com/v1",
        "ORYN_LLM_API_KEY": "sk-...",
        "ORYN_LLM_MODEL": "gpt-4o-mini"
      }
    }
  }
}
```

## Claude Code

```bash
claude mcp add oryn -- node /absolute/path/oryn/mcp/oryn-mcp.mjs
# then add ORYN_LLM_* to that MCP server's env (or export them before launching)
```

## Connect without cloning

Use the versioned MCP package attached to the GitHub Release with Node.js 18 or later. The first launch downloads the package and its dependencies. A running Oryn instance is still required.

```json
{
  "mcpServers": {
    "oryn": {
      "command": "npx",
      "args": ["-y", "--package", "https://github.com/slothrulez/oryn/releases/download/v0.9.7/oryn-mcp-0.1.6.tgz", "oryn-mcp"],
      "env": {
        "ORYN_BASE_URL": "http://localhost:3000",
        "ORYN_LLM_BASE_URL": "https://api.openai.com/v1",
        "ORYN_LLM_API_KEY": "sk-...",
        "ORYN_LLM_MODEL": "gpt-4o-mini"
      }
    }
  }
}
```

> `ORYN_BASE_URL` points to a running Oryn instance — Docker is the easiest:
> `docker run -d -p 3000:3000 -v oryn-data:/data ghcr.io/slothrulez/oryn`

## Publishing to npm and the official MCP Registry

Optional maintainer flow; requires npm publish rights and MCP Registry authorization. The GitHub Release package above works today; these config files don't mean the package is listed on npm or the MCP Registry.

`mcp/package.json` carries the ownership field `mcpName: io.github.slothrulez/oryn`, and `mcp/server.json` is the registry config template. Confirm the npm publish succeeded before publishing to the registry:

```bash
# 1) publish the npm package (from mcp/, with your npm account; the registry requires mcpName in the package, already set)
cd mcp && npm publish --access public
#   if the name oryn-mcp is taken, rename it to @slothrulez/oryn-mcp in package.json and update packages[].identifier in server.json

# 2) publish to the official MCP Registry (registry.modelcontextprotocol.io; brew install mcp-publisher)
cd mcp && mcp-publisher login github && mcp-publisher publish
```

## Try it

Start Oryn (`pnpm dev`), then tell your client:

> Use oryn to make a vertical short video about "how to make pour-over coffee at home"

The agent calls `oryn_create_video` and returns a downloadable mp4 URL within a minute or so.

## Run directly

```bash
pnpm mcp            # = node mcp/oryn-mcp.mjs (stdio)
```
