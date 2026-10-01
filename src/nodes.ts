/**
 * NODES: the steps of the graph.
 *
 * A node is just an (async) function:  (state) => partial state update.
 * LangGraph merges the returned object into the shared state (see state.ts).
 *
 * This file shows three flavours of node:
 *   1. Plain code, no LLM                  → loadContext, reportError, askClarification, confirmCancel
 *   2. A single, direct LLM call           → classifyIntent, answerInfo, cancelBooking
 *      (YOU decide the steps; the LLM fills in one blank)
 *   3. An agent built with `createAgent`   → travelAgent
 *      (the LLM decides the steps: which tools to call, how often, in which order)
 *
 * `state.messages` is the whole conversation of the thread (all earlier turns
 * too), so pass it to the LLM: then follow-ups like "cancel it" make sense.
 */
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import type { GraphNode } from "@langchain/langgraph";
import { createAgent, humanInTheLoopMiddleware } from "langchain";
import { z } from "zod";
import { api, ApiError, apiUrl } from "./api";
import { requireApproval } from "./approval";
import { describeUser, todayLine } from "./context";
import { llm } from "./llm";
import { AgentState, Intent, type State } from "./state";
import { interruptOn, travelTools } from "./tools";

type Node = GraphNode<typeof AgentState>;

const reply = (text: string) => ({ messages: [new AIMessage(text)] });

// ─────────────────────────────────────────────────────────────────────────────
// ✅ GIVEN — plain-code node (no LLM at all).
// Fetches the account from the server and puts it into the state.
// ─────────────────────────────────────────────────────────────────────────────
export const loadContext: Node = async () => {
  try {
    // `error: undefined` clears an error left in the thread by an earlier turn.
    return { user: await api.getUser(), error: undefined };
  } catch (err) {
    return { error: `Could not load your account from ${apiUrl()} (${(err as Error).message}). Is the server running?` };
  }
};

// ✅ GIVEN — plain-code node.
export const reportError: Node = (state) => reply(`Sorry, something went wrong: ${state.error}`);

// ✅ GIVEN — plain-code node.
export const askClarification: Node = () =>
  reply(
    "Sorry, I'm not sure what you need. I can:\n" +
      "  • show your bookings and balance      (\"What are my bookings?\")\n" +
      "  • cancel a booking                    (\"Cancel ABC123\")\n" +
      "  • search, book or change flights      (\"Move ABC123 to the cheapest flight on Oct 25\")",
  );

// ─────────────────────────────────────────────────────────────────────────────
// ✅ GIVEN — direct LLM call with STRUCTURED OUTPUT.
//
// `llm.withStructuredOutput(zodSchema)` makes the model answer with JSON that
// matches the schema, and parses it for you. Perfect when the LLM's answer is
// used by CODE (here: by the routing function in edges.ts), not by a human.
// ─────────────────────────────────────────────────────────────────────────────
const CLASSIFY_PROMPT = `You classify requests sent to an airline assistant. Pick exactly one intent:
- "info":    questions about the user's own account: balance, bookings, PNRs, what they paid, fees.
- "cancel":  cancel an existing booking WITHOUT booking anything else.
- "travel":  anything that needs the flight schedule: search flights or prices, book a new flight,
             change/move/rebook an existing booking to another flight.
- "unclear": greetings, unrelated or ambiguous requests.
Classify the user's LATEST message. Earlier messages are only context
(e.g. "cancel it" right after talking about a booking is "cancel").`;

export const classifyIntent: Node = async (state) => {
  const classifier = llm.withStructuredOutput(z.object({ intent: Intent }));
  const { intent } = await classifier.invoke([new SystemMessage(CLASSIFY_PROMPT), ...state.messages]);
  return { intent };
};

// ─────────────────────────────────────────────────────────────────────────────
// 🔲 TODO 2 — plain LLM invocation: `llm.invoke(messages)`.
//
// Answer questions about the account ("What's my balance?", "Which bookings
// do I have?") using ONLY the data loaded by `loadContext`. No tools needed:
// everything the model needs can be put into the prompt.
//
// Steps:
//   1. Build a SystemMessage that tells the model it is an airline assistant
//      and gives it the account data: `describeUser(state.user)`.
//      (Adding `todayLine()` helps with questions like "my next flight".)
//   2. `await llm.invoke([systemMessage, ...state.messages])`
//      (the whole conversation, so follow-up questions work) → returns an AIMessage.
//   3. Return `{ messages: [thatAIMessage] }` — the reducer APPENDS it.
//
// 👀 `classifyIntent` above does almost the same (but with structured output).
// ✅ Check: npx vitest run tests/unit/2-
//    Try:   npm start -- "What is my balance and which bookings do I have?"
// ─────────────────────────────────────────────────────────────────────────────
export const answerInfo: Node = async (state) => {
  return reply("TODO 2: implement answerInfo in src/nodes.ts");
};

