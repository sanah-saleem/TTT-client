import { Client, type Socket, Session, type MatchmakerMatched} from "@heroiclabs/nakama-js";

//config
const key   = import.meta.env.VITE_NAKAMA_KEY   ?? "defaultkey";
const host  = import.meta.env.VITE_NAKAMA_HOST  ?? "127.0.0.1";
const port  = import.meta.env.VITE_NAKAMA_PORT  ?? "7350";
const useSSL = (import.meta.env.VITE_NAKAMA_SSL ?? "false") === "true";

//Opcodes (shared with server)
export const OP_MOVE  = 1;
export const OP_STATE = 2;
export const OP_ERROR = 3;
export const OP_RESTART = 4;

//Game state shape 
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

//Internals
let client: Client | null = null;
let session: Session | null = null;
let socket: Socket | null = null;
let currentMatchId: string | null = null;

// const STORAGE_SESSION = "nakama.session";
// const STORAGE_DEVICE = "device-id";
const STORAGE_DEVICE  = "nk_device_id";
const STORAGE_AUTH    = "nk_auth_token";
const STORAGE_REFRESH = "nk_refresh_token";

//Accessors
export function getCurrentMatchId() {
  return currentMatchId;
}
export function getSession() {
  return session;
}

//Session prsistence helpers
function ensureClient() {
  if(!client) client = new Client(key, host, port, useSSL);
  return client!;
}

function saveSession(s: Session) {
  try{ 
    localStorage.setItem(STORAGE_AUTH, s.token || "");
    if (s.refresh_token) localStorage.setItem(STORAGE_REFRESH, s.refresh_token)
  } catch{}
}

function loadSession(): Session | null {
  try {
    const auth = localStorage.getItem(STORAGE_AUTH) || "";
    if(!auth) return null;
    const refresh = localStorage.getItem(STORAGE_REFRESH) || "";
    const s = Session.restore(auth, refresh);
    const nowSec = Math.floor(Date.now() / 1000)
    return s && !s.isexpired(nowSec) ? s : null;
  } catch { return null; }
}

async function refreshIfNeeded(): Promise<void> {
  if (!client || !session) return;

  const in30s = Math.floor(Date.now() / 1000) + 30;
  if (!session.isexpired(in30s)) return;

  // If there’s no refresh token, you can’t refresh -> force re-auth
  if (!session.refresh_token) {
    // clear stale tokens so next auth flow can proceed cleanly
    try {
      localStorage.removeItem(STORAGE_AUTH);
      localStorage.removeItem(STORAGE_REFRESH);
    } catch {}
    throw new Error("Session expired. Please sign in again.");
  }

  session = await client.sessionRefresh(session);
  saveSession(session);
}

//Auth apis
export async function loginGuest(): Promise<Session> {
  const c = ensureClient();

  //reuse cached session if valid
  const cached = loadSession();
  if(cached) {
    session = cached;
    return session;
  }

  //persist a stable device id
  let deviceId = localStorage.getItem(STORAGE_DEVICE);
  if(!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(STORAGE_DEVICE, deviceId);
  }

  session = await c.authenticateDevice(deviceId, true)
  saveSession(session);
  return session;
}

export async function loginEmail(email: string, password: string, create: boolean, username?: string): Promise<Session> {
  const c = ensureClient();
  session = await c.authenticateEmail(email, password, create, username);
  saveSession(session);
  return session;
}

export async function getAccount(): Promise<any> {
  const c = ensureClient();
  if(!session) throw new Error("Not authenticated");
  await refreshIfNeeded();
  return c.getAccount(session);
}

export async function updateProfile(opts: {displayName?: string, username?: string, avatarUrl?: string, langTag?: string; location?: string; timezone?: string; }) {
  const c = ensureClient();
  if (!session) throw new Error("Not authenticated");
  await refreshIfNeeded();
  await c.updateAccount(session, {
    display_name: opts.displayName,
    username: opts.username,
    avatar_url: opts.avatarUrl,
    lang_tag: opts.langTag,
    location: opts.location,
    timezone: opts.timezone,
  });
  return c.getAccount(session);
}

export async function logout() {
  try{ socket?.disconnect(true); } catch {}
  socket = null;
  session = null;
  currentMatchId = null;
  try {
    localStorage.removeItem(STORAGE_AUTH);
    localStorage.removeItem(STORAGE_REFRESH);
  } catch {}
}

//socket connection wiring
export async function connectSocket(handlers: NakamaHandlers = {}) {
  const c = ensureClient();
  if (!session) throw new Error("Login first");
  await refreshIfNeeded();

  socket = c.createSocket(useSSL, false);
  await socket.connect(session, true);

  socket.onmatchdata = (md) => {
    const decoder = new TextDecoder();
    if (md.op_code === OP_STATE) {
      try {
        const s = JSON.parse(decoder.decode(md.data)) as TttState;
        handlers.onState?.(s);
      } catch {
        handlers.onError?.("Failed to parse state")
      }
    }else if (md.op_code === OP_ERROR) {
      const msg = decoder.decode(md.data);
      try {
        const obj = JSON.parse(msg);
        handlers.onError?.(obj?.msg ?? "unknown error");
      } catch {
        handlers.onError?.(msg || "Unknown error");
      }
    }
  };

  socket.ondisconnect = (evt) => {
    currentMatchId = null;
    handlers.onDisconnect?.(evt);
  };

  socket.onmatchmakermatched = async (matched) => {
    const match = await socket!.joinMatch(matched.match_id);
    currentMatchId = match.match_id;
    handlers.onMatched?.(matched);
  };

  return socket;

}

export async function restoreAndConnect (
  handlers: NakamaHandlers = {},
  opts: { fallbackToGuest?: boolean } = { fallbackToGuest: true}
) : Promise<boolean> {
  //Try to load an existing session from localStorage
  const cached = loadSession();
  if(cached) {
    session = cached;
    try {
      await connectSocket(handlers);
      return true;
    } catch {
      //if socket connect fails, we'll try the fallback below.
    }
  }
  //fallback to guest if no cached session
  if (opts.fallbackToGuest) {
    await loginGuest();
    await connectSocket(handlers);
    return true;
  }
  return false;
}

export async function initNakama(handlers: NakamaHandlers = {}) {
  await loginGuest();
  await connectSocket(handlers);
  return { client, session, socket };
}

// Game Apis

export async function createRoom(): Promise<string> {
  const c = ensureClient();
  if (!session) throw new Error("Client not ready.");
  const res = await c.rpc(session, "create_match", {});
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
