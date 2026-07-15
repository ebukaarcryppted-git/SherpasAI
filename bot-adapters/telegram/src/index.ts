import { Telegraf, type Context } from "telegraf";
import {
  diagnoseTransaction,
  diagnoseApprovals,
  diagnoseBridge,
  safeErrorMessage,
  X_LAYER_MAINNET_ID,
  ETHEREUM_MAINNET_ID,
} from "@support-agent-asp/agent-core";
import type { Hash, Hex } from "viem";
import { diagnosisToMessage, approvalsToMessage } from "./format.js";
import { checkRateLimit } from "./rateLimit.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error("Set TELEGRAM_BOT_TOKEN in the environment before starting the bot.");
}

const RATE_LIMIT_PER_MINUTE = Number(process.env.TELEGRAM_RATE_LIMIT_PER_MINUTE ?? 5);

const bot = new Telegraf(token);

/** Returns false (and replies with a slow-down message) if the caller is over the per-user limit. */
async function withinRateLimit(ctx: Context): Promise<boolean> {
  const key = `telegram:${ctx.from?.id ?? ctx.chat?.id ?? "unknown"}`;
  const rateLimit = checkRateLimit(key, RATE_LIMIT_PER_MINUTE);
  if (!rateLimit.allowed) {
    await ctx.reply(`Too many requests — please wait ${rateLimit.retryAfterSeconds ?? 60}s and try again.`);
    return false;
  }
  return true;
}

bot.command("diagnose", async (ctx) => {
  if (!(await withinRateLimit(ctx))) return;

  const txHash = ctx.message.text.split(/\s+/)[1];
  if (!txHash) {
    await ctx.reply("Usage: /diagnose <tx_hash>");
    return;
  }
  await respondWithDiagnosis(ctx, txHash);
});

bot.command("approvals", async (ctx) => {
  if (!(await withinRateLimit(ctx))) return;

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
    await ctx.reply(safeErrorMessage(err, "Couldn't scan approvals — an unexpected error occurred.", "/approvals command failed:"));
  }
});

bot.command("bridge", async (ctx) => {
  if (!(await withinRateLimit(ctx))) return;

  const [txHash] = ctx.message.text.split(/\s+/).slice(1);
  if (!txHash) {
    await ctx.reply("Usage: /bridge <source_tx_hash>");
    return;
  }

  try {
    const diagnosis = await diagnoseBridge(
      ETHEREUM_MAINNET_ID,
      X_LAYER_MAINNET_ID,
      txHash as Hash
    );
    await ctx.replyWithHTML(diagnosisToMessage(diagnosis));
  } catch (err) {
    await ctx.reply(safeErrorMessage(err, "Couldn't check bridge status — an unexpected error occurred.", "/bridge command failed:"));
  }
});

// Auto-diagnose: a bare tx hash dropped into the chat (no command) triggers
// the same "drop a hash, get a fix" ticket-resolution flow as the Discord bot.
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

bot.on("text", async (ctx, next) => {
  const content = ctx.message.text.trim();
  if (!TX_HASH_RE.test(content)) return next();

  const key = `telegram:${ctx.from?.id ?? ctx.chat?.id ?? "unknown"}`;
  if (!checkRateLimit(key, RATE_LIMIT_PER_MINUTE).allowed) return; // stay silent, same as an unresolved hash

  await respondWithDiagnosis(ctx, content);
});

async function respondWithDiagnosis(ctx: Context, txHash: string) {
  try {
    const diagnosis = await diagnoseTransaction(txHash, X_LAYER_MAINNET_ID);
    await ctx.replyWithHTML(diagnosisToMessage(diagnosis));
  } catch (err) {
    await ctx.reply(safeErrorMessage(err, "Couldn't diagnose that — an unexpected error occurred.", "diagnose command failed:"));
  }
}

bot.launch();
console.log("Support Agent Telegram bot started.");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
