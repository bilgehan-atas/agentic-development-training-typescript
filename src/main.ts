/**
 * Entry point.
 *
 *   npm start -- "What are my bookings?"     # one question
 *   npm start                                # interactive chat
 */
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { buildGraph } from "./graph";
import { MODEL } from "./llm";
import { runTurn } from "./run";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const approve = (question: string) => rl.question(`\n  ⚠️  ${question} `);

async function ask(app: ReturnType<typeof buildGraph>, threadId: string, question: string) {
  const state = await runTurn(app, question, { threadId, approve });
  console.log(`\n🤖 ${state.messages.at(-1)?.content}\n`);
}

async function main() {
  const app = buildGraph();
  // One thread for the whole session: the checkpointer (TODO 4) keeps its state,
  // so every turn sees the earlier conversation. A new process = a new thread.
  const threadId = randomUUID();
  const question = process.argv.slice(2).join(" ").trim();

  if (question) {
    await ask(app, threadId, question);
  } else {
    console.log(`✈️  Flight assistant (model: ${MODEL}). Type "exit" to quit.\n`);
    while (true) {
      const line = (await rl.question("🧑 ")).trim();
      if (!line || line === "exit") break;
      await ask(app, threadId, line);
    }
  }
  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
