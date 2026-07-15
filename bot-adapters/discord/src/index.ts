import { Client, GatewayIntentBits, Events } from "discord.js";
import { diagnoseTransaction, diagnoseApprovals, diagnoseBridge, safeErrorMessage, X_LAYER_MAINNET_ID, ETHEREUM_MAINNET_ID } from "@support-agent-asp/agent-core";
import type { Hash, Hex } from "viem";
import { diagnosisToEmbed } from "./format.js";
import { checkRateLimit } from "./rateLimit.js";

const token = process.env.DISCORD_TOKEN;
if (!token) {
  throw new Error("Set DISCORD_TOKEN in the environment before starting the bot.");
}

const RATE_LIMIT_PER_MINUTE = Number(process.env.DISCORD_RATE_LIMIT_PER_MINUTE ?? 5);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`Support Agent Discord bot logged in as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const rateLimit = checkRateLimit(`discord:${interaction.user.id}`, RATE_LIMIT_PER_MINUTE);
  if (!rateLimit.allowed) {
    await interaction.reply({
      content: `Too many requests — please wait ${rateLimit.retryAfterSeconds ?? 60}s and try again.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  try {
    if (interaction.commandName === "diagnose") {
      const txHash = interaction.options.getString("tx_hash", true);
      const diagnosis = await diagnoseTransaction(txHash, X_LAYER_MAINNET_ID);
      await interaction.editReply({ embeds: [diagnosisToEmbed(diagnosis)] });
      return;
    }

    if (interaction.commandName === "approvals") {
      const address = interaction.options.getString("address", true) as Hex;
      const tokens = interaction.options
        .getString("tokens", true)
        .split(",")
        .map((t) => t.trim()) as Hex[];

      const report = await diagnoseApprovals(X_LAYER_MAINNET_ID, address, tokens);
      const lines = report.findings.map(
        (f) => `**${f.tokenSymbol}** → \`${f.spender}\` — ${f.unlimited ? "⚠️ UNLIMITED" : "limited"}`
      );

      await interaction.editReply({
        content: [
          `**${report.summary}**`,
          ...(lines.length > 0 ? lines : ["No active approvals found."]),
          ...(report.recommendations.length > 0
            ? ["", "**Recommendations:**", ...report.recommendations.map((r) => `- ${r}`)]
            : []),
        ].join("\n"),
      });
      return;
    }

    if (interaction.commandName === "bridge") {
      const txHash = interaction.options.getString("tx_hash", true) as Hash;
      const diagnosis = await diagnoseBridge(
        ETHEREUM_MAINNET_ID,
        X_LAYER_MAINNET_ID,
        txHash
      );
      await interaction.editReply({ embeds: [diagnosisToEmbed(diagnosis)] });
      return;
    }
  } catch (err) {
    const message = safeErrorMessage(err, "Couldn't complete that — an unexpected error occurred.", "Discord command failed:");
    await interaction.editReply({ content: message });
  }
});

// Auto-diagnose: if someone just pastes a bare tx hash in a support channel
// (no slash command), respond automatically — this is the "drop a hash,
// get a fix" ticket flow the bot exists for.
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim();
  if (!TX_HASH_RE.test(content)) return;

  const rateLimit = checkRateLimit(`discord:${message.author.id}`, RATE_LIMIT_PER_MINUTE);
  if (!rateLimit.allowed) return; // stay silent, same as the "fails to resolve" case below

  try {
    const diagnosis = await diagnoseTransaction(content, X_LAYER_MAINNET_ID);
    await message.reply({ embeds: [diagnosisToEmbed(diagnosis)] });
  } catch {
    // stay silent on unrelated bare-hex messages that happen to match the pattern but fail to resolve
  }
});

client.login(token);

// Re-exported for tests / programmatic use without booting the whole client.
export { diagnosisToEmbed } from "./format.js";
export { client };
