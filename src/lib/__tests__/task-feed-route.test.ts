// @vitest-environment node
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { join } from "path";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const state = vi.hoisted(() => ({ db: null as unknown, active: new Set<string>(), start: vi.fn().mockResolvedValue("resumed") }));
vi.mock("@/lib/db", () => ({ getDb: () => state.db }));
vi.mock("@/lib/pipeline-runner", () => ({ isPipelineRunActive: (id: string) => state.active.has(id), startPipelineRun: state.start }));
vi.mock("@/lib/transcript-render-runner", () => ({ reconcileTranscriptRenders: vi.fn() }));
import { GET } from "@/app/api/tasks/route";
import { GET as getPipeline, POST as postPipeline } from "@/app/api/project/[id]/pipeline/route";
import { getLatestPipelineRun } from "@/lib/pipeline-history";
import { parseTaskFeed, taskHref } from "@/lib/task-feed";

const sqlite = new Database(":memory:");
const db = drizzle(sqlite, { schema });
beforeAll(() => { state.db = db; migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") }); });
beforeEach(() => {
  db.delete(schema.projects).run();
  db.delete(schema.batchJobs).run();
  state.active.clear();
  state.start.mockClear();
  db.insert(schema.projects).values([{ id: "project-a", name: "Project A" }, { id: "project-b", name: "Project B" }]).run();
});
afterAll(() => sqlite.close());

const sameTime = new Date("2026-09-16T00:00:00Z");
function run(values: Partial<typeof schema.pipelineRuns.$inferInsert> & { id: string }) {
  db.insert(schema.pipelineRuns).values({ projectId: "project-a", createdAt: sameTime, ...values }).run();
}
async function feed() { return parseTaskFeed(await (await GET()).json()); }

describe("task discovery and recovery state", () => {
  it("interrupted tasks persist across refreshes once stored, and are removed after a successor succeeds", async () => {
    run({ id: "orphan", status: "running", stage: "stock_fill" });
    for (let i = 0; i < 3; i++) {
      const result = await feed();
      expect(result.attention).toMatchObject([{ id: "orphan", kind: "pipeline_interrupted", stage: "stock_fill" }]);
      expect(result.active).toEqual([]);
    }
    expect(getLatestPipelineRun("project-a")).toMatchObject({ status: "failed", error: "interrupted" });
    run({ id: "replacement", status: "done" });
    expect((await feed()).attention).toEqual([]);
  });

  it("same-second retries identify the newest task by insertion order; active composes are not shown twice", async () => {
    run({ id: "z-old", status: "failed" });
    db.insert(schema.compositions).values({ id: "composition", projectId: "project-a", status: "composing" }).run();
    run({ id: "a-new", status: "running", compositionId: "composition" });
    state.active.add("a-new");
    expect(getLatestPipelineRun("project-a")?.id).toBe("a-new");
    const result = await feed();
    expect(result.attention).toEqual([]);
    expect(result.active).toMatchObject([{ kind: "pipeline", id: "a-new" }]);
  });

  it("keeps each project's latest failure with a matching recovery entry, without exposing error details in the task summary", async () => {
    run({ id: "a", status: "failed", error: "sensitive provider error" });
    run({ id: "b", projectId: "project-b", status: "failed", error: "interrupted" });
    const result = await feed();
    expect(result.attention).toHaveLength(2);
    const failed = result.attention.find((row) => row.id === "a")!;
    expect(failed.kind).toBe("pipeline_failed");
    expect(taskHref(failed)).toBe("/project/project-a/script");
    expect(JSON.stringify(result)).not.toContain("sensitive");
  });

  it("every running batch has its own progress; terminated batches are no longer shown", async () => {
    db.insert(schema.batchJobs).values([{ id: "one", total: 3 }, { id: "two", total: 2 }, { id: "cancelled", status: "cancelled" }]).run();
    db.insert(schema.batchJobItems).values([
      { id: "1", jobId: "one", productId: "p", productName: "p", status: "done" },
      { id: "2", jobId: "one", productId: "p", productName: "p", status: "failed" },
      { id: "3", jobId: "two", productId: "p", productName: "p", status: "done" },
    ]).run();
    expect((await feed()).active).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "one", done: 1, failed: 1, total: 3 }),
      expect.objectContaining({ id: "two", done: 1, failed: 0, total: 2 }),
    ]));
    expect((await feed()).active).toHaveLength(2);
    expect((await GET()).headers.get("Cache-Control")).toBe("no-store");
  });

  it("project queries and resumes also use the newest checkpoint within the same second", async () => {
    run({ id: "z-earlier", status: "failed", stage: "judge", scriptId: "old-script" });
    run({ id: "a-later", status: "failed", stage: "compose", scriptId: "new-script" });
    const context = { params: Promise.resolve({ id: "project-a" }) };
    const url = "http://localhost/api/project/project-a/pipeline";
    expect(await (await getPipeline(new NextRequest(url), context)).json()).toMatchObject({ run: { id: "a-later" } });
    expect((await postPipeline(new NextRequest(url, { method: "POST", body: JSON.stringify({ resume: true }) }), context)).status).toBe(202);
    expect(state.start).toHaveBeenCalledWith(expect.objectContaining({ fromStage: "compose", scriptId: "new-script" }));
  });
});
