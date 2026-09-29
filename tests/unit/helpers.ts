import type { User } from "../../src/api";
import type { State } from "../../src/state";
import { AIMessage, HumanMessage } from "@langchain/core/messages";

export const sampleUser: User = {
  id: "user1",
  balance: 100,
  pnrs: [
    {
      code: "ABC123",
      flightId: "IST-FRA-20261022-0800",
      paidPrice: 100,
      cancellationFee: 20,
      status: "ACTIVE",
      flight: { id: "IST-FRA-20261022-0800", from: "IST", to: "FRA", date: "2026-10-22", time: "08:00", basePrice: 100 },
    },
  ],
};

export const stateWith = (question: string, extra: Partial<State> = {}): State =>
  ({ messages: [new HumanMessage(question)], user: sampleUser, ...extra }) as State;

/** A state whose thread already has an earlier turn ("What are my bookings?" → answer). */
export const stateWithHistory = (question: string): State =>
  stateWith(question, {
    messages: [
      new HumanMessage("What are my bookings?"),
      new AIMessage("You have one booking: ABC123 on 2026-10-22."),
      new HumanMessage(question),
    ],
  });

/** Call a node function directly, outside of a graph. */
export const callNode = (node: unknown, state: State) =>
  (node as (s: State, c: object) => Promise<Partial<State>>)(state, {});

/** Text of all messages passed to a (mocked) LLM call. */
export const promptText = (messages: { content: unknown }[]) => messages.map((m) => String(m.content)).join("\n");
