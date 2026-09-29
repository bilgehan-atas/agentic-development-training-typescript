/**
 * Runs the graph once for a user message and prints each step as it happens.
 * Handles human-in-the-loop interrupts by asking `approve()` and resuming.
 *
 * Two kinds of interrupt can show up:
 *   - `{ question }`        from `requireApproval()` (approval.ts) → resumed with the raw answer
 *   - `{ actionRequests }`  from the travel agent's `humanInTheLoopMiddleware`
 *                           → one question per tool call, resumed with `{ decisions }`
 */
import type { BaseMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import type { Decision, HITLRequest } from "langchain";
import type { buildGraph } from "./graph";

type App = ReturnType<typeof buildGraph>;
type Approver = (question: string) => Promise<string>;
type PendingInterrupt = { id: string; value: unknown };

export interface RunOptions {
  threadId: string;
  approve: Approver;
  log?: (line: string) => void;
}

const isYes = (answer: string) => /^\s*y(es)?\s*$/i.test(answer);

const isHitlRequest = (value: unknown): value is HITLRequest =>
  typeof value === "object" && value !== null && "actionRequests" in value;

/** Asks the human about one interrupt and returns the value to resume it with. */
async function answerInterrupt(value: unknown, approve: Approver): Promise<unknown> {
  if (!isHitlRequest(value)) return approve((value as { question: string }).question);

  const decisions: Decision[] = [];
  for (const action of value.actionRequests) {
    const answer = await approve(`${action.description ?? `Run ${action.name}.`} Approve? (y/n)`);
    decisions.push(
      isYes(answer) ? { type: "approve" } : { type: "reject", message: `The user rejected ${action.name}; it was NOT done.` },
    );
  }
  return { decisions };
}

/** Short description of a node's state update, e.g. `intent=travel`. */
function summarize(update: Record<string, unknown> | null | undefined): string {
  if (!update) return "";
  return Object.entries(update)
    .filter(([key, value]) => key !== "messages" && key !== "user" && value !== undefined)
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(" ");
}

export async function runTurn(app: App, text: string, { threadId, approve, log = console.log }: RunOptions) {
  const config = { configurable: { thread_id: threadId } };
  let input: unknown = { messages: [{ role: "user", content: text }] };
  let finalState: { messages: BaseMessage[] } | undefined;

  while (true) {
    const pending: PendingInterrupt[] = [];
    const stream = await app.stream(input as never, { ...config, streamMode: ["updates", "values"] });
    for await (const [mode, chunk] of stream as AsyncIterable<[string, Record<string, any>]>) {
      if (mode === "values") {
        finalState = chunk as typeof finalState;
        continue;
      }
      for (const [node, update] of Object.entries(chunk)) {
        if (node === "__interrupt__") {
          pending.push(...(update as PendingInterrupt[]));
        } else {
          log(`  → ${node} ${summarize(update)}`.trimEnd());
        }
      }
    }
    if (pending.length === 0) break;

    // Several interrupts can be pending at once: answer each, keyed by its id.
    const resume: Record<string, unknown> = {};
    for (const { id, value } of pending) resume[id] = await answerInterrupt(value, approve);
    input = new Command({ resume });
  }
  return finalState!;
}
