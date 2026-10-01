import { describe, expect, it, vi } from "vitest";
import { withTimeout, PoseError } from "../web/src/pose";

describe("withTimeout", () => {
  it("passes through a fast result", async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, "x")).resolves.toBe(42);
  });
  it("rejects a hanging promise with a stage-tagged error", async () => {
    vi.useFakeTimers();
    const p = withTimeout(new Promise(() => {}), 15_000, "engine-start/GPU");
    const assertion = expect(p).rejects.toMatchObject({ stage: "engine-start/GPU", message: expect.stringContaining("timed out after 15s") });
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    vi.useRealTimers();
  });
  it("tags failures with the stage", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 1000, "model")).rejects.toBeInstanceOf(PoseError);
  });
});
