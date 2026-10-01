# Cardtable

A live, freeform card table for game night. The first deck is a standard 52-card deck; deck definitions are data-driven in `shared/deckDefinitions.js` so additional suits, ranks, or deck types can be added independently of the table UI.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm run dev
```

Open the Vite address shown in the terminal. The client uses Socket.IO to connect to the Node service on port 3000.

## Play

- Create a table, choose a guest name, and share the invite link or room code.
- The deck starts face down. Draw, shuffle, cut, deal one, deal five, or deal one to each player.
- Your hand sits in an overlapping card zone on the felt. Other seats show each player's hand count.
- Drag a card onto empty felt to preview and place it on the grid. Drop close to another placed card to stack or fan it. Tap to select, then tap a felt position to place it.
- Drag a card over your hand to return it; the floating card preview and highlighted hand zone show the drop target. Sort or reorder cards in your hand.
- Open card actions with right-click, a touch hold, or a pile's three-dot menu. Flip cards, move them to your hand or discard, return them to the deck, fan or square up stacks, and remove empty piles.
- Move the deck and other piles with the dotted grip. Stack counts stay visible on the felt, and seats show illustrated hand counts.
- Shuffle, cut, draw, and deal actions give the table a short visual cue for everyone.
- Undo the last card or table action. Chat messages show a short-lived speech bubble at the sender's seat and support quick emoji reactions.
- Invite friends opens a dialog with a copyable link and room code, plus the device's native share menu where available.
- Use the moon/sun button to switch between light and dark themes. Chat opens from the Chat button and starts closed.
- Chat is live for everyone in the room.
- The host can set whether hands are private and whether card actions are host-only.

On phones, tap-to-select works alongside drag and drop. The chat opens from the floating Chat button.

## Deploy to Render

1. Push this repository to GitHub and create a Render **Web Service** from it.
2. Render can use the included `render.yaml`; the service uses `npm install && npm run build` and `npm start` and listens on Render's `PORT`.
3. Keep one service instance for the in-memory lobby prototype. No environment variables are required.
4. Render's service URL can be used directly, or add a custom domain to the service in Render.

The `/health` endpoint returns JSON for Render health checks. The Socket.IO connection upgrades to WebSocket when available and falls back to polling.

## Cloudflare DNS

For a custom domain, add it to Cloudflare and set the registrar nameservers to Cloudflare. In Render, add the hostname to the web service and follow Render's domain verification instructions. In Cloudflare DNS, create the DNS record Render specifies (commonly a CNAME to the Render hostname) and enable the proxy after verification. Set Cloudflare SSL/TLS to **Full (strict)**. WebSockets are supported by Cloudflare; do not cache the application HTML or `/socket.io/` traffic.

## Prototype limits

Lobby state is held in the Node process memory. Empty rooms remain available for 45 minutes after their last player disconnects, and a player can reclaim their seat using the browser's session storage. A service restart or deploy clears active tables. Run one Render instance; multiple instances need shared state and a Socket.IO adapter before they can host the same rooms.
