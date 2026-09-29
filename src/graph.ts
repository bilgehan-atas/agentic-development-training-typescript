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
import { END, START, StateGraph } from "@langchain/langgraph";
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

    // 🔲 TODO 1 — make the graph branch on the user's intent.
    //   a) Register 4 more NODES with .addNode(name, fn):
    //        "answer_info" → answerInfo, "cancel_booking" → cancelBooking,
    //        "confirm_cancel" → confirmCancel, "travel_agent" → travelAgent
    //        (all imported above)
    //   b) Replace the plain edge below with a CONDITIONAL EDGE from
    //      "classify_intent" that calls `routeByIntent` (src/edges.ts) and can
    //      go to: "answer_info", "cancel_booking", "travel_agent", "ask_clarification".
    //      👀 Copy the `load_context` conditional edge above.
    //   c) Add plain EDGES with .addEdge(...):
    //        "cancel_booking" → "confirm_cancel"   (a 2-step workflow, see TODO 3)
    //        "answer_info", "confirm_cancel", "travel_agent" → END
    //
    // Right now every request ends up in ask_clarification. LangGraph refuses
    // to compile a graph with unreachable nodes — that's why these nodes are
    // not registered yet. Run `npm run graph` before and after!
    // ✅ Check: npx vitest run tests/unit/1-
    .addEdge("classify_intent", "ask_clarification");

  // 🔲 TODO 4 — `interrupt()` needs a CHECKPOINTER: it saves the state after
  // every step so a paused run can be resumed later (same `thread_id`).
  // Pass `{ checkpointer: new MemorySaver() }` to compile().
  return builder.compile();
}
