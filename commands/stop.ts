// commands/stop.ts
import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../types/Command';
import { getQueue, deleteQueue } from '../utils/queue';

const stop: Command = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Arrête la lecture et vide la file d\'attente'),
  
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild || !interaction.member) return;
    
    const guildId = interaction.guild.id;
    const queue = getQueue(guildId);
    
    if (!queue) {
      await interaction.reply('❌ Il n\'y a aucune chanson en cours de lecture.');
      return;
    }
    
    if (!('voice' in interaction.member) || !interaction.member.voice.channel) {
      await interaction.reply('❌ Vous devez être dans un canal vocal pour utiliser cette commande.');
      return;
    }
    
    // Vider la file d'attente et arrêter la lecture
    if (queue.player) {
      queue.player.stop();
    }
    if (queue.connection) {
      queue.connection.destroy();
    }
    deleteQueue(guildId);
    
    await interaction.reply('⏹️ Lecture arrêtée et file d\'attente vidée.');
  },
};

export default stop;