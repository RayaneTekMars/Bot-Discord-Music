import { Client, Collection, Events, GatewayIntentBits, REST, Routes, ChatInputCommandInteraction } from "discord.js";
import { config } from "dotenv";
import { Command } from "./types/Command";
import { join } from "path";
import { readdirSync } from "fs";
config();

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
  console.error("Token Discord ou Client ID manquant dans le fichier .env");
  process.exit(1);
}

class ExtendedClient extends Client {
  commands: Collection<string, Command>;
  constructor(options: any) {
    super(options);
    this.commands = new Collection<string, Command>();
  }
}

const client = new ExtendedClient({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const commandsPath = join(__dirname, "commands");
const commandFiles = readdirSync(commandsPath).filter((file) => file.endsWith(".ts") || file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = join(commandsPath, file);
  const command = require(filePath).default;

  if ("data" in command && "execute" in command) {
    client.commands.set(command.data.name, command);
    console.log(`Commande ${command.data.name} chargée avec succès`);
  } else {
    console.log(`La commande ${file} n'a pas de data ou execute`);
  }
}

const commands = []
for (const command of client.commands.values()) {
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    console.log("Démarrage de la synchronisation des commandes...");

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );

    console.log("Commandes synchronisées avec succès");
  } catch (error) {
    console.error(error);
  }
})()

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: "Une erreur est survenue lors de l'exécution de cette commande", ephemeral: true });
    } else {
      await interaction.reply({ content: "Une erreur est survenue lors de l'exécution de cette commande", ephemeral: true });
    }
  }
})

client.login(TOKEN);