// ─────────────────────────────────────────────────────────────────────────────
// 🔲 TODO 3 — a fixed WORKFLOW of two nodes: the LLM fills in one blank, code does the rest.
//
//   cancel_booking  (part 1)  LLM with structured output → which PNR does the user mean?
//                             Stores it in `state.pnrCode`. Nothing else!
//   confirm_cancel  (part 2)  Code → ask for approval, call POST /cancel, format the answer.
//
// Why two nodes? `requireApproval()` pauses the graph, and on resume LangGraph
// re-runs the paused node FROM ITS FIRST LINE. If the LLM call were in the same
// node, it would run again — and could pick a different booking than the one the
// user just approved. Code before an interrupt must be safe to repeat.
//
// Compare with `travelAgent` below, where the LLM decides the steps itself.
//
// Part 1 — cancelBooking:
//   1. Create an extractor: `llm.withStructuredOutput(z.object({ pnrCode: z.string().describe(...) }))`
//      Tell it (in `.describe`) to return an empty string when it is unclear.
//   2. Invoke it with a SystemMessage containing `describeUser(state.user)` — so
//      "cancel my Oct 22 flight" can be mapped to a code — followed by `...state.messages`.
//   3. Return `{ pnrCode }`, trimmed + upper-cased (it may be "").
//
// Part 2 — confirmCancel (reads `state.pnrCode`; no LLM here!):
//   1. If the code is empty, `return reply("Which booking…?")`.
//   2. If !requireApproval(`Cancel booking ${code}.`) → reply that nothing was cancelled.
//      (It auto-approves until you do TODO 4.)
//   3. `await api.cancel(code)` → reply with the refund and the new balance.
//      Catch `ApiError` (e.g. "PNR is not active") and reply with its message.
//
// 👀 `classifyIntent` (structured output), `loadContext` (API call + try/catch),
//    `askClarification` (the `reply()` helper).
// ✅ Check: npx vitest run tests/unit/3-
//    Try:   npm start -- "Please cancel my booking ABC123"
// ─────────────────────────────────────────────────────────────────────────────
export const cancelBooking: Node = async (state) => {
  return { pnrCode: "" }; // TODO 3 (part 1): implement cancelBooking in src/nodes.ts
};

export const confirmCancel: Node = async (state) => {
  return reply("TODO 3: implement cancelBooking and confirmCancel in src/nodes.ts");
};

// ─────────────────────────────────────────────────────────────────────────────
// ✅ TODO 5 (solved) — an AGENT built with LangChain's `createAgent`.
//
// `createAgent` runs a loop:  LLM → (tool calls → tool results → LLM)* → answer.
// We don't hard-code the steps. For "move ABC123 to the cheapest flight next
// week" the model decides to call list_flights, compare prices, then call
// change_booking, and finally explains what it did.
//
// `humanInTheLoopMiddleware` pauses after the LLM picked its tool calls and
// BEFORE any of them runs, asking about each money-moving one (`interruptOn`).
//
// Note: `createAgent` itself returns a compiled LangGraph graph — we are using
// a graph as a single node inside our own graph.
// ─────────────────────────────────────────────────────────────────────────────
export const travelAgent: Node = async (state) => {
  const agent = createAgent({
    model: llm,
    tools: travelTools,
    middleware: [humanInTheLoopMiddleware({ interruptOn })],
    systemPrompt:
      `You are an airline assistant for IST->FRA flights. ${todayLine()}\n` +
      `Flights depart daily at 08:00 and 20:00. Prices are in EUR and change with the date.\n\n` +
      `The user's account:\n${describeUser(state.user)}\n\n` +
      `Handle the user's latest message. Use the tools to look up flights and to book, change or cancel. ` +
      `Never invent flight ids — always get them from list_flights. When the request is clear, perform the ` +
      `action right away (don't ask for confirmation, the system does that). When done, briefly tell the user ` +
      `what you did and the new balance.`,
  });

  const result = await agent.invoke({ messages: state.messages });
  return { messages: [result.messages.at(-1)!] };
};
