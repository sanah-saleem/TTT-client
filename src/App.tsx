import { useEffect, useMemo, useState } from "react";
import { clsx as cls } from "clsx";
import {
  initNakama,
  createRoom,
  joinRoom as joinKnownRoom,
  leaveMatch as leaveKnownMatch,
  quickMatch as startQuickMatch,
  sendMove as sendCellMove,
  getCurrentMatchId,
  getSession,
  type TttState,
} from "./lib/nakama";

export default function App() {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<TttState | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [currentMatchId, setCurrentMatchId] = useState<string | null>(null);

  // authenticate + connect once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initNakama({
          onState: (s) => setState(s),
          onError: (msg) => setLastError(msg),
          onDisconnect: () => {
            setConnected(false);
            setCurrentMatchId(null);
          },
          onMatched: () => {
            setCurrentMatchId(getCurrentMatchId());
          },
        });
        if (!cancelled) {
          setConnected(true);
        }
      } catch (e: any) {
        if (!cancelled) setLastError(e?.message ?? "Failed to connect.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // track currentMatchId from Nakama module
  useEffect(() => {
    setCurrentMatchId(getCurrentMatchId());
  }, [state]);

  const me = getSession()?.user_id ?? null;
  const mySymbol = useMemo(() => (state?.symbols && me ? state.symbols[me] : undefined), [state, me]);
  const isMyTurn = useMemo(() => (state?.turn && me ? state.turn === me : false), [state, me]);

  const statusText = useMemo(() => {
    if (!state) return "Connecting…";
    if (state.status === "waiting") return "Waiting for an opponent…";
    if (state.status === "playing") {
      return isMyTurn ? "Your turn!" : "Opponent's turn…";
    }
    if (state.status === "ended") {
      if (state.winner === null) return "Draw!";
      return state.winner === me ? "You won! 🎉" : "You lost. 😶";
    }
    return "…";
  }, [state, isMyTurn, me]);

  // Handlers
  async function handleCreate() {
    setLastError(null);
    try {
      const id = await createRoom();
      await joinKnownRoom(id);
      setCurrentMatchId(id);
    } catch (e: any) {
      setLastError(e?.message ?? "Failed to create room.");
    }
  }

  async function joinRoom() {
    setLastError(null);
    try {
      if (!roomCode.trim()) return;
      await joinKnownRoom(roomCode.trim());
      setCurrentMatchId(roomCode.trim());
    } catch (e: any) {
      setLastError(e?.message ?? "Failed to join.");
    }
  }

  async function quickMatch() {
    setLastError(null);
    try {
      await startQuickMatch();
    } catch (e: any) {
      setLastError(e?.message ?? "Failed to start matchmaking.");
    }
  }

  async function leaveMatch() {
    setLastError(null);
    try {
      await leaveKnownMatch();
      setCurrentMatchId(null);
      setState(null);
    } catch (e: any) {
      setLastError(e?.message ?? "Failed to leave match.");
    }
  }

  async function sendMove(i1to9: number) {
    setLastError(null);
    try {
      await sendCellMove(i1to9);
    } catch (e: any) {
      setLastError(e?.message ?? "Failed to send move.");
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center">
      <header className="w-full max-w-xl px-4 py-4">
        <h1 className="text-xl font-semibold tracking-wide">Tic-Tac-Toe</h1>
      </header>

      <main className="w-full max-w-xl px-4 py-4 flex flex-col gap-4">
        {/* Connect / Room controls */}
        <div className="rounded-2xl bg-slate-800 p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <button
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
              onClick={handleCreate}
              disabled={!connected}
            >
              Create Room
            </button>
            <div className="text-xs opacity-80">
              {connected ? "Connected" : "Not connected"}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 outline-none"
              placeholder="Enter room code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
            />
            <button
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50"
              disabled={!connected}
              onClick={joinRoom}
            >
              Join
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50"
              disabled={!connected}
              onClick={quickMatch}
            >
              Quick Match
            </button>
            {currentMatchId && (
              <button
                className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600"
                onClick={leaveMatch}
              >
                Leave
              </button>
            )}
          </div>

          {currentMatchId && (
            <div className="col-span-full text-xs text-slate-300">
              Match: <span className="font-mono">{currentMatchId}</span>
            </div>
          )}
        </div>

        {/* Board + HUD */}
        <div className="rounded-2xl bg-slate-800 p-4 flex flex-col items-center gap-4">
          <div className="text-sm opacity-90 min-h-[1.25rem]">{statusText}</div>

          <div className="grid grid-cols-3 gap-2 w-full max-w-sm">
            {[...Array(9)].map((_, i) => {
              const mark = state?.board?.[i] || "";
              const disabled = !state || state.status !== "playing" || !!mark || !isMyTurn;
              return (
                <button
                  key={i}
                  aria-label={`Cell ${i + 1}${mark ? ` ${mark}` : ""}`}
                  className={cls(
                    "aspect-square rounded-2xl flex items-center justify-center text-4xl font-bold",
                    "border border-slate-700 bg-slate-900/70",
                    disabled ? "opacity-60" : "hover:bg-slate-900"
                  )}
                  disabled={disabled}
                  onClick={() => sendMove(i + 1)}
                >
                  <span className={cls(mark === "X" && "text-sky-400", mark === "O" && "text-pink-400")}>
                    {mark}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 text-sm opacity-90">
            <span>Your symbol:</span>
            <span className={cls(
              "font-semibold",
              mySymbol === "X" && "text-sky-400",
              mySymbol === "O" && "text-pink-400"
            )}>
              {mySymbol || "—"}
            </span>
          </div>
        </div>

        {/* Errors */}
        {lastError && (
          <div className="rounded-xl bg-red-900/40 border border-red-800 text-red-200 p-3 text-sm">
            {lastError}
          </div>
        )}
      </main>

      <footer className="mt-auto w-full max-w-xl px-4 py-6 text-xs text-slate-400">
        Server-authoritative · Nakama · Demo UI
      </footer>
    </div>
  );
}
