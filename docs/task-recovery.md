# Task status and model selection

The task center gathers auto-produce runs, video compositions, cloud generations and active batches across all projects. Click a task to open the matching project page.

- With running or pending tasks it refreshes every 15 seconds; with none it keeps checking for new tasks every 30 seconds.
- Polling pauses while the page is hidden and refreshes immediately when you return, the network recovers, or the task panel is expanded.
- A failed request never clears the task list or shows "No tasks"; the panel says it is showing the last known state and offers a retry.
- Auto-produce failures and interruptions caused by a server restart stay visible; once a new run takes over, the old alert disappears. Retries within the same second still resolve to the latest checkpoint.
- Cloud tasks with an unknown status go to project review and recovery. Reading status from the task center never resubmits a generation request; an unknown status does not mean the charge has completed.

**Load available models** on the Settings page only applies to the current base URL and key. Changing either clears the old list and cancels the old query; a failed query can be retried directly, and typing a model name by hand still works.

## Local verification

`pnpm exec vitest run src/lib/__tests__/task-feed-route.test.ts src/lib/__tests__/use-task-feed.test.ts src/lib/__tests__/model-picker.test.ts`

Covers interrupted-state persistence on real SQLite, same-second retry ordering, progress across all batches, plus idle discovery, offline retry, background pause, request timeout and late responses after switching model catalogs.
