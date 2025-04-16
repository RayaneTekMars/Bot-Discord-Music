// commands/skip.ts
import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../types/Command';
import { getQueue } from '../utils/queue';

const skip: Command = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Passe à la chanson suivante dans la file d\'attente'),
  
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
    
    if (queue.songs.length <= 1) {
      await interaction.reply('🎵 Il n\'y a pas de chanson suivante dans la file d\'attente.');
      return;
    }
    
    // Passer la chanson en cours
    if (queue.player) {
      queue.player.stop();
      await interaction.reply('⏭️ Chanson passée !');
    }
  },
};

export default skip;