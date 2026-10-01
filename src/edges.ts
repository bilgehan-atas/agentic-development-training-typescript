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

// ✅ TODO 1 (solved)
export function routeByIntent(
  state: State,
): "answer_info" | "cancel_booking" | "travel_agent" | "ask_clarification" {
  switch (state.intent) {
    case "info":
      return "answer_info";
    case "cancel":
      return "cancel_booking";
    case "travel":
      return "travel_agent";
    default:
      return "ask_clarification";
  }
}
