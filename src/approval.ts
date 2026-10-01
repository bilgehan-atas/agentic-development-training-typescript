/**
 * Human-in-the-loop approval for actions that move money.
 *
 * Called by the `confirm_cancel` node right before it hits the flight server.
 * (The travel agent's tools are guarded by `humanInTheLoopMiddleware` instead,
 * see `interruptOn` in tools.ts — same `interrupt()` mechanism under the hood.)
 */
import { interrupt } from "@langchain/langgraph";

/**
 * Ask a human whether `action` may proceed. Returns true if approved.
 *
 * `interrupt(payload)` PAUSES the graph: the payload is returned to the caller
 * under `result.__interrupt__`, and the graph waits. The caller resumes with
 * `graph.invoke(new Command({ resume: "y" }), sameConfig)` and that resume
 * value becomes the return value of `interrupt()`.
 *
 * Needs a checkpointer on the compiled graph (see graph.ts) so the paused
 * state can be saved and restored.
 *
 * ⚠️ On resume, LangGraph re-runs the WHOLE node that called `interrupt()`, from
 * its first line. So everything a node does before asking must be safe to repeat:
 * no LLM calls (they may answer differently the second time), no API calls.
 * That's why cancelling is split into `cancel_booking` (LLM) → `confirm_cancel` (ask + act).
 */
export function requireApproval(action: string): boolean {
  const answer = interrupt({ question: `${action} Approve? (y/n)` });
  return answer === true || /^\s*y(es)?\s*$/i.test(String(answer));
}
