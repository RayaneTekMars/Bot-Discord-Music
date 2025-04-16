// commands/queue.ts
import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command } from '../types/Command';
import { getQueue } from '../utils/queue';

const queue: Command = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Affiche la file d\'attente musicale actuelle'),
  
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    
    const guildId = interaction.guild.id;
    const queue = getQueue(guildId);
    
    if (!queue || queue.songs.length === 0) {
      await interaction.reply('❌ Il n\'y a aucune chanson dans la file d\'attente.');
      return;
    }
    
    // Créer un embed pour afficher la file d'attente
    const embed = new EmbedBuilder()
      .setTitle('🎵 File d\'attente musicale')
      .setColor('#0099ff')
      .setDescription(
        queue.songs.map((song, index) => 
          `${index === 0 ? '**En cours de lecture:**' : `**${index}.**`} ${song.title}`
        ).join('\n')
      )
      .setFooter({ text: `${queue.songs.length} chanson(s) dans la file d'attente` });
    
    await interaction.reply({ embeds: [embed] });
  },
};

export default queue;