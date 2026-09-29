import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../../src/api";

const { travelTools, cancelPnrTool, interruptOn } = await import("../../src/tools");

const invokeTool = (input: object) => (cancelPnrTool as unknown as { invoke(i: object): Promise<unknown> }).invoke(input);

describe("TODO 5 — cancel_pnr tool", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("is named cancel_pnr, has a description and a pnrCode input", () => {
    expect(cancelPnrTool.name).toBe("cancel_pnr");
    expect(cancelPnrTool.description.length).toBeGreaterThan(20);
    expect(() => (cancelPnrTool.schema as { parse: (v: unknown) => unknown }).parse({ pnrCode: "ABC123" })).not.toThrow();
  });

  it("is given to the travel agent", () => {
    expect(travelTools.map((t) => t.name)).toContain("cancel_pnr");
  });

  it("needs a human's approval (has a rule in interruptOn)", () => {
    expect(interruptOn.cancel_pnr).toBeTruthy();
    expect(interruptOn.cancel_pnr.allowedDecisions).toContain("reject");
  });

  it("calls api.cancel and returns the result as text for the LLM", async () => {
    const cancel = vi.spyOn(api, "cancel").mockResolvedValue({ refund: 80, balance: 180, pnr: {} as never });

    const output = await invokeTool({ pnrCode: "ABC123" });

    expect(cancel).toHaveBeenCalledWith("ABC123");
    expect(String(output)).toContain("180");
  });

  it("returns API errors as text (so the LLM can react) instead of throwing", async () => {
    vi.spyOn(api, "cancel").mockRejectedValue(new ApiError(404, "PNR not found"));

    const output = await invokeTool({ pnrCode: "NOPE00" });

    expect(String(output)).toContain("PNR not found");
  });
});
