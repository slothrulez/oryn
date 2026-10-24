# Oryn agent skill

`oryn-video/SKILL.md` packages Oryn's video pipeline as an **agent skill** (the `SKILL.md` convention used by Claude Code, Cursor, Copilot, Windsurf, …), so an AI coding assistant can drive Oryn in natural language — "make me a 9:16 video about …" — and it runs the whole pipeline (script → footage → voiceover → subtitles → compose).

It complements Oryn's [MCP server](../mcp/README.md): the MCP exposes callable tools; this skill teaches an assistant *when and how* to use them (plus the CLI / HTTP API).

`script-judges/SKILL.md` is a second, standalone skill: a **four-judge adversarial panel** (pacing / spoken-not-written voice / freshness / structure) that tears short-video script lines apart and rewrites them BEFORE any generation money is spent — feed the voice judge real creators' transcripts (never award-winning ad copy) and run every script through the panel first. Works in any agent host, no binaries needed; pairs with Oryn's in-app ⚖️ judge panel and `POST /api/project/{id}/script-judge`.

## Install

**One command** (any of the 70+ hosts supporting the agentskills.io installer):

```bash
npx skills add slothrulez/oryn
```

**Claude Code plugin** (installs the skill *and* the Oryn MCP server together):

```
/plugin marketplace add slothrulez/oryn
/plugin install oryn@oryn
```

**claude.ai (web)**: download `oryn-skill.zip` from the [latest release](https://github.com/slothrulez/oryn/releases/latest) and upload it under Settings → Capabilities → Skills. Note: the skill drives a **local** Oryn instance, so it is designed for Claude Code / local agents — the claude.ai sandbox cannot reach your machine.

**Or paste this Setup prompt to your agent** (Claude Code / Codex / Cursor — the agent installs everything itself):

> Set up Oryn (https://github.com/slothrulez/oryn) for me. Clone the repo, install deps with pnpm and start it (`pnpm install && pnpm dev`), register `skills/oryn-video` in my assistant's skills directory, and verify with `node bin/oryn.mjs --help`. Script generation needs an OpenAI-compatible LLM — ask me for a key, or wire up a free option (Ollama offline/keyless, or Pollinations with a free key). Footage and voiceover are keyless out of the box.

**Or copy the skill folder manually:**

```bash
# Claude Code (user-level, or your project's .claude/skills/)
cp -r skills/oryn-video ~/.claude/skills/

# Cursor / Windsurf / Copilot: copy into the project's rules/skills folder, e.g.
cp -r skills/oryn-video .cursor/skills/    # Cursor
cp -r skills/oryn-video .windsurf/skills/  # Windsurf
```

Then start a Oryn instance (`pnpm dev`), set `ORYN_LLM_*` for script generation, and ask your assistant to create a video — e.g. *"make me a 9:16 video from this product link …"* (drives the one-shot `oryn_product_script`). See [`oryn-video/SKILL.md`](oryn-video/SKILL.md) for prerequisites, the three drive methods (MCP / CLI / HTTP), and all workflows.
