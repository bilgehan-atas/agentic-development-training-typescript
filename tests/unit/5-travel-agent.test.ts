import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { callNode, stateWith, stateWithHistory } from "./helpers";

const fakeLlm = vi.hoisted(() => ({ invoke: vi.fn(), withStructuredOutput: vi.fn() }));
const fakeAgent = vi.hoisted(() => ({ invoke: vi.fn() }));
const createAgent = vi.hoisted(() => vi.fn(() => fakeAgent));
const hitl = vi.hoisted(() => ({ middleware: { name: "HumanInTheLoopMiddleware" }, factory: vi.fn() }));
vi.mock("../../src/llm", () => ({ llm: fakeLlm, MODEL: "fake" }));
vi.mock("langchain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("langchain")>()),
  createAgent,
  humanInTheLoopMiddleware: hitl.factory,
}));

const { travelAgent } = await import("../../src/nodes");
const { travelTools } = await import("../../src/tools");

type AgentConfig = { model: unknown; tools: unknown[]; systemPrompt: string; middleware?: unknown[] };
const agentConfig = () => (createAgent.mock.calls[0] as unknown as [AgentConfig])[0];

describe("TODO 5 — travelAgent (createAgent)", () => {
  beforeEach(() => {
    createAgent.mockClear();
    hitl.factory.mockReset().mockReturnValue(hitl.middleware);
    // What a real agent run returns: the whole loop, final answer last.
    fakeAgent.invoke.mockReset().mockResolvedValue({
      messages: [
        new HumanMessage("Book the cheapest flight on 2026-10-14"),
        new AIMessage({ content: "", tool_calls: [{ id: "1", name: "list_flights", args: {} }] }),
        new ToolMessage({ tool_call_id: "1", content: "[...]" }),
        new AIMessage("Booked IST-FRA-20261014-0800. New balance: 0 EUR."),
      ],
    });
  });

  it("creates an agent with the local LLM and the travel tools", async () => {
    await callNode(travelAgent, stateWith("Book the cheapest flight on 2026-10-14"));

    expect(createAgent).toHaveBeenCalledTimes(1);
    expect(agentConfig().model).toBe(fakeLlm);
    expect(agentConfig().tools).toBe(travelTools);
  });

  it("asks a human before book_flight, change_booking and cancel_pnr (humanInTheLoopMiddleware)", async () => {
    await callNode(travelAgent, stateWith("Book the cheapest flight on 2026-10-14"));

    expect(hitl.factory).toHaveBeenCalledTimes(1);
    const { interruptOn } = (hitl.factory.mock.calls[0] as unknown as [{ interruptOn: Record<string, unknown> }])[0];
    expect(Object.keys(interruptOn)).toEqual(expect.arrayContaining(["book_flight", "change_booking", "cancel_pnr"]));
    expect(interruptOn).not.toHaveProperty("list_flights");
    expect(agentConfig().middleware).toContain(hitl.middleware);
  });

  it("gives the agent the account data and today's date in the system prompt", async () => {
    await callNode(travelAgent, stateWith("Book the cheapest flight on 2026-10-14"));

    expect(agentConfig().systemPrompt).toContain("ABC123"); // describeUser(state.user)
    expect(agentConfig().systemPrompt).toMatch(/Today is/); // todayLine()
  });

  it("invokes the agent with the conversation", async () => {
    await callNode(travelAgent, stateWithHistory("Move it to the evening flight"));

    const input = fakeAgent.invoke.mock.calls[0][0] as { messages: { content: unknown }[] };
    const contents = input.messages.map((m) => m.content);
    expect(contents).toContain("What are my bookings?");
    expect(contents).toContain("Move it to the evening flight");
  });

  it("returns only the agent's final answer", async () => {
    const update = await callNode(travelAgent, stateWith("Book the cheapest flight on 2026-10-14"));

    expect(update.messages).toHaveLength(1);
    expect(String(update.messages![0].content)).toContain("New balance: 0 EUR");
  });
});
