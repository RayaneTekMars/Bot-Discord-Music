// utils/spotify.ts
import SpotifyWebApi from 'spotify-web-api-node';
import { config } from 'dotenv';
import { YouTube } from 'youtube-sr';

config();

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
  console.error('⚠️ Identifiants Spotify manquants dans le fichier .env');
}

const spotifyApi = new SpotifyWebApi({
  clientId: SPOTIFY_CLIENT_ID,
  clientSecret: SPOTIFY_CLIENT_SECRET
});

// Fonction pour rafraîchir le token Spotify
export async function refreshSpotifyToken() {
  try {
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(data.body.access_token);
    console.log('✅ Token Spotify actualisé avec succès');
    
    // Programmer le prochain rafraîchissement avant expiration (1 heure)
    const expiresIn = data.body.expires_in;
    setTimeout(refreshSpotifyToken, (expiresIn - 60) * 1000); // Actualiser 1 minute avant l'expiration
  } catch (error) {
    console.error('❌ Erreur lors de l\'actualisation du token Spotify:', error);
    // Réessayer après 30 secondes en cas d'échec
    setTimeout(refreshSpotifyToken, 30000);
  }
}

// Initialisation: obtenir le token au démarrage
refreshSpotifyToken();

// Interface pour définir la structure d'une piste
interface TrackInfo {
  searchQuery: string;
  title: string;
}

// Fonction pour extraire l'ID Spotify d'une URL
function extractSpotifyId(url: string): { id: string, type: 'track' | 'album' | 'playlist' } | null {
  // Piste: https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh
  // Piste (avec paramètres): https://open.spotify.com/intl-fr/track/0eaVIYo2zeOaGJeqZ5TwYz?si=9036d71b44164db2
  // Album: https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3
  // Playlist: https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
  
  // Nettoyer l'URL en retirant les paramètres et le préfixe intl-fr
  const cleanUrl = url.split('?')[0].replace('/intl-fr/', '/');
  
  const trackMatch = cleanUrl.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
  if (trackMatch) return { id: trackMatch[1], type: 'track' };
  
  const albumMatch = cleanUrl.match(/spotify\.com\/album\/([a-zA-Z0-9]+)/);
  if (albumMatch) return { id: albumMatch[1], type: 'album' };
  
  const playlistMatch = cleanUrl.match(/spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
  if (playlistMatch) return { id: playlistMatch[1], type: 'playlist' };
  
  return null;
}

// Fonction pour obtenir une piste Spotify et la rechercher sur YouTube
export async function getSpotifyTrack(url: string): Promise<TrackInfo[]> {
  const spotifyInfo = extractSpotifyId(url);
  
  if (!spotifyInfo) {
    throw new Error('URL Spotify invalide');
  }
  
  try {
    let tracks: TrackInfo[] = [];
    
    if (spotifyInfo.type === 'track') {
      // Obtenir les détails de la piste
      const trackData = await spotifyApi.getTrack(spotifyInfo.id);
      const trackName = trackData.body.name;
      const artistName = trackData.body.artists[0].name;
      
      tracks.push({
        searchQuery: `${trackName} ${artistName}`,
        title: `${trackName} - ${artistName}`
      });
    } else if (spotifyInfo.type === 'album') {
      // Obtenir toutes les pistes de l'album
      const albumData = await spotifyApi.getAlbum(spotifyInfo.id);
      const trackItems = albumData.body.tracks.items;
      
      // Retourner un tableau de requêtes de recherche et titres
      tracks = trackItems.map(track => ({
        searchQuery: `${track.name} ${track.artists[0].name}`,
        title: `${track.name} - ${track.artists[0].name}`
      }));
    } else if (spotifyInfo.type === 'playlist') {
      // Obtenir toutes les pistes de la playlist
      const playlistData = await spotifyApi.getPlaylist(spotifyInfo.id);
      const trackItems = playlistData.body.tracks.items;
      
      // Retourner un tableau de requêtes de recherche et titres
      tracks = trackItems
        .filter(item => item.track !== null)
        .map(item => ({
          searchQuery: `${item.track!.name} ${item.track!.artists[0].name}`,
          title: `${item.track!.name} - ${item.track!.artists[0].name}`
        }));
    }
    
    if (tracks.length === 0) {
      throw new Error('Aucune piste trouvée');
    }
    
    return tracks;
  } catch (error) {
    console.error('Erreur lors de la récupération des informations Spotify:', error);
    throw error;
  }
}

// Fonction pour rechercher une piste sur YouTube à partir d'une requête
export async function searchYouTube(query: string) {
  try {
    const search = await YouTube.search(query, { limit: 1, type: 'video' });
    
    if (search.length === 0) {
      throw new Error(`Aucun résultat YouTube trouvé pour: ${query}`);
    }
    
    return {
      title: search[0].title || query,
      url: `https://www.youtube.com/watch?v=${search[0].id}`
    };
  } catch (error) {
    console.error('Erreur lors de la recherche YouTube:', error);
    throw error;
  }
}