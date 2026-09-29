/**
 * Helpers that turn raw data into text an LLM can read.
 * ("Context engineering": the model only knows what you put in the prompt!)
 */
import type { User } from "./api";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const pad = (n: number) => String(n).padStart(2, "0");

export const toIsoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const weekdayOf = (isoDate: string) => WEEKDAYS[new Date(`${isoDate}T00:00:00`).getDay()];

/** e.g. "Today is Wednesday 2026-09-30." — LLMs don't know the current date. */
export function todayLine(now = new Date()): string {
  const iso = toIsoDate(now);
  return `Today is ${weekdayOf(iso)} ${iso}.`;
}

/** Human/LLM-readable summary of the user's account. */
export function describeUser(user?: User): string {
  if (!user) return "No account data available.";
  const lines = [`Balance: ${user.balance} EUR`, "Bookings (PNRs):"];
  if (user.pnrs.length === 0) lines.push("  (none)");
  for (const p of user.pnrs) {
    const f = p.flight;
    const when = f ? `${f.from}->${f.to} on ${weekdayOf(f.date)} ${f.date} at ${f.time}` : p.flightId;
    lines.push(
      `  - ${p.code} [${p.status}] ${when} (flightId ${p.flightId}), paid ${p.paidPrice} EUR, cancellation fee ${p.cancellationFee} EUR`,
    );
  }
  return lines.join("\n");
}
