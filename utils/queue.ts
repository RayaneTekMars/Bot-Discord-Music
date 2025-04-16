import { Guild } from 'discord.js';
import { VoiceConnection, AudioPlayer } from '@discordjs/voice';

export interface Song {
  title: string;
  url: string;
  channelId: string;
  guild: Guild;
}

export interface Queue {
  songs: Song[];
  connection: VoiceConnection | null;
  player: AudioPlayer | null;
}

const queues = new Map<string, Queue>();

export function getQueue(guildId: string): Queue | undefined {
  return queues.get(guildId);
}

export function setQueue(guildId: string, queue: Queue): void {
  queues.set(guildId, queue);
}

export function deleteQueue(guildId: string): void {
  queues.delete(guildId);
}

export function hasQueue(guildId: string): boolean {
  return queues.has(guildId);
} 