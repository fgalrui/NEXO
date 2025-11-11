import { Channel as M3UChannel } from './services/m3uParser';

// FIX: Removed circular import of 'Channel' which was causing a declaration conflict.
export interface Channel extends M3UChannel {
    name: string;
    url: string;
    logo?: string;
    group?: string;
    tvgId?: string;
}

export interface FavoritePlaylist {
    name: string;
    url: string;
    epgUrl?: string;
}

export interface SubtitleTrack {
  src: string; // Blob URL
  label: string;
  srclang: string;
}

// FIX: Define AudioTrack interface to resolve type errors.
export interface AudioTrack {
    id: string;
    kind: string;
    label: string;
    language: string;
    enabled: boolean;
}

export interface SubtitleSettings {
    size: 'small' | 'normal' | 'large';
    color: 'white' | 'yellow';
    background: boolean;
    offset: number;
}

export type LastWatchedMedia =
  | { type: 'iptv'; playlistUrl: string; channel: Channel; epgUrl?: string }
  | { type: 'torrent'; identifier: string; fileName: string };

export type ActiveMedia =
  | { type: 'iptv'; channels: Channel[]; playlistUrl?: string; initialChannel?: Channel; epgUrl?: string }
  | { type: 'torrent'; identifier: string | File; mode: 'stream' | 'download'; initialFile?: string }
  | { type: 'local'; file: File };

export interface EpgProgram {
    title: string;
    desc?: string;
    start: number; // UNIX Timestamp (ms)
    end: number;   // UNIX Timestamp (ms)
}

export type EpgData = Map<string, EpgProgram[]>;

export interface GeminiInfo {
    title: string;
    year: number;
    rating: string;
    summary: string;
    posterUrl: string;
}

export interface Chapter {
    timestamp: number;
    name: string;
}