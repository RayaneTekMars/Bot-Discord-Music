import { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import { Command } from '../types/Command';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior } from '@discordjs/voice';
import play from 'play-dl';
import { getQueue, setQueue, deleteQueue, Song } from '../utils/queue';

const playCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Joue une musique depuis YouTube ou Spotify')
    .addStringOption(option =>
      option.setName('url')
        .setDescription('L\'URL YouTube ou Spotify de la musique ou un terme de recherche')
        .setRequired(true)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    
    const query = interaction.options.getString('url', true);
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
    
    await interaction.deferReply();
    
    try {
      let songInfo;
      
      // Déterminer le type d'URL (YouTube, Spotify) ou recherche
      if (play.yt_validate(query) === 'video') {
        // URL YouTube directe
        songInfo = await play.video_info(query);
      } else if (play.yt_validate(query) === 'playlist') {
        // Playlist YouTube - pour l'instant, on ne prend que la première vidéo
        const playlist = await play.playlist_info(query);
        const videos = await playlist.all_videos();
        if (videos.length === 0) {
          await interaction.editReply('❌ Aucune vidéo trouvée dans cette playlist.');
          return;
        }
        songInfo = await play.video_info(videos[0].url);
      } else if (play.sp_validate(query) === 'track') {
        // Piste Spotify
        const spotifyInfo = await play.spotify(query);
        const searched = await play.search(`${spotifyInfo.name} ${('artists' in spotifyInfo) ? spotifyInfo.artists[0]?.name : ''}`, {
          limit: 1
        });
        if (searched.length === 0) {
          await interaction.editReply('❌ Aucune piste YouTube correspondante trouvée.');
          return;
        }
        songInfo = await play.video_info(searched[0].url);
      } else if (play.sp_validate(query) === 'album' || play.sp_validate(query) === 'playlist') {
        // Album ou playlist Spotify - pour l'instant, on ne prend que la première piste
        const spotifyInfo = await play.spotify(query);
        if (!('tracks' in spotifyInfo) || !Array.isArray(spotifyInfo.tracks) || spotifyInfo.tracks.length === 0) {
          await interaction.editReply('❌ Aucune piste trouvée dans cet album/playlist Spotify.');
          return;
        }
        const firstTrack = spotifyInfo.tracks[0];
        const searched = await play.search(`${firstTrack.name} ${('artists' in firstTrack && Array.isArray(firstTrack.artists)) ? firstTrack.artists[0]?.name : ''}`, {
          limit: 1
        });
        if (searched.length === 0) {
          await interaction.editReply('❌ Aucune piste YouTube correspondante trouvée.');
          return;
        }
        songInfo = await play.video_info(searched[0].url);
      } else {
        // Recherche YouTube par mots-clés
        const searched = await play.search(query, {
          limit: 1
        });
        if (searched.length === 0) {
          await interaction.editReply('❌ Aucun résultat trouvé.');
          return;
        }
        songInfo = await play.video_info(searched[0].url);
      }
      
      // Créer l'objet chanson
      const song: Song = {
        title: songInfo.video_details.title || 'Titre inconnu',
        url: songInfo.video_details.url,
        channelId: voiceChannel.id,
        guild: interaction.guild,
        duration: songInfo.video_details.durationInSec
      };
      
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
        await playSong(guildId, song);
      }
      
      await interaction.editReply(`✅ **${song.title}** a été ajoutée à la file d'attente.`);
    } catch (error) {
      console.error('Erreur lors de la lecture:', error);
      let errorMessage = '❌ Une erreur est survenue lors de la lecture de la musique.';
      
      if (error instanceof Error) {
        if (error.message.includes('private')) {
          errorMessage = '❌ Cette vidéo est privée ou non disponible.';
        } else if (error.message.includes('age')) {
          errorMessage = '❌ Cette vidéo est restreinte par âge.';
        } else if (error.message.includes('region')) {
          errorMessage = '❌ Cette vidéo n\'est pas disponible dans votre région.';
        } else if (error.message.includes('sign in')) {
          errorMessage = '❌ Cette vidéo nécessite une connexion pour être visionnée.';
        }
      }
      
      await interaction.editReply(errorMessage);
    }
  },
};

// Fonction pour jouer une chanson
async function playSong(guildId: string, song: Song) {
  const queue = getQueue(guildId);
  if (!queue) return;
  
  try {
    // Créer un lecteur audio avec un comportement défini
    const player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause,
      },
    });
    
    // Obtenir le stream avec play-dl
    const stream = await play.stream(song.url);
    
    // Créer la ressource audio avec le stream
    const resource = createAudioResource(stream.stream, {
      inputType: stream.type,
    });
    
    // Jouer la ressource
    player.play(resource);
    
    // Créer la connexion vocale
    const connection = joinVoiceChannel({
      channelId: song.channelId,
      guildId: guildId,
      adapterCreator: song.guild.voiceAdapterCreator
    });
    
    // Abonner la connexion au lecteur
    connection.subscribe(player);
    
    queue.connection = connection;
    queue.player = player;
    
    // Gestionnaire d'événements pour quand la chanson se termine
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
    
    // Gestionnaire d'erreur
    player.on('error', (error) => {
      console.error('Erreur du lecteur audio:', error);
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
  } catch (error) {
    console.error('Erreur lors de la lecture:', error);
    
    const currentQueue = getQueue(guildId);
    if (!currentQueue) return;
    
    currentQueue.songs.shift();
    if (currentQueue.songs.length > 0) {
      playSong(guildId, currentQueue.songs[0]);
    } else {
      if (currentQueue.connection) {
        currentQueue.connection.destroy();
      }
      deleteQueue(guildId);
    }
  }
}

export default playCommand;