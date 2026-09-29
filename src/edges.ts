/**
 * EDGE ROUTING FUNCTIONS (used by conditional edges in graph.ts).
 *
 * A routing function looks at the state and returns the NAME of the next
 * node. It must not change the state — it only decides where to go.
 */
import type { State } from "./state";

// ✅ GIVEN — example conditional edge: stop early if the server is down.
export function routeAfterLoad(state: State): "classify_intent" | "report_error" {
  return state.error ? "report_error" : "classify_intent";
}

// 🔲 TODO 1 — the routing function for the conditional edge after `classify_intent`.
//
// `classify_intent` stores one of "info" | "cancel" | "travel" | "unclear" in
// `state.intent`. Return the node that should handle it:
//
//   info    → "answer_info"
//   cancel  → "cancel_booking"
//   travel  → "travel_agent"
//   unclear → "ask_clarification"   (also use this when `intent` is missing)
//
// 👀 Look at `routeAfterLoad` above for the pattern.
// ✅ Check: npx vitest run tests/unit/1-
export function routeByIntent(
  state: State,
): "answer_info" | "cancel_booking" | "travel_agent" | "ask_clarification" {
  throw new Error("TODO 1: implement routeByIntent in src/edges.ts");
}
