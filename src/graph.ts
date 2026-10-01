/**
 * GRAPH ASSEMBLY: nodes + edges + conditional edges.
 *
 *   .addNode(name, fn)                          a NODE (a step; see nodes.ts)
 *   .addEdge(from, to)                          an EDGE: after `from`, ALWAYS go to `to`
 *   .addConditionalEdges(from, router, [...])   a CONDITIONAL EDGE: after `from`,
 *                                               call `router(state)` to pick the next node
 *
 * START and END are special built-in nodes: where a run begins and finishes.
 *
 * Print the graph as a Mermaid diagram with `npm run graph`.
 */
import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { routeAfterLoad, routeByIntent } from "./edges";
import {
  answerInfo,
  askClarification,
  cancelBooking,
  classifyIntent,
  confirmCancel,
  loadContext,
  reportError,
  travelAgent,
} from "./nodes";
import { AgentState } from "./state";

export function buildGraph() {
  const builder = new StateGraph(AgentState)
    .addNode("load_context", loadContext)
    .addNode("report_error", reportError)
    .addNode("classify_intent", classifyIntent)
    .addNode("ask_clarification", askClarification)

    .addEdge(START, "load_context")

    // ✅ GIVEN — example conditional edge
    .addConditionalEdges("load_context", routeAfterLoad, ["classify_intent", "report_error"])

    .addEdge("report_error", END)
    .addEdge("ask_clarification", END)

    // ✅ TODO 1 (solved)
    .addNode("answer_info", answerInfo)
    .addNode("cancel_booking", cancelBooking)
    .addNode("confirm_cancel", confirmCancel)
    .addNode("travel_agent", travelAgent)
    .addConditionalEdges("classify_intent", routeByIntent, [
      "answer_info",
      "cancel_booking",
      "travel_agent",
      "ask_clarification",
    ])
    .addEdge("cancel_booking", "confirm_cancel")
    .addEdge("answer_info", END)
    .addEdge("confirm_cancel", END)
    .addEdge("travel_agent", END);

  // ✅ TODO 4 (solved) — a checkpointer saves the state after every step, which
  // is what lets `interrupt()` pause the graph and resume it later, and what
  // keeps the conversation of a thread between turns.
  return builder.compile({ checkpointer: new MemorySaver() });
}
