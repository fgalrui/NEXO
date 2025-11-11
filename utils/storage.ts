import { Channel, FavoritePlaylist, LastWatchedMedia, SubtitleSettings, EpgData, GeminiInfo, Chapter } from '../types';

const IPTV_HISTORY_KEY = 'nexo_iptv_history';
const RECENT_MAGNETS_KEY = 'nexo_recent_magnets';
const FAVORITE_CHANNELS_KEY = 'nexo_favorite_channels';
const FAVORITE_PLAYLISTS_KEY = 'nexo_favorite_playlists_v3';
const IPTV_PLAYLIST_CACHE_KEY = 'nexo_iptv_playlist_cache';
const EPG_CACHE_KEY = 'nexo_epg_cache';
const LAST_WATCHED_KEY = 'nexo_last_watched';
const SUBTITLE_SETTINGS_KEY = 'nexo_subtitle_settings';
const PLAYBACK_POSITION_KEY = 'nexo_playback_positions';
const GEMINI_CACHE_KEY = 'nexo_gemini_cache';
const GEMINI_CHAPTERS_CACHE_KEY = 'nexo_gemini_chapters_cache';
const MAX_RECENT_MAGNETS = 5;
const MAX_IPTV_HISTORY = 10;
const PLAYLIST_CACHE_DURATION_MS = 1 * 60 * 60 * 1000; // 1 hour
const EPG_CACHE_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours
const GEMINI_CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const EXAMPLE_MAGNET = 'magnet:?xt=urn:btih:7943AA61FAF369A2106790BFAE6002D6438B2B57&dn=Robin%20Hood%202025%20S01E03%20XviD-AFG&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce&tr=udp%3A%2F%2Ftracker.torrent.eu.org%3A451%2Fannounce&tr=udp%3A%2F%2Ftracker.bittor.pw%3A1337%2Fannounce&tr=udp%3A%2F%2Fpublic.popcorn-tracker.org%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.dler.org%3A6969%2Fannounce&tr=udp%3A%2F%2Fexodus.desync.com%3A6969&tr=udp%3A%2F%2Fopen.demonii.com%3A1337%2Fannounce';


// Interfaces for caching
interface CachedData<T> {
    data: T;
    expiresAt: number;
}

interface Cache<T> {
    [url: string]: CachedData<T>;
}

// Generic cache handler
const getFromCache = <T>(key: string, url: string): T | null => {
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    try {
        const cache: Cache<T> = JSON.parse(stored);
        const entry = cache[url];

        if (entry && Date.now() < entry.expiresAt) {
            return entry.data;
        }

        if (entry) {
            delete cache[url];
            localStorage.setItem(key, JSON.stringify(cache));
        }
        
        return null;
    } catch (e) {
        console.error(`Error reading from cache key ${key}`, e);
        localStorage.removeItem(key);
        return null;
    }
};

const saveToCache = <T>(key: string, url: string, data: T, durationMs: number): void => {
     const stored = localStorage.getItem(key);
    let cache: Cache<T> = {};

    if (stored) {
        try {
            cache = JSON.parse(stored);
        } catch (e) {
            console.error(`Could not parse existing cache for key ${key}, starting fresh.`, e);
            cache = {};
        }
    }

    cache[url] = {
        data,
        expiresAt: Date.now() + durationMs,
    };

    localStorage.setItem(key, JSON.stringify(cache));
};

// Gemini AI Chapters Cache
export const getChaptersFromCache = (key: string): Chapter[] | null => getFromCache<Chapter[]>(GEMINI_CHAPTERS_CACHE_KEY, key);
export const cacheChapters = (key: string, data: Chapter[]): void => saveToCache(GEMINI_CHAPTERS_CACHE_KEY, key, data, GEMINI_CACHE_DURATION_MS);

// Gemini AI Cache
export const getGeminiInfoFromCache = (key: string): GeminiInfo | null => getFromCache<GeminiInfo>(GEMINI_CACHE_KEY, key);
export const cacheGeminiInfo = (key: string, data: GeminiInfo): void => saveToCache(GEMINI_CACHE_KEY, key, data, GEMINI_CACHE_DURATION_MS);

// Subtitle Settings
const defaultSubtitleSettings: SubtitleSettings = {
    size: 'normal',
    color: 'white',
    background: true,
    offset: 0,
};

export const getSubtitleSettings = (): SubtitleSettings => {
    const stored = localStorage.getItem(SUBTITLE_SETTINGS_KEY);
    if (!stored) return defaultSubtitleSettings;
    try {
        const parsed = JSON.parse(stored);
        return { ...defaultSubtitleSettings, ...parsed };
    } catch (e) {
        return defaultSubtitleSettings;
    }
};

export const setSubtitleSettings = (settings: SubtitleSettings): void => {
    localStorage.setItem(SUBTITLE_SETTINGS_KEY, JSON.stringify(settings));
};

// Playback Position
type PlaybackPositions = { [mediaId: string]: number };

export const getPlaybackPosition = (mediaId: string): number | null => {
    const stored = localStorage.getItem(PLAYBACK_POSITION_KEY);
    if (!stored) return null;
    try {
        const positions: PlaybackPositions = JSON.parse(stored);
        return positions[mediaId] || null;
    } catch {
        return null;
    }
};

export const setPlaybackPosition = (mediaId: string, time: number): void => {
    const stored = localStorage.getItem(PLAYBACK_POSITION_KEY);
    let positions: PlaybackPositions = {};
    if (stored) {
        try {
            positions = JSON.parse(stored);
        } catch {
            positions = {};
        }
    }
    positions[mediaId] = time;
    localStorage.setItem(PLAYBACK_POSITION_KEY, JSON.stringify(positions));
};

