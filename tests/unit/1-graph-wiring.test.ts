import { describe, expect, it } from "vitest";
import { buildGraph } from "../../src/graph";

describe("TODO 1 — graph wiring", () => {
  it("classify_intent has a conditional edge to each intent node", async () => {
    const graph = await buildGraph().getGraphAsync();
    const targets = graph.edges
      .filter((e) => e.source === "classify_intent")
      .map((e) => ({ target: e.target, conditional: e.conditional }));

    for (const target of ["answer_info", "cancel_booking", "travel_agent", "ask_clarification"]) {
      expect(targets).toContainEqual({ target, conditional: true });
    }
  });

  it("cancel_booking → confirm_cancel → END, the other intent nodes → END", async () => {
    const graph = await buildGraph().getGraphAsync();
    const edges = graph.edges.map((e) => `${e.source}->${e.target}`);

    expect(edges).toContain("cancel_booking->confirm_cancel");
    for (const node of ["answer_info", "confirm_cancel", "travel_agent"]) {
      expect(edges).toContain(`${node}->__end__`);
    }
  });
});
