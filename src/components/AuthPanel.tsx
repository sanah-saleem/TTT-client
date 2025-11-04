import { useState } from "react";
import {
  loginGuest,
  loginEmail,
  connectSocket,
  getAccount,
  logout,
  getCurrentMatchId,
  type NakamaHandlers,
} from "../lib/nakama";

type Props = {
  onConnected?: () => void;          // called after socket connects
  onDisconnected?: () => void;       // called when user logs out or socket drops
  handlers: NakamaHandlers;          // your onState/onError/etc from App
};

export default function AuthPanel({ handlers, onConnected, onDisconnected }: Props) {
  const [mode, setMode] = useState<"guest" | "login" | "register">("guest");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState(""); // only used for register
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [whoami, setWhoami] = useState<string | null>(null);

  async function handleAuth() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "guest") {
        await loginGuest();
      } else {
        const create = mode === "register";
        await loginEmail(email.trim(), password.trim(), create, username.trim() || undefined);
      }
      await connectSocket(handlers);
      try {
        const acc = await getAccount();
        setWhoami(acc.user?.username || acc.user?.id || "Me");
      } catch { /* non-fatal */ }
      onConnected?.();
    } catch (e: any) {
      setError(e?.message ?? "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    setError(null);
    try {
      await logout();
      setWhoami(null);
      onDisconnected?.();
    } catch (e: any) {
      setError(e?.message ?? "Logout failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-slate-800 p-4 grid gap-3">
      {/* Mode toggle */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            className="accent-emerald-500"
            checked={mode === "guest"}
            onChange={() => setMode("guest")}
          />
          Guest
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            className="accent-emerald-500"
            checked={mode === "login"}
            onChange={() => setMode("login")}
          />
          Login
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            className="accent-emerald-500"
            checked={mode === "register"}
            onChange={() => setMode("register")}
          />
          Register
        </label>

        <div className="ml-auto text-xs opacity-80">
          {whoami ? (
            <span>
              Signed in as <b>{whoami}</b>
              {getCurrentMatchId() && (
                <span className="ml-2 font-mono opacity-70">({getCurrentMatchId()})</span>
              )}
            </span>
          ) : (
            <span>Not signed in</span>
          )}
        </div>
      </div>

      {/* Inputs */}
      {mode !== "guest" && (
        <div className="flex flex-wrap gap-2">
          <input
            className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 outline-none"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 outline-none"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
          {mode === "register" && (
            <input
              className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 outline-none"
              placeholder="Username (unique)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleAuth}
          disabled={busy || (mode !== "guest" && (!email.trim() || !password))}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy ? "Please wait…" : mode === "guest" ? "Play as Guest" : mode === "login" ? "Sign In" : "Create Account"}
        </button>
        <button
          onClick={handleLogout}
          disabled={busy || !whoami}
          className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
        >
          Logout
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-900/40 border border-red-800 text-red-200 p-3 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
