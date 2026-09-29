import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../../src/api";
import { callNode, promptText, stateWith, stateWithHistory } from "./helpers";

const fakeLlm = vi.hoisted(() => ({ invoke: vi.fn(), withStructuredOutput: vi.fn() }));
const extractor = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("../../src/llm", () => ({ llm: fakeLlm, MODEL: "fake" }));
vi.mock("../../src/approval", () => ({ requireApproval: vi.fn(() => true) }));

const { cancelBooking, confirmCancel } = await import("../../src/nodes");
const { requireApproval } = await import("../../src/approval");

beforeEach(() => {
  vi.restoreAllMocks();
  fakeLlm.withStructuredOutput.mockReset().mockReturnValue(extractor);
  extractor.invoke.mockReset().mockResolvedValue({ pnrCode: " abc123 " });
  vi.mocked(requireApproval).mockReset().mockReturnValue(true);
});

describe("TODO 3 (part 1) — cancelBooking: the LLM picks the PNR", () => {
  it("extracts the PNR with structured output and stores it in state.pnrCode", async () => {
    const update = await callNode(cancelBooking, stateWith("Please cancel my October 22 flight"));

    expect(fakeLlm.withStructuredOutput).toHaveBeenCalled();
    expect(promptText(extractor.invoke.mock.calls[0][0])).toContain("ABC123"); // bookings are in the prompt
    expect(update.pnrCode).toBe("ABC123"); // trimmed + upper-cased
  });

  it("sends the earlier conversation too (\"cancel it\")", async () => {
    await callNode(cancelBooking, stateWithHistory("Cancel it please"));

    const prompt = promptText(extractor.invoke.mock.calls[0][0]);
    expect(prompt).toContain("What are my bookings?");
    expect(prompt).toContain("Cancel it please");
  });

  it("does NOT ask for approval or cancel (that is confirm_cancel's job)", async () => {
    const cancel = vi.spyOn(api, "cancel");

    await callNode(cancelBooking, stateWith("cancel ABC123"));

    expect(requireApproval).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });
});

describe("TODO 3 (part 2) — confirmCancel: ask, then cancel", () => {
  it("asks for approval, calls api.cancel and reports refund + balance", async () => {
    const cancel = vi.spyOn(api, "cancel").mockResolvedValue({ refund: 80, balance: 180, pnr: {} as never });

    const update = await callNode(confirmCancel, stateWith("cancel my flight", { pnrCode: "ABC123" }));

    expect(requireApproval).toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledWith("ABC123");
    const answer = String(update.messages![0].content);
    expect(answer).toContain("80");
    expect(answer).toContain("180");
  });

  it("does not call the LLM (it is re-run when the approval resumes)", async () => {
    vi.spyOn(api, "cancel").mockResolvedValue({ refund: 80, balance: 180, pnr: {} as never });

    await callNode(confirmCancel, stateWith("cancel my flight", { pnrCode: "ABC123" }));

    expect(fakeLlm.invoke).not.toHaveBeenCalled();
    expect(fakeLlm.withStructuredOutput).not.toHaveBeenCalled();
  });

  it("does not cancel when the user rejects", async () => {
    vi.mocked(requireApproval).mockReturnValue(false);
    const cancel = vi.spyOn(api, "cancel");

    const update = await callNode(confirmCancel, stateWith("cancel ABC123", { pnrCode: "ABC123" }));

    expect(cancel).not.toHaveBeenCalled();
    expect(update.messages).toHaveLength(1);
  });

  it("asks which booking when no PNR was found", async () => {
    const cancel = vi.spyOn(api, "cancel");

    const update = await callNode(confirmCancel, stateWith("cancel my flight", { pnrCode: "" }));

    expect(cancel).not.toHaveBeenCalled();
    expect(requireApproval).not.toHaveBeenCalled();
    expect(String(update.messages![0].content)).toMatch(/which/i);
  });

  it("reports API errors to the user instead of crashing", async () => {
    vi.spyOn(api, "cancel").mockRejectedValue(new ApiError(400, "PNR is not active"));

    const update = await callNode(confirmCancel, stateWith("cancel ABC123", { pnrCode: "ABC123" }));

    expect(String(update.messages![0].content)).toContain("PNR is not active");
  });
});
