import { Client, type Socket, Session, type MatchmakerMatched } from "@heroiclabs/nakama-js";

const key   = import.meta.env.VITE_NAKAMA_KEY   ?? "defaultkey";
const host  = import.meta.env.VITE_NAKAMA_HOST  ?? "127.0.0.1";
const port  = import.meta.env.VITE_NAKAMA_PORT  ?? "7350";
const useSSL = (import.meta.env.VITE_NAKAMA_SSL ?? "false") === "true";

export const OP_MOVE  = 1;
export const OP_STATE = 2;
export const OP_ERROR = 3;
export const OP_RESTART = 4;

export interface TttState {
  board: string[];          // length 9, "", "X", "O"
  turn: string | null;      // user_id of who plays next
  status: "waiting" | "playing" | "ended";
  winner: string | null;    // user_id or null
  players?: (string | null)[];
  symbols?: Record<string, "X" | "O">;
  turnDeadlineMs?: number;
}

export type NakamaHandlers = {
  onState?: (s: TttState) => void;
  onError?: (msg: string) => void;
  onDisconnect?: (e: Event) => void;
  onMatched?: (m: MatchmakerMatched) => void;
};

let client: Client | null = null;
let session: Session | null = null;
let socket: Socket | null = null;
let currentMatchId: string | null = null;

export function getCurrentMatchId() {
  return currentMatchId;
}
export function getSession() {
  return session;
}

export async function initNakama(handlers: NakamaHandlers = {}) {
  if (!client) {
    client = new Client(key, host, port, useSSL);
  }
  // device auth
  const storageKey = "device-id";
  let deviceId = localStorage.getItem(storageKey);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(storageKey, deviceId);
  }
  session = await client.authenticateDevice(deviceId, true);

  socket = client.createSocket(useSSL, false);
  await socket.connect(session, true);

  // wire listeners
  socket.onmatchdata = (md) => {
    const decoder = new TextDecoder();
    if (md.op_code === OP_STATE) {
      try {
        const s = JSON.parse(decoder.decode(md.data)) as TttState;
        handlers.onState?.(s);
      } catch (e) {
        handlers.onError?.("Failed to parse server state.");
      }
    } else if (md.op_code === OP_ERROR) {
      const msg = decoder.decode(md.data);
      try {
        const obj = JSON.parse(msg);
        handlers.onError?.(obj?.msg ?? "Unknown error");
      } catch {
        handlers.onError?.(msg || "Unknown error");
      }
    }
  };

  socket.ondisconnect = (evt) => {
    currentMatchId = null;
    handlers.onDisconnect?.(evt);
  }
    

  socket.onmatchmakermatched = async (matched) => {
    const match = await socket!.joinMatch(matched.match_id);
    currentMatchId = match.match_id;
    handlers.onMatched?.(matched);
  };

  return { client, session, socket };
}

export async function createRoom(): Promise<string> {
  if (!client || !session) throw new Error("Client not ready.");
  const res = await client.rpc(session, "create_match", {});
  // SDK may return payload as object or string; handle both:
  const data = typeof res.payload === "string" ? JSON.parse(res.payload) : (res.payload as any);
  if (!data?.match_id) throw new Error(data?.error || "No match id returned");
  return data.match_id as string;
}

export async function joinRoom(matchId: string) {
  if (!socket) throw new Error("Socket not connected.");
  const match = await socket.joinMatch(matchId);
  currentMatchId = match.match_id;
}

export async function leaveMatch() {
  if (socket && currentMatchId) {
    await socket.leaveMatch(currentMatchId);
  }
  currentMatchId = null;
}

export async function quickMatch() {
  if (!socket) throw new Error("Socket not connected.");
  // must match your server match label/properties
  const query = '+properties.module:tiktaktoe';
  const min = 2, max = 2;
  const stringProps = { module: "tiktaktoe" };
  const numericProps = {};
  await socket.addMatchmaker(query, min, max, stringProps, numericProps);
}

export async function sendMove(cell: number) {
  if (!socket || !currentMatchId) throw new Error("No match to play in.");
  const payload = new TextEncoder().encode(JSON.stringify({ cell }));
  await socket.sendMatchState(currentMatchId, OP_MOVE, payload);
}

export async function restartGame() {
  if (!socket || !currentMatchId) throw new Error("No Match");
  await socket.sendMatchState(currentMatchId, OP_RESTART, new Uint8Array());
}
