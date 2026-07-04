import { REST, Routes, SlashCommandBuilder } from "discord.js";

const commands = [
  new SlashCommandBuilder()
    .setName("diagnose")
    .setDescription("Diagnose a failed (or successful) transaction")
    .addStringOption((opt) =>
      opt.setName("tx_hash").setDescription("Transaction hash, e.g. 0x1234...").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("approvals")
    .setDescription("Check a wallet's token approvals for risky/unlimited ones")
    .addStringOption((opt) => opt.setName("address").setDescription("Wallet address").setRequired(true))
    .addStringOption((opt) =>
      opt
        .setName("tokens")
        .setDescription("Comma-separated token addresses to check")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("bridge")
    .setDescription("Check whether a bridge transfer is in transit, needs a claim, or is stuck")
    .addStringOption((opt) =>
      opt.setName("tx_hash").setDescription("Source-chain transaction hash").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("recipient").setDescription("Recipient address on the destination chain").setRequired(true)
    ),
].map((c) => c.toJSON());

async function main() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID; // optional: instant registration for one server during dev

  if (!token || !clientId) {
    throw new Error("Set DISCORD_TOKEN and DISCORD_CLIENT_ID before deploying commands.");
  }

  const rest = new REST({ version: "10" }).setToken(token);

  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  await rest.put(route, { body: commands });
  console.log(`Registered ${commands.length} commands${guildId ? ` to guild ${guildId}` : " globally"}.`);
}

main().catch((err) => {
  console.error("Failed to deploy commands:", err);
  process.exit(1);
});
