/**
 * Thin client for the flight server in ../server (run it with `npm start` there).
 *
 * Nothing LangChain-specific here — just fetch() calls. Nodes and tools use
 * these functions to talk to the "real world".
 */

export interface Flight {
  id: string;
  from: string;
  to: string;
  date: string;
  time: string;
  basePrice: number;
  price?: number;
}

export interface Pnr {
  code: string;
  flightId: string;
  paidPrice: number;
  cancellationFee: number;
  status: "ACTIVE" | "CANCELLED";
  flight?: Flight;
}

export interface User {
  id: string;
  balance: number;
  pnrs: Pnr[];
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const apiUrl = () => process.env.FLIGHT_API_URL ?? "http://localhost:3000";

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${apiUrl()}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  getUser: () => request<User>("GET", "/user"),

  listFlights: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return request<Flight[]>("GET", `/flights?${params}`);
  },

  book: (flightId: string) =>
    request<{ price: number; balance: number; pnr: Pnr }>("POST", "/book", { flightId }),

  change: (pnrCode: string, newFlightId: string) =>
    request<{ refund: number; price: number; balance: number; pnr: Pnr }>("POST", "/change", {
      pnrCode,
      newFlightId,
    }),

  cancel: (pnrCode: string) =>
    request<{ refund: number; balance: number; pnr: Pnr }>("POST", "/cancel", { pnrCode }),
};
