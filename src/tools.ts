/**
 * TOOLS for the travel agent (see `travelAgent` in nodes.ts).
 *
 * A tool = a function + a name + a description + an input schema.
 * The LLM never runs code itself: it only reads the name/description/schema
 * and replies "please call list_flights with {from, to}". `createAgent` then
 * runs the function and feeds the result back to the LLM.
 *
 * => Write descriptions for the LLM, not for humans!
 *
 * The tools that move money do NOT ask for approval themselves: the agent's
 * `humanInTheLoopMiddleware` pauses BEFORE running them (see `interruptOn` below).
 */
import { tool } from "@langchain/core/tools";
import type { InterruptOnConfig } from "langchain";
import { z } from "zod";
import { api, ApiError } from "./api";
import { weekdayOf } from "./context";

/** Tools return text to the LLM — including errors, so it can react to them. */
async function run(action: () => Promise<unknown>): Promise<string> {
  try {
    return JSON.stringify(await action());
  } catch (err) {
    if (err instanceof ApiError) return `Error ${err.status}: ${err.message}`;
    throw err;
  }
}

// ✅ GIVEN
export const listFlightsTool = tool(
  async ({ from, to }) =>
    run(async () => {
      const flights = await api.listFlights(from, to);
      return flights.map((f) => ({ id: f.id, day: weekdayOf(f.date), date: f.date, time: f.time, price: f.price }));
    }),
  {
    name: "list_flights",
    description:
      "List IST->FRA flights with their current price (EUR) between two dates (inclusive). " +
      "Use it to find flight ids and compare prices. Keep the range small (max ~14 days).",
    schema: z.object({
      from: z.string().describe("First date, YYYY-MM-DD"),
      to: z.string().describe("Last date, YYYY-MM-DD"),
    }),
  },
);

// ✅ GIVEN
export const bookFlightTool = tool(
  async ({ flightId }) => run(() => api.book(flightId)),
  {
    name: "book_flight",
    description:
      "Book a NEW ticket on a flight. The current price is charged from the user's balance. " +
      "Do NOT use this to move an existing booking — use change_booking for that.",
    schema: z.object({
      flightId: z.string().describe("Flight id from list_flights, e.g. IST-FRA-20261015-0800"),
    }),
  },
);

// ✅ GIVEN
export const changeBookingTool = tool(
  async ({ pnrCode, newFlightId }) => run(() => api.change(pnrCode, newFlightId)),
  {
    name: "change_booking",
    description:
      "Move an existing ACTIVE booking (PNR) to another flight. The old ticket is refunded " +
      "(paid price minus cancellation fee) and the new flight's current price is charged.",
    schema: z.object({
      pnrCode: z.string().describe("6-character booking code, e.g. ABC123"),
      newFlightId: z.string().describe("Flight id from list_flights"),
    }),
  },
);

// ✅ TODO 5 (solved)
export const cancelPnrTool = tool(async ({ pnrCode }) => run(() => api.cancel(pnrCode)), {
  name: "cancel_pnr",
  description:
    "Cancel an existing ACTIVE booking (PNR). Refunds the paid price minus the cancellation " +
    "fee to the user's balance. Use it only when the user wants to cancel without rebooking.",
  schema: z.object({
    pnrCode: z.string().describe("6-character booking code, e.g. ABC123"),
  }),
});

export const travelTools = [listFlightsTool, bookFlightTool, changeBookingTool, cancelPnrTool];

// ✅ GIVEN (+ the cancel_pnr rule: TODO 5 solved) — which tool calls need a human's OK.
//
// Passed to `humanInTheLoopMiddleware({ interruptOn })` in `travelAgent`. When the
// LLM asks for one of these tools, the middleware calls `interrupt()` BEFORE the
// tool runs, with ALL such tool calls of that step in one request, so every
// action is shown and approved (or rejected) separately. Tools not listed here
// (list_flights) run without asking. `description` is the question shown to the user.
const approveOrReject: InterruptOnConfig["allowedDecisions"] = ["approve", "reject"];

export const interruptOn: Record<string, InterruptOnConfig> = {
  book_flight: {
    allowedDecisions: approveOrReject,
    description: (call) => `Book a NEW ticket on flight ${call.args.flightId}.`,
  },
  change_booking: {
    allowedDecisions: approveOrReject,
    description: (call) => `Move booking ${call.args.pnrCode} to flight ${call.args.newFlightId}.`,
  },
  cancel_pnr: {
    allowedDecisions: approveOrReject,
    description: (call) => `Cancel booking ${call.args.pnrCode}.`,
  },
};
