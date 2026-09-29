import { Command, END, INTERRUPT, isInterrupted, MemorySaver, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { requireApproval } from "../../src/approval";
import { buildGraph } from "../../src/graph";

/** A tiny graph with a single node that asks for approval. */
function approvalGraph() {
  const State = new StateSchema({ approved: z.boolean().optional() });
  return new StateGraph(State)
    .addNode("ask", () => ({ approved: requireApproval("Cancel booking ABC123.") }))
    .addEdge(START, "ask")
    .addEdge("ask", END)
    .compile({ checkpointer: new MemorySaver() });
}

describe("TODO 4 — human-in-the-loop approval", () => {
  it("requireApproval pauses the graph with an interrupt", async () => {
    const graph = approvalGraph();
    const config = { configurable: { thread_id: "t1" } };

    const paused = await graph.invoke({}, config);

    expect(isInterrupted(paused)).toBe(true);
    if (!isInterrupted(paused)) return;
    expect(paused[INTERRUPT]).toHaveLength(1);
    expect(JSON.stringify(paused[INTERRUPT][0].value)).toContain("ABC123");
  });

  it.each([
    ["y", true],
    ["yes", true],
    ["n", false],
    ["no way", false],
  ])("resuming with %j → approved=%s", async (answer, approved) => {
    const graph = approvalGraph();
    const config = { configurable: { thread_id: `t-${answer}` } };

    await graph.invoke({}, config);
    const result = await graph.invoke(new Command({ resume: answer }), config);

    expect(result.approved).toBe(approved);
  });

  it("the flight graph is compiled with a checkpointer", () => {
    expect(buildGraph().checkpointer).toBeTruthy();
  });
});
