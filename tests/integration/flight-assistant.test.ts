/**
 * End-to-end tests: real Ollama model + a fresh flight server started by the test.
 * Run with `npm run test:integration` (Ollama must be running with the model pulled).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, type Flight } from "../../src/api";
import { toIsoDate } from "../../src/context";

const PORT = 3999;
process.env.FLIGHT_API_URL = `http://localhost:${PORT}`;

const { buildGraph } = await import("../../src/graph");
const { runTurn } = await import("../../src/run");

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../server");
let server: ChildProcess;

async function ask(question: string) {
  const state = await runTurn(buildGraph(), question, {
    threadId: crypto.randomUUID(),
    approve: async () => "y",
    log: () => {},
  });
  return { state: state as typeof state & { intent?: string }, answer: String(state.messages.at(-1)?.content) };
}

const daysFromNow = (n: number) => toIsoDate(new Date(Date.now() + n * 24 * 3600 * 1000));

describe.runIf(process.env.RUN_INTEGRATION_TESTS)("flight assistant (integration)", { timeout: 300_000 }, () => {
  beforeAll(async () => {
    server = spawn("node", ["server.js"], { cwd: serverDir, env: { ...process.env, PORT: String(PORT) } });
    for (let i = 0; i < 50; i++) {
      try {
        await api.getUser();
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    throw new Error(`Flight server did not start in ${serverDir}`);
  });

  afterAll(() => {
    server?.kill();
  });

  it("unclear request → ask_clarification", async () => {
    const { state } = await ask("Hello! How are you?");
    expect(state.intent).toBe("unclear");
  });

  it("TODO 2 — answers account questions from the loaded data", async () => {
    const { state, answer } = await ask("What is my current balance?");
    expect(state.intent).toBe("info");
    expect(answer).toContain("100");
  });

  it("TODO 3 — cancels a booking through the cancel_booking node", async () => {
    const { state } = await ask("Please cancel my booking ABC123");
    expect(state.intent).toBe("cancel");

    const user = await api.getUser();
    expect(user.pnrs.find((p) => p.code === "ABC123")?.status).toBe("CANCELLED");
    expect(user.balance).toBe(180);
  });

  it("travel agent — books the cheapest flight in a date range (multi-step tool use)", async () => {
    const from = daysFromNow(20);
    const to = daysFromNow(23);
    const cheapest = Math.min(...(await api.listFlights(from, to)).map((f: Flight) => f.price!));

    const { state } = await ask(`Book the cheapest flight between ${from} and ${to}.`);
    expect(state.intent).toBe("travel");

    const booked = (await api.getUser()).pnrs.filter((p) => p.status === "ACTIVE");
    expect(booked).toHaveLength(1);
    expect(booked[0].paidPrice).toBe(cheapest);
  });
});