export const clearPlaybackPosition = (mediaId: string): void => {
     const stored = localStorage.getItem(PLAYBACK_POSITION_KEY);
    if (!stored) return;
    try {
        const positions: PlaybackPositions = JSON.parse(stored);
        delete positions[mediaId];
        localStorage.setItem(PLAYBACK_POSITION_KEY, JSON.stringify(positions));
    } catch {
        // Ignore parsing errors
    }
};


// Playlist Caching
export const getPlaylistFromCache = (url: string): Channel[] | null => getFromCache<Channel[]>(IPTV_PLAYLIST_CACHE_KEY, url);
export const cachePlaylist = (url: string, channels: Channel[]): void => saveToCache(IPTV_PLAYLIST_CACHE_KEY, url, channels, PLAYLIST_CACHE_DURATION_MS);

// EPG Caching
export const getEpgFromCache = (url: string): EpgData | null => {
    const cached = getFromCache<[string, any[]][]>(EPG_CACHE_KEY, url);
    return cached ? new Map(cached) : null;
};
export const cacheEpg = (url: string, data: EpgData): void => {
    saveToCache(EPG_CACHE_KEY, url, Array.from(data.entries()), EPG_CACHE_DURATION_MS);
};

// Last Watched Media
export const getLastWatchedMedia = (): LastWatchedMedia | null => {
    const stored = localStorage.getItem(LAST_WATCHED_KEY);
    if (!stored) return null;
    try {
        return JSON.parse(stored);
    } catch (e) {
        console.error("Error reading last watched media", e);
        return null;
    }
};

export const setLastWatchedMedia = (media: LastWatchedMedia | null): void => {
    if (media) {
        localStorage.setItem(LAST_WATCHED_KEY, JSON.stringify(media));
    } else {
        localStorage.removeItem(LAST_WATCHED_KEY);
    }
};


// IPTV History
export const getIptvHistory = (): string[] => {
    const stored = localStorage.getItem(IPTV_HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
};

export const addIptvUrl = (url: string): void => {
    let history = getIptvHistory();
    history = history.filter(h => h !== url); // Remove if exists to move to top
    history.unshift(url);
    if (history.length > MAX_IPTV_HISTORY) {
        history = history.slice(0, MAX_IPTV_HISTORY);
    }
    localStorage.setItem(IPTV_HISTORY_KEY, JSON.stringify(history));
};

export const removeIptvUrl = (url: string): void => {
    const history = getIptvHistory().filter(h => h !== url);
    localStorage.setItem(IPTV_HISTORY_KEY, JSON.stringify(history));
};

// Recent Magnets
export const getRecentMagnets = (): string[] => {
    const stored = localStorage.getItem(RECENT_MAGNETS_KEY);

    // If there is nothing in storage at all, return the example magnet.
    if (stored === null) {
        return [EXAMPLE_MAGNET];
    }

    // If there is something in storage, try to parse it.
    try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
            return parsed; // Return the stored array, even if it's empty.
        }
    } catch (e) {
        console.error("Error reading recent magnets from storage, returning empty.", e);
    }
    
    // Fallback for corrupt data or non-array data.
    return [];
};

export const addRecentMagnet = (magnet: string): void => {
    if (!magnet.startsWith('magnet:?')) return;
    let recents = getRecentMagnets();
    recents = recents.filter(m => m !== magnet); // Remove duplicates to avoid re-ordering
    recents.unshift(magnet); // Add to the top
    if (recents.length > MAX_RECENT_MAGNETS) {
        recents = recents.slice(0, MAX_RECENT_MAGNETS);
    }
    localStorage.setItem(RECENT_MAGNETS_KEY, JSON.stringify(recents));
};

// Favorite IPTV Playlists (new object format)
export const getFavoritePlaylists = (): FavoritePlaylist[] => {
    const stored = localStorage.getItem(FAVORITE_PLAYLISTS_KEY);
    return stored ? JSON.parse(stored) : [];
};

export const setFavoritePlaylists = (playlists: FavoritePlaylist[]): void => {
    localStorage.setItem(FAVORITE_PLAYLISTS_KEY, JSON.stringify(playlists));
};

export const addFavoritePlaylist = (playlist: FavoritePlaylist): void => {
    const favorites = getFavoritePlaylists();
    if (!favorites.some(fav => fav.url === playlist.url)) {
        setFavoritePlaylists([...favorites, playlist]);
    }
};

export const removeFavoritePlaylist = (url: string): void => {
    const favorites = getFavoritePlaylists().filter(fav => fav.url !== url);
    setFavoritePlaylists(favorites);
};

export const updateFavoritePlaylist = (url: string, newName: string, newEpgUrl?: string): void => {
    const favorites = getFavoritePlaylists().map(fav => 
        fav.url === url ? { ...fav, name: newName, epgUrl: newEpgUrl || fav.epgUrl } : fav
    );
    setFavoritePlaylists(favorites);
};


// Favorite Channels
export const getFavoriteChannels = (): Channel[] => {
    const stored = localStorage.getItem(FAVORITE_CHANNELS_KEY);
    return stored ? JSON.parse(stored) : [];
};

export const setFavoriteChannels = (channels: Channel[]): void => {
    localStorage.setItem(FAVORITE_CHANNELS_KEY, JSON.stringify(channels));
};