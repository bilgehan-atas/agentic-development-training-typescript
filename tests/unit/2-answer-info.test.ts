import { AIMessage } from "@langchain/core/messages";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { callNode, promptText, stateWith, stateWithHistory } from "./helpers";

const fakeLlm = vi.hoisted(() => ({ invoke: vi.fn(), withStructuredOutput: vi.fn() }));
vi.mock("../../src/llm", () => ({ llm: fakeLlm, MODEL: "fake" }));

const { answerInfo } = await import("../../src/nodes");

describe("TODO 2 — answerInfo (plain llm.invoke)", () => {
  beforeEach(() => {
    fakeLlm.invoke.mockReset().mockResolvedValue(new AIMessage("Your balance is 100 EUR."));
  });

  it("calls llm.invoke once and appends its answer to messages", async () => {
    const update = await callNode(answerInfo, stateWith("What is my balance?"));

    expect(fakeLlm.invoke).toHaveBeenCalledTimes(1);
    expect(update.messages).toHaveLength(1);
    expect(String(update.messages![0].content)).toContain("100 EUR");
  });

  it("puts the account data and the user's question into the prompt", async () => {
    await callNode(answerInfo, stateWith("What is my balance?"));

    const prompt = promptText(fakeLlm.invoke.mock.calls[0][0]);
    expect(prompt).toContain("ABC123"); // from describeUser(state.user)
    expect(prompt).toContain("What is my balance?");
  });

  it("sends the earlier conversation too (follow-up questions)", async () => {
    await callNode(answerInfo, stateWithHistory("How much did I pay for it?"));

    const prompt = promptText(fakeLlm.invoke.mock.calls[0][0]);
    expect(prompt).toContain("What are my bookings?");
    expect(prompt).toContain("How much did I pay for it?");
  });
});
