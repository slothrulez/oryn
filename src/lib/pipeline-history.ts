import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pipelineRuns } from "@/lib/db/schema";

/** When second-level timestamps tie, insertion order decides, so we never restore a previous failed run. */
export function getLatestPipelineRun(projectId: string) {
  return getDb().select().from(pipelineRuns).where(eq(pipelineRuns.projectId, projectId))
    .orderBy(desc(pipelineRuns.createdAt), desc(sql`${pipelineRuns}.rowid`)).get();
}

/** Each project shows only its latest run; a failure notice stays until a new run replaces it. */
export function listLatestPipelineRuns() {
  return getDb().select().from(pipelineRuns).where(sql`${pipelineRuns.id} IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at DESC, rowid DESC) AS rank
      FROM pipeline_runs
    ) WHERE rank = 1
  )`).all();
}
