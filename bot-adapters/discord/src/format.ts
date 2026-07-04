import { EmbedBuilder } from "discord.js";
import type { Diagnosis } from "@support-agent-asp/agent-core";

const MODE_COLOR: Record<Diagnosis["mode"], number> = {
  slippage: 0xe0523f,
  allowance: 0xe0523f,
  wrong_network: 0xe0523f,
  reverted_other: 0xe0523f,
  bridge_stuck: 0xe0a530,
  gas_too_low: 0xe0a530,
  nonce_gap: 0xe0a530,
  pending: 0xe0a530,
  not_found: 0xe0a530,
  healthy: 0x3fc98a,
};

/** Turns an agent-core Diagnosis into a Discord embed a support bot can post directly. */
export function diagnosisToEmbed(diagnosis: Diagnosis): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(MODE_COLOR[diagnosis.mode] ?? 0x8fa396)
    .setTitle(diagnosis.headline)
    .setDescription(`**Fix:** ${diagnosis.fix}`)
    .setFooter({ text: diagnosis.chainLabel ?? "Support Agent ASP" });

  if (diagnosis.hash) {
    embed.addFields({ name: "Transaction", value: `\`${diagnosis.hash}\``, inline: false });
  }

  const detailEntries = Object.entries(diagnosis.details);
  if (detailEntries.length > 0) {
    embed.addFields(
      detailEntries.map(([name, value]) => ({
        name,
        value: value.length > 1000 ? `${value.slice(0, 1000)}…` : value,
        inline: true,
      }))
    );
  }

  return embed;
}
