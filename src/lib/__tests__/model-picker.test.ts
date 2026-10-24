import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelPicker } from "@/components/settings/model-picker";

vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key }));
let root: Root;
let container: HTMLDivElement;
const fetchMock = vi.fn();
const pick = vi.fn();
const reply = (models: unknown[], status = 200) => new Response(JSON.stringify({ ok: true, models }), { status });
async function render(baseUrl = "http://service-a/v1", apiKey = "test-a") {
  await act(async () => root.render(createElement(ModelPicker, { baseUrl, apiKey, onPick: pick })));
}
async function load() { await act(async () => container.querySelector("button")!.click()); }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset(); pick.mockReset();
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove(); vi.unstubAllGlobals();
});

describe("model catalog config isolation", () => {
  it("switching the address or key clears the old catalog immediately; returning to the old config must not reuse it either", async () => {
    fetchMock.mockResolvedValue(reply(["model-a", "model-a", 7, null]));
    await render(); await load();
    expect(container.querySelectorAll("button")).toHaveLength(2);
    await act(async () => (container.querySelectorAll("button")[1] as HTMLButtonElement).click());
    expect(pick).toHaveBeenCalledWith("model-a");
    await render("http://service-a/v1", "test-b");
    expect(container.textContent).not.toContain("model-a");
    await load();
    await render("http://service-b/v1", "test-b");
    expect(container.textContent).not.toContain("model-a");
    await render();
    expect(container.textContent).not.toContain("model-a");
  });

  it("a slow old catalog response is cancelled after a config switch and cannot overwrite the new catalog even if late", async () => {
    let finish!: (response: Response) => void;
    let signal!: AbortSignal;
    fetchMock.mockImplementationOnce((_url, options) => { signal = options.signal; return new Promise((resolve) => { finish = resolve; }); });
    await render(); await load();
    await render("http://service-b/v1", "test-b");
    expect(signal.aborted).toBe(true);
    fetchMock.mockResolvedValueOnce(reply(["model-b"]));
    await load();
    await act(async () => finish(reply(["model-a"])));
    expect(container.textContent).toContain("model-b");
    expect(container.textContent).not.toContain("model-a");
  });

  it("error responses show no selectable models; they return after a successful retry", async () => {
    fetchMock.mockResolvedValueOnce(reply(["unavailable-model"], 503));
    await render(); await load();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("modelListFailed");
    expect(container.textContent).not.toContain("unavailable-model");
    fetchMock.mockResolvedValueOnce(reply(["available-model"]));
    await load();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain("available-model");
  });
});
