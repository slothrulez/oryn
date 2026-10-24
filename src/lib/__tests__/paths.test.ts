import { describe, it, expect, afterEach } from "vitest";
import { join } from "path";
import { getDataDir, getMigrationsDir, getUploadsDir, getOutputDir, fileNameOf } from "@/lib/paths";

const origData = process.env.APP_DATA_DIR;
const origMig = process.env.APP_MIGRATIONS_DIR;

afterEach(() => {
  if (origData === undefined) delete process.env.APP_DATA_DIR;
  else process.env.APP_DATA_DIR = origData;
  if (origMig === undefined) delete process.env.APP_MIGRATIONS_DIR;
  else process.env.APP_MIGRATIONS_DIR = origMig;
});

describe("paths runtime path resolution", () => {
  it("without injected environment variables falls back to cwd/data (dev behavior unchanged)", () => {
    delete process.env.APP_DATA_DIR;
    expect(getDataDir()).toBe(join(process.cwd(), "data"));
    expect(getUploadsDir()).toBe(join(process.cwd(), "data", "uploads"));
    expect(getOutputDir()).toBe(join(process.cwd(), "data", "output"));
  });

  it("with APP_DATA_DIR injected all writable paths move there (key for Electron packaging)", () => {
    process.env.APP_DATA_DIR = "/tmp/oryn-userdata";
    expect(getDataDir()).toBe("/tmp/oryn-userdata");
    expect(getUploadsDir()).toBe("/tmp/oryn-userdata/uploads");
    expect(getOutputDir()).toBe("/tmp/oryn-userdata/output");
  });

  it("the migrations directory can be injected separately (read-only resources separated from writable data)", () => {
    delete process.env.APP_MIGRATIONS_DIR;
    expect(getMigrationsDir()).toBe(join(process.cwd(), "drizzle"));
    process.env.APP_MIGRATIONS_DIR = "/res/drizzle";
    expect(getMigrationsDir()).toBe("/res/drizzle");
  });
});

// issue #15: Windows-written DB rows carry backslash absolute paths; a plain split("/")
// returned the whole path and produced broken /api/output URLs (404 on playback/download)
describe("fileNameOf", () => {
  it("extracts the file name from a Windows absolute path", () => {
    expect(fileNameOf("D:\\oryn\\data\\output\\proj-1\\final_123.mp4")).toBe("final_123.mp4");
  });

  it("extracts the file name from POSIX absolute and relative paths", () => {
    expect(fileNameOf("/Users/me/data/output/proj-1/final_123.mp4")).toBe("final_123.mp4");
    expect(fileNameOf("output/proj-1/final_123.mp4")).toBe("final_123.mp4");
  });

  it("handles mixed separators (forward-slash Windows paths)", () => {
    expect(fileNameOf("D:/oryn\\data/output\\final.mp4")).toBe("final.mp4");
  });

  it("returns a bare file name unchanged", () => {
    expect(fileNameOf("final_123.mp4")).toBe("final_123.mp4");
  });

  it("returns empty string for null/undefined/empty input", () => {
    expect(fileNameOf(null)).toBe("");
    expect(fileNameOf(undefined)).toBe("");
    expect(fileNameOf("")).toBe("");
  });
});
