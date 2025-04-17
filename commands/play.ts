import { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import { Command } from '../types/Command';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } from '@discordjs/voice';
import ytdl from '@distube/ytdl-core';
import { getQueue, setQueue, deleteQueue, Song } from '../utils/queue';
import { getSpotifyTrack, searchYouTube } from '../utils/spotify';

const play: Command = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Joue une musique depuis YouTube ou Spotify')
    .addStringOption(option =>
      option.setName('url')
        .setDescription('L\'URL YouTube ou Spotify de la musique')
        .setRequired(true)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    
    const url = interaction.options.getString('url', true);
    const guildId = interaction.guild.id;
    
    if (!interaction.member || !('voice' in interaction.member)) {
      await interaction.reply('❌ Vous devez être dans un canal vocal pour utiliser cette commande.');
      return;
    }
    
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
      await interaction.reply('❌ Vous devez être dans un canal vocal pour utiliser cette commande.');
      return;
    }
    
    try {
      let song: Song;
      
      // Vérifier si c'est une URL Spotify
      if (url.includes('spotify.com')) {
        const tracks = await getSpotifyTrack(url);
        const youtubeResults = await Promise.all(tracks.map(track => searchYouTube(track.searchQuery)));
        
        // Pour l'instant, on ne prend que la première piste
        const firstResult = youtubeResults[0];
        song = {
          title: firstResult.title,
          url: firstResult.url,
          channelId: voiceChannel.id,
          guild: interaction.guild
        };
      } else {
        // URL YouTube
        const songInfo = await ytdl.getInfo(url);
        song = {
          title: songInfo.videoDetails.title,
          url: url,
          channelId: voiceChannel.id,
          guild: interaction.guild
        };
      }
      
      let queue = getQueue(guildId);
      if (!queue) {
        queue = {
          songs: [],
          connection: null,
          player: null
        };
        setQueue(guildId, queue);
      }
      
      queue.songs.push(song);
      
      if (queue.songs.length === 1) {
        playSong(guildId, song);
      }
      
      await interaction.reply(`✅ ${song.title} a été ajoutée à la file d'attente.`);
    } catch (error) {
      console.error('Erreur lors de la lecture:', error);
      let errorMessage = '❌ Une erreur est survenue lors de la lecture de la musique.';
      
      if (error instanceof Error) {
        if (error.message.includes('private video')) {
          errorMessage = '❌ Cette vidéo est privée ou non disponible.';
        } else if (error.message.includes('age restricted')) {
          errorMessage = '❌ Cette vidéo est restreinte par âge.';
        } else if (error.message.includes('region restricted')) {
          errorMessage = '❌ Cette vidéo n\'est pas disponible dans votre région.';
        } else if (error.message.includes('URL Spotify invalide')) {
          errorMessage = '❌ L\'URL Spotify est invalide.';
        } else if (error.message.includes('Aucune piste trouvée')) {
          errorMessage = '❌ Aucune piste trouvée sur Spotify.';
        }
      }
      
      await interaction.reply(errorMessage);
    }
  },
};

// Fonction pour jouer une chanson
function playSong(guildId: string, song: Song) {
  const queue = getQueue(guildId);
  if (!queue) return;
  
  const player = createAudioPlayer();
  const resource = createAudioResource(ytdl(song.url, { 
    filter: 'audioonly',
    quality: 'highestaudio',
    highWaterMark: 1 << 25,
    requestOptions: {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    }
  }));
  
  player.play(resource);
  
  const connection = joinVoiceChannel({
    channelId: song.channelId,
    guildId: guildId,
    adapterCreator: song.guild.voiceAdapterCreator
  });
  
  connection.subscribe(player);
  
  queue.connection = connection;
  queue.player = player;
  
  player.on(AudioPlayerStatus.Idle, () => {
    const currentQueue = getQueue(guildId);
    if (!currentQueue) return;
    
    currentQueue.songs.shift();
    if (currentQueue.songs.length > 0) {
      playSong(guildId, currentQueue.songs[0]);
    } else {
      connection.destroy();
      deleteQueue(guildId);
    }
  });
}

export default play;