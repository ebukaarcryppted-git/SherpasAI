# Bot adapters

Discord and Telegram integrations for the Support Agent ASP. Both are thin —
they call `@support-agent-asp/agent-core` directly, so they share the exact
same diagnosis logic as the website and the MCP server. No separate API
deployment is required; these run standalone.

Standing up your own instance of either bot needs a bot token from the
respective platform, which only you can create (they're tied to your own
Discord application / Telegram BotFather account) — these aren't shared
public bots.

## Discord (`bot-adapters/discord`)

1. Create an application + bot at https://discord.com/developers/applications,
   copy the bot token and application (client) ID.
2. `DISCORD_TOKEN=... DISCORD_CLIENT_ID=... npm run deploy-commands` — registers
   `/diagnose`, `/approvals`, `/bridge` as slash commands. Add `DISCORD_GUILD_ID`
   to register instantly to one server while developing (global registration
   can take up to an hour to propagate).
3. Invite the bot to your server with the `applications.commands` and `bot`
   scopes, `Send Messages` + `Embed Links` permissions.
4. `DISCORD_TOKEN=... npm run dev` (or `npm run build && npm start`).

Behavior:
- `/diagnose tx_hash:0x...` → embed with the diagnosis.
- `/approvals address:0x... tokens:0x...,0x...` → approval hygiene report.
- `/bridge tx_hash:0x... recipient:0x...` → bridge status.
- Anyone pasting a bare 66-character tx hash in a channel the bot can see
  gets an automatic diagnosis reply — no command needed. This is the "drop a
  hash in the support channel" flow.

## Telegram (`bot-adapters/telegram`)

1. Message [@BotFather](https://t.me/BotFather), `/newbot`, copy the token.
2. `TELEGRAM_BOT_TOKEN=... npm run dev` (or `npm run build && npm start`).

Behavior:
- `/diagnose <tx_hash>`, `/approvals <address> <token1,token2>`,
  `/bridge <tx_hash> <recipient>`.
- A bare tx hash sent as a plain message triggers the same auto-diagnosis
  as Discord.

## Deploying either one long-term

These are long-running processes (`bot.launch()` / Discord gateway
connection), not serverless functions — run them on anything that keeps a
Node process alive (a small VM, a container on Fly.io/Railway, etc.), not on
Vercel's request-response functions. See
[`docs/USAGE.md`](../docs/USAGE.md#deploying-either-one-long-term) for the
exact Railway setup this project uses (per-service `railway.json`, and why
Root Directory must stay at the repo root for npm workspace resolution to
work).
