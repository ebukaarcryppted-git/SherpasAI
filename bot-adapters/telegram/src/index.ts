import { Telegraf, type Context } from "telegraf";
import {
  diagnoseTransaction,
  diagnoseApprovals,
  diagnoseBridge,
  X_LAYER_MAINNET_ID,
  ETHEREUM_MAINNET_ID,
} from "@support-agent-asp/agent-core";
import type { Hash, Hex } from "viem";
import { diagnosisToMessage, approvalsToMessage } from "./format.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error("Set TELEGRAM_BOT_TOKEN in the environment before starting the bot.");
}

const bot = new Telegraf(token);

bot.command("diagnose", async (ctx) => {
  const txHash = ctx.message.text.split(/\s+/)[1];
  if (!txHash) {
    await ctx.reply("Usage: /diagnose <tx_hash>");
    return;
  }
  await respondWithDiagnosis(ctx, txHash);
});

bot.command("approvals", async (ctx) => {
  const parts = ctx.message.text.split(/\s+/).slice(1);
  const [address, tokenList] = parts;
  if (!address || !tokenList) {
    await ctx.reply("Usage: /approvals <address> <token1,token2,...>");
    return;
  }
  const tokens = tokenList.split(",").map((t) => t.trim()) as Hex[];

  try {
    const report = await diagnoseApprovals(X_LAYER_MAINNET_ID, address as Hex, tokens);
    await ctx.replyWithHTML(approvalsToMessage(report));
  } catch (err) {
    await ctx.reply(`Couldn't scan approvals: ${err instanceof Error ? err.message : "unknown error"}`);
  }
});

bot.command("bridge", async (ctx) => {
  const [txHash, recipient] = ctx.message.text.split(/\s+/).slice(1);
  if (!txHash || !recipient) {
    await ctx.reply("Usage: /bridge <source_tx_hash> <recipient_address>");
    return;
  }

  try {
    const diagnosis = await diagnoseBridge(
      ETHEREUM_MAINNET_ID,
      X_LAYER_MAINNET_ID,
      txHash as Hash,
      recipient as Hex
    );
    await ctx.replyWithHTML(diagnosisToMessage(diagnosis));
  } catch (err) {
    await ctx.reply(`Couldn't check bridge status: ${err instanceof Error ? err.message : "unknown error"}`);
  }
});

// Auto-diagnose: a bare tx hash dropped into the chat (no command) triggers
// the same "drop a hash, get a fix" ticket-resolution flow as the Discord bot.
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

bot.on("text", async (ctx, next) => {
  const content = ctx.message.text.trim();
  if (!TX_HASH_RE.test(content)) return next();
  await respondWithDiagnosis(ctx, content);
});

async function respondWithDiagnosis(ctx: Context, txHash: string) {
  try {
    const diagnosis = await diagnoseTransaction(txHash, X_LAYER_MAINNET_ID);
    await ctx.replyWithHTML(diagnosisToMessage(diagnosis));
  } catch (err) {
    await ctx.reply(`Couldn't diagnose that: ${err instanceof Error ? err.message : "unknown error"}`);
  }
}

bot.launch();
console.log("Support Agent Telegram bot started.");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
