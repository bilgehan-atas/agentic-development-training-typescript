/**
 * Shared local LLM instance, backed by Ollama.
 *
 * Make sure Ollama is running locally and the model has been pulled:
 *
 *   ollama pull qwen2.5:7b
 *   ollama serve
 *
 * Want to try another model? `OLLAMA_MODEL=llama3.1:8b npm start`
 * (pick one that supports tool calling — see https://ollama.com/search?c=tools)
 */
import { ChatOllama } from "@langchain/ollama";

export const MODEL = process.env.OLLAMA_MODEL ?? "gemma3:270m";

export const llm = new ChatOllama({ model: MODEL, temperature: 0 });
