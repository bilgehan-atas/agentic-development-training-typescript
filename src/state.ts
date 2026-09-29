/**
 * Graph STATE: the shared "memory" that flows through every node.
 *
 * - Each node receives the current state and returns a PARTIAL update.
 * - `messages` uses a reducer (MessagesValue) → returned messages are APPENDED.
 * - Every other field has no reducer → a returned value simply OVERWRITES it.
 *
 * The state lives in a THREAD (`thread_id`). In the interactive chat every turn
 * reuses the same thread, so `messages` holds the whole conversation and the
 * other fields keep their value from the previous turn until a node overwrites them.
 */
import { MessagesValue, StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import type { User } from "./api";

export const Intent = z.enum(["info", "cancel", "travel", "unclear"]);
export type Intent = z.infer<typeof Intent>;

export const AgentState = new StateSchema({
  /** Conversation: the user's requests + the assistant's final answers. */
  messages: MessagesValue,
  /** Account data loaded from GET /user by `load_context`. */
  user: z.custom<User>().optional(),
  /** What the user wants, decided by `classify_intent`. */
  intent: Intent.optional(),
  /** The booking `cancel_booking` picked; `confirm_cancel` asks for approval and cancels it. */
  pnrCode: z.string().optional(),
  /** Set by `load_context` when the flight server can't be reached. */
  error: z.string().optional(),
});

export type State = typeof AgentState.State;
