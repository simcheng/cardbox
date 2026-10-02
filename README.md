# Cardtable

Cardtable is a live, freeform card table for desktop and mobile browsers. It starts with a standard 52-card deck, private hands, guest names, table chat, and invite links. Deck definitions are data-driven in `shared/deckDefinitions.js` so new decks can be added without tying their rules to the table UI.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm run dev
```

Open the Vite URL printed in the terminal. Vite serves the client on port 5173 and the Express/Socket.IO server listens on port 3000. The client connects to that local server automatically.

To create a production build locally:

```sh
npm run build
NODE_ENV=production npm start
```

The server serves `dist/` when `NODE_ENV=production` and reads its listening port from `PORT`. In PowerShell, set the variable with `$env:NODE_ENV="production"` before running `npm start`.

## Play

- Create a table or join with an invite link or room code. Guest names are made unique automatically.
- The deck starts face down. Draw a card, deal a chosen number to yourself or everyone, and shuffle from the deck controls.
- Your hand is visible in an overlapping zone at the bottom of the felt. The table shows each other player's hand count.
- Drag cards onto the felt to place them. A placement preview appears while dragging; dropping places immediately. Cards dropped from your hand form a fan. Drop onto an existing stack or fan to add cards, insert into a fan, or create another fan layer.
- Select cards with click, Shift-click, Control-click or Command-click, or drag a selection box. Drag a selection as one group. The deck's selection box selects only its top card.
- Drag cards or whole stacks into your hand. Sort hands and table piles by suit or rank.
- Right-click a card or pile, hold a card on touch screens, or open its menu for actions such as flip, move, return to deck/discard, rename, sort, fan, and separate fan layers. Empty table piles are removed automatically.
- Move piles by their dotted handle. Double-click a pile's handle to switch between fan and stack layouts.
- Use the table actions menu to add a shared pile or open the action history. Undo is available at the lower left; the chat button opens the initially hidden chat panel.
- Chat supports emoji reactions and short-lived table notifications. The host can promote cohosts and change hand visibility or host-only card controls in settings.
- Switch between light and dark themes in settings.

On touch devices, drag cards to move them, tap to select, and hold a card to open its actions. Layout and controls adapt to the available screen space.

## Deploy to Render

The repository includes a Render Blueprint in `render.yaml`.

1. In Render, choose **New → Blueprint** and connect `https://github.com/simcheng/cardbox` (or select the connected repository).
2. Review the Blueprint before applying it. It creates one Node web service named `cardtable`, runs `npm install && npm run build`, starts with `npm start`, and uses `/health` for its health check. The Blueprint currently selects Render's `starter` plan; change the plan in `render.yaml` if you want a different size or billing tier.
3. Wait for the first deploy, then check `https://<your-service>.onrender.com/health` for `{"ok":true}`. Open the service URL and create a table to confirm the UI and Socket.IO connection work.
4. Keep one service instance for this prototype. Lobby and chat data live in process memory; a restart or deploy clears active tables. Multiple instances need shared room storage and a Socket.IO adapter before they can serve the same tables. Render can interrupt WebSocket sessions during deploys or maintenance; clients reconnect, but in-memory tables do not survive an instance replacement.

The app has no required environment variables beyond `NODE_ENV=production`, which is set by the Blueprint. Render assigns `PORT` automatically. The server binds to `0.0.0.0` and accepts Socket.IO WebSocket upgrades on the same port as HTTP.

## Use a Cloudflare domain

First deploy the Render service and note its `onrender.com` hostname. If the domain is registered elsewhere, change its nameservers to the nameservers Cloudflare gives you.

1. In the Render service's **Settings → Custom Domains**, add the hostname you plan to use, such as `play.example.com` or `example.com`.
2. In Cloudflare **DNS → Records**, create a CNAME pointing that hostname to the Render service hostname. For an apex/root hostname, Cloudflare can flatten the CNAME. Remove conflicting `AAAA` records; Render's custom-domain guide currently calls these out as a source of routing problems.
3. Leave the CNAME **DNS only** (gray cloud) while Render verifies the domain and issues its TLS certificate. Follow the DNS values shown in the Render dashboard, then click **Verify** in Render.
4. After the certificate is issued, optionally turn on Cloudflare proxying (orange cloud). Set Cloudflare **SSL/TLS** to **Full (strict)** once the Render origin certificate is valid for the custom hostname. Cloudflare supports proxied WebSockets; enable **Network → WebSockets** if it is disabled. Do not add cache rules for `/socket.io/` or the app's HTML page.
5. Test the custom domain in a browser, then open a table in two browser sessions to check realtime updates through the proxy.

For the provider-specific sequence and current DNS requirements, see [Render's Cloudflare DNS guide](https://render.com/docs/configure-cloudflare-dns), [Render custom domains](https://render.com/docs/custom-domains), [Render WebSockets](https://render.com/docs/websocket), and [Cloudflare WebSockets](https://developers.cloudflare.com/network/websockets/).

## State and capacity

Rooms are held in server memory. An empty room is retained for 45 minutes after its last update; an offline player can reclaim their identity for 15 minutes. Each room allows up to 12 concurrent players and retains up to 32 player identities before reclaiming sufficiently old offline seats. Reclaimed players' cards are moved to discard. A server restart or deploy clears active rooms. Persistent room storage is not configured.
