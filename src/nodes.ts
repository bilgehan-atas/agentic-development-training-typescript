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
// ✅ TODO 2 (solved) — plain LLM invocation: `llm.invoke(messages)`.
//
// Answers questions about the account ("What's my balance?", "Which bookings
// do I have?") using ONLY the data loaded by `loadContext`. No tools needed:
// everything the model needs is already in the prompt.
// ─────────────────────────────────────────────────────────────────────────────
export const answerInfo: Node = async (state) => {
  const response = await llm.invoke([
    new SystemMessage(
      `You are a helpful airline assistant. ${todayLine()}\n` +
        `Answer the user's latest question briefly, using ONLY this account data:\n\n${describeUser(state.user)}`,
    ),
    ...state.messages,
  ]);
  return { messages: [response] };
};

// ─────────────────────────────────────────────────────────────────────────────
// ✅ TODO 3 (solved) — a fixed WORKFLOW of two nodes: the LLM fills in one blank,
// code does the rest.
//
//   cancel_booking  LLM with structured output → which PNR does the user mean?
//   confirm_cancel  Code → ask for approval, call POST /cancel, format the answer.
//
// Two nodes, because on resume LangGraph re-runs the paused node from its first
// line: the LLM call must not be in the node that calls `requireApproval()`,
// or it could pick a different booking than the one the user approved.
//
// Compare with `travelAgent` below, where the LLM decides the steps itself.
// ─────────────────────────────────────────────────────────────────────────────
export const cancelBooking: Node = async (state) => {
  const extractor = llm.withStructuredOutput(
    z.object({
      pnrCode: z.string().describe("The 6-character booking code to cancel, or an empty string if unclear"),
    }),
  );
  const { pnrCode } = await extractor.invoke([
    new SystemMessage(
      `Find the booking the user wants to cancel in their latest message. ${todayLine()}\n` +
        `The user's bookings:\n${describeUser(state.user)}`,
    ),
    ...state.messages,
  ]);
  return { pnrCode: pnrCode.trim().toUpperCase() };
};

export const confirmCancel: Node = async (state) => {
  const code = state.pnrCode;
  if (!code) return reply("Which booking would you like to cancel? Please give me its PNR code.");

  if (!requireApproval(`Cancel booking ${code}.`)) return reply(`OK, booking ${code} was NOT cancelled.`);

  try {
    const { refund, balance } = await api.cancel(code);
    return reply(`Booking ${code} is cancelled. Refund: ${refund} EUR. New balance: ${balance} EUR.`);
  } catch (err) {
    if (err instanceof ApiError) return reply(`Could not cancel ${code}: ${err.message}.`);
    throw err;
  }
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
