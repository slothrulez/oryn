import { describe, it, expect, vi, afterEach } from "vitest";
import { AtlasCloudProvider } from "@/lib/providers/atlas-cloud";
import { ProviderError } from "@/lib/providers/base";

/**
 * Issue #16 regressions — paid-task money safety.
 *
 * A user clicked "convert to motion" once, the UI reported a 30s timeout, yet Atlas Cloud
 * billed a acme/motion-2.0/TEXT-to-video task and the app kept no task ID. Four
 * distinct defects combined into that loss; each gets a regression net here:
 *  1. non-idempotent POST auto-retried on timeout → could create duplicate paid tasks
 *  2. image-to-video requests silently billed to a text-to-video model
 *  3. task ID unavailable until final success → poll failure lost the paid task
 *  4. one transient status-query failure aborted the whole wait
 */

const cfg = { name: "atlas-cloud", apiKey: "test-key", baseUrl: "https://example.com", timeout: 50 };

// access the protected request/getTaskStatus for direct policy testing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asAny = (p: unknown) => p as any;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** fetch stub that never responds and rejects with AbortError when the request times out */
function stubHangingFetch() {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Promise((_, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    })
  );
  return calls;
}

/** fetch stub that always returns the given HTTP status */
function stubStatusFetch(status: number) {
  const fn = vi.fn(async () => ({
    ok: false,
    status,
    statusText: "ERR",
    text: async () => "boom",
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("retry policy for non-idempotent paid POSTs (issue #16 problem 1)", () => {
  it("POST timeout: never auto-retried (fetch only once), and the error warns the server may have accepted it", async () => {
    const calls = stubHangingFetch();
    const p = new AtlasCloudProvider(cfg);
    await expect(asAny(p).request("/model/generateVideo", { method: "POST", body: {} })).rejects.toMatchObject({
      code: "TIMEOUT",
      message: expect.stringContaining("timed out"),
    });
    expect(calls.length).toBe(1);
  });

  it("GET timeout: idempotent requests retry normally (fetch 3 times)", async () => {
    const calls = stubHangingFetch();
    const p = new AtlasCloudProvider(cfg);
    await expect(asAny(p).request("/model/prediction/x")).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(calls.length).toBe(3);
  }, 15000);

  it("POST 429: the server explicitly rejected it (not accepted), safe to retry (fetch 3 times)", async () => {
    const fn = stubStatusFetch(429);
    const p = new AtlasCloudProvider(cfg);
    await expect(asAny(p).request("/model/generateVideo", { method: "POST", body: {} })).rejects.toThrow(ProviderError);
    expect(fn.mock.calls.length).toBe(3);
  }, 15000);

  it("POST 500: server state unknown, no retry (fetch only once)", async () => {
    const fn = stubStatusFetch(500);
    const p = new AtlasCloudProvider(cfg);
    await expect(asAny(p).request("/model/generateVideo", { method: "POST", body: {} })).rejects.toThrow(ProviderError);
    expect(fn.mock.calls.length).toBe(1);
  });

  it("POSTs explicitly declared idempotent: true can retry (reserved for platforms with idempotency keys)", async () => {
    const fn = stubStatusFetch(500);
    const p = new AtlasCloudProvider(cfg);
    await expect(
      asAny(p).request("/model/generateVideo", { method: "POST", body: {}, idempotent: true })
    ).rejects.toThrow(ProviderError);
    expect(fn.mock.calls.length).toBe(3);
  }, 15000);
});

describe("model capability checks and i2v mapping (issue #16 problem 4: animate billed as text-to-video)", () => {

  it("image-to-video requested without a first frame → errors before submit, no paid call made", async () => {
    const p = new AtlasCloudProvider(cfg);
    const req = vi.spyOn(asAny(p), "request").mockResolvedValue({ data: { id: "never" } });
    await expect(
      p.submitVideoTask({ modelId: "acme/motion-2.0/text-to-video", mode: "image-to-video", prompt: "x" })
    ).rejects.toMatchObject({ code: "MISSING_FIRST_FRAME" });
    expect(req).not.toHaveBeenCalled();
  });





  it("custom models outside the catalog: no capability info, passed through as-is", async () => {
    const p = new AtlasCloudProvider(cfg);
    const req = vi.spyOn(asAny(p), "request").mockResolvedValue({ data: { id: "task-2" } });
    const { modelId } = await p.submitVideoTask({
      modelId: "my-org/custom-model",
      mode: "image-to-video",
      prompt: "x",
      firstFrameUrl: "https://example.com/f.png",
    });
    expect(modelId).toBe("my-org/custom-model");
    expect(req).toHaveBeenCalledOnce();
  });
});

describe("two-phase submit: get the task ID first, then poll (issue #16 problems 2/3)", () => {
  it("submitVideoTask submits without polling: returns taskId, getTaskStatus is not called", async () => {
    const p = new AtlasCloudProvider(cfg);
    vi.spyOn(asAny(p), "request").mockResolvedValue({ data: { id: "task-3" } });
    const statusSpy = vi.spyOn(p, "getTaskStatus");
    const { taskId } = await p.submitVideoTask({
      modelId: "acme/motion-2.0/image-to-video",
      mode: "image-to-video",
      prompt: "x",
      firstFrameUrl: "https://example.com/f.png",
    });
    expect(taskId).toBe("task-3");
    expect(statusSpy).not.toHaveBeenCalled();
  });
});

describe("polling fault tolerance: transient status failures must not discard a paid task (issue #16 problem 3/fix 4)", () => {
  it("status query fails twice then recovers → finally returns the result", async () => {
    const p = new AtlasCloudProvider(cfg);
    const statusSpy = vi
      .spyOn(p, "getTaskStatus")
      .mockRejectedValueOnce(new ProviderError("timeout", "TIMEOUT", "atlas-cloud"))
      .mockRejectedValueOnce(new ProviderError("timeout", "TIMEOUT", "atlas-cloud"))
      .mockResolvedValue({
        taskId: "task-4",
        status: "completed",
        result: { taskId: "task-4", videoUrls: ["https://example.com/v.mp4"], modelId: "m" },
      });
    const final = await p.waitForTask("task-4", { interval: 1 });
    expect(final.status).toBe("completed");
    expect(statusSpy.mock.calls.length).toBe(3);
  });

  it("status query keeps failing → reports STATUS_UNKNOWN (not task failure) and carries the taskId for recovery", async () => {
    const p = new AtlasCloudProvider(cfg);
    vi.spyOn(p, "getTaskStatus").mockRejectedValue(new ProviderError("network interrupted", "NETWORK_ERROR", "atlas-cloud"));
    try {
      await p.waitForTask("task-5", { interval: 1 });
      expect.unreachable("should throw STATUS_UNKNOWN");
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      expect((e as ProviderError).code).toBe("STATUS_UNKNOWN");
      expect((e as ProviderError).taskId).toBe("task-5");
    }
  });

  it("explicit cloud failure → TASK_FAILED, also carrying the taskId", async () => {
    const p = new AtlasCloudProvider(cfg);
    vi.spyOn(p, "getTaskStatus").mockResolvedValue({ taskId: "task-6", status: "failed", error: "NSFW blocked" });
    try {
      await p.waitForTask("task-6", { interval: 1 });
      expect.unreachable("should throw TASK_FAILED");
    } catch (e) {
      expect((e as ProviderError).code).toBe("TASK_FAILED");
      expect((e as ProviderError).taskId).toBe("task-6");
    }
  });
});
