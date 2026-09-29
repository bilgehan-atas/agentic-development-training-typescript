import { describe, expect, it } from "vitest";
import { routeAfterLoad, routeByIntent } from "../../src/edges";
import type { State } from "../../src/state";

const state = (s: Partial<State>) => s as State;

describe("routeAfterLoad (given)", () => {
  it("goes to classify_intent when the account was loaded", () => {
    expect(routeAfterLoad(state({}))).toBe("classify_intent");
  });
  it("goes to report_error when loading failed", () => {
    expect(routeAfterLoad(state({ error: "server down" }))).toBe("report_error");
  });
});

describe("TODO 1 — routeByIntent", () => {
  it.each([
    ["info", "answer_info"],
    ["cancel", "cancel_booking"],
    ["travel", "travel_agent"],
    ["unclear", "ask_clarification"],
  ] as const)("routes intent=%s to %s", (intent, node) => {
    expect(routeByIntent(state({ intent }))).toBe(node);
  });

  it("falls back to ask_clarification when there is no intent", () => {
    expect(routeByIntent(state({}))).toBe("ask_clarification");
  });
});
