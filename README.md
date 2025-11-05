

# 🎮 Tic-Tac-Toe Client (React + Vite + TS)

A lightweight **Tic-Tac-Toe** web client that connects to a **Nakama** backend.
Supports **guest/login/register**, **create/join by code**, **quick match**, **rejoin on refresh**, timers, and a clean demo UI.

---

## 🚀 Features

* 🔐 **Auth options:** guest, email login, or register (via Nakama)
* 🔌 **Auto restore & reconnect** (session cached in `localStorage`)
* 🧩 **Create Room**, **Join by code**, **Quick Match** (Nakama matchmaker)
* ⏱️ **Turn timer** & match status HUD
* 🔄 **Play Again** (restart) when both players present
* ♻️ **Rejoin last match** after page reload
* 🧼 Clear error messages and disconnect handling

---

## 🧱 Prerequisites

* **Node.js** 18+ and **npm** (or pnpm/yarn)
* Your **server** (Nakama + CockroachDB) running locally
  (Follow the server README to: start CockroachDB → create `nakama` DB → start Nakama)

---

## 📦 Get the code & install

> Replace the repo URL if needed.

```bash
git clone <YOUR_CLIENT_REPO_URL>.git
cd <your-client-folder>
npm install
```

---

## ⚙️ Configure environment

The client reads these Vite env vars (with safe defaults):

* `VITE_NAKAMA_KEY`  (default `defaultkey`)
* `VITE_NAKAMA_HOST` (default `127.0.0.1`)
* `VITE_NAKAMA_PORT` (default `7350`)
* `VITE_NAKAMA_SSL`  (`"true"` or `"false"`, default `"false"`)

Create a `.env.local` file in the project root:

```env
VITE_NAKAMA_KEY=defaultkey
VITE_NAKAMA_HOST=127.0.0.1
VITE_NAKAMA_PORT=7350
VITE_NAKAMA_SSL=false
```

> Use `VITE_NAKAMA_SSL=true` if your Nakama is exposed over HTTPS/WSS.

---

## ▶️ Run the app (dev)

```bash
npm run dev
```

Vite will print a local URL (typically [http://localhost:5173](http://localhost:5173)).
Make sure your **server** is already up:

1. Start CockroachDB
2. Create DB (Windows Git Bash example):

```bash
MSYS_NO_PATHCONV=1 docker exec -it cockroach /cockroach/cockroach sql --insecure --host=cockroach -e "CREATE DATABASE IF NOT EXISTS nakama;"
```

(Linux/macOS: same command without the `MSYS_NO_PATHCONV=1` prefix)

3. Start Nakama
   Then open the client.

---

## 🏗️ Build for production

```bash
npm run build
npm run preview   # serve the built app locally
```

---

## 🧩 How it works (quick map to source)

* **`src/App.tsx`** – the UI/board, timers, status text, and room controls

  * Creates/joins/quick-matches
  * Shows **current match id**, **your symbol**, **turn countdown**, and **Play Again**
* **`src/components/AuthPanel.tsx`** – guest/login/register + connect socket

  * Calls `loginGuest` / `authenticateEmail`
  * Shows “Signed in as …” and current match id
* **`src/lib/nakama.ts`** – all Nakama wiring

  * **Client & session** management (tokens cached in `localStorage`)
  * **Socket** connect + handlers (`onState`, `onError`, `onMatched`, `onDisconnect`)
  * **Match APIs:** `createRoom`, `joinRoom`, `leaveMatch`, `quickMatch`, `sendMove`, `restartGame`
  * **Restore flow:** `restoreAndConnect({ fallbackToGuest: true })`
  * **Rejoin last match:** `tryRejoinLastMatch()`
  * **Opcodes (shared with server):**

    * `OP_MOVE = 1` · `OP_STATE = 2` · `OP_ERROR = 3` · `OP_RESTART = 4`
  * **State shape** (`TttState`): `board[9]`, `turn`, `status`, `winner`, `players`, `symbols`, `turnDeadlineMs`

**Storage keys used:**

* `nk_device_id` – stable device id for guest auth
* `nk_auth_token`, `nk_refresh_token` – session tokens
* `ttt_last_match` – last match id to try rejoin

---

## 🧪 Basic flows

* **Play as Guest:** choose *Guest* → **Play as Guest** → **Create Room** or **Quick Match**
* **Invite a friend:** *Create Room* → copy the shown match id → friend enters it in *Join*
* **After refresh:** the app restores session and **tries `tryRejoinLastMatch()`**
* **Play Again:** after a finished game (draw/win/loss) with **both players present**, click **Play Again**

---

## 🧰 Scripts

```bash
npm run dev       # start Vite dev server
npm run build     # production build
npm run preview   # serve dist/ locally
```

---

## 🎨 UI Notes

* Uses utility classes (Tailwind-style). You can include Tailwind or keep the classes as static styles—your choice.
* Uses `clsx` (`cls`) to toggle classes based on state.

---

## ❗ Troubleshooting

* **CORS / socket fails**: confirm **port 7350** (Nakama socket) and `VITE_NAKAMA_SSL` matches your server (WSS needs SSL=true).
* **Can’t join by code**: ensure the server is running your Tic-Tac-Toe module and that the **match id** is correct.
* **Quick Match never pairs**: verify your server’s match **label** has `properties.module: "tiktaktoe"` and at least two clients are matchmaking.
* **Session expired**: tokens are auto-refreshed when possible; otherwise, re-auth via Guest/Login.

---

## 📜 License

MIT — adapt freely.


