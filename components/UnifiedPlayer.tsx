import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { zip } from 'fflate';
import { ActiveMedia, Channel, SubtitleTrack, AudioTrack, SubtitleSettings, EpgData, GeminiInfo, Chapter } from '../types';
import Sidebar from './Sidebar';
import Player from './Player';
import Controls from './Controls';
import { BackIcon, MenuIcon, SearchIcon, ListIcon, QueueIcon, CloseIcon, ExitCompactIcon, StarIcon, StarFilledIcon, DownloadIcon, CheckIcon, InfoIcon, SparklesIcon } from './icons';
import { setLastWatchedMedia, getSubtitleSettings, setSubtitleSettings, getEpgFromCache, cacheEpg, setPlaybackPosition, getPlaybackPosition, clearPlaybackPosition, getGeminiInfoFromCache, cacheGeminiInfo, getChaptersFromCache, cacheChapters } from '../utils/storage';
import { parseXMLTV } from '../services/epgParser';
import { getContentInfo, getVideoChapters } from '../services/geminiService';
import { useChromecast } from '../hooks/useChromecast';
import MediaInfo from './MediaInfo';
import EpgGrid from './EpgGrid';

// Define types for WebTorrent to avoid breaking the code after removing the import
interface TorrentFile {
    name: string;
    length: number;
    select(): void;
    deselect(): void;
    renderTo(element: HTMLVideoElement, options?: any, callback?: () => void): void;
    getBlobURL(callback: (err: Error | null, url: string | null) => void): void;
    getBlob(callback: (err: Error | null, blob: Blob | null) => void): void;
    done: boolean;
}

interface Torrent {
    name: string;
    files: TorrentFile[];
    progress: number;
    downloadSpeed: number;
    uploadSpeed: number;
    downloaded: number;
    length: number;
    numPeers: number;
    ready: boolean;
    infoHash: string;
    on(event: string, callback: (...args: any[]) => void): void;
    metadata?: any;
}

interface WebTorrentInstance {
    add(identifier: string | File, callback: (torrent: Torrent) => void): void;
    destroy(callback: () => void): void;
}

type DownloadQueueItem = {
    file: TorrentFile;
    status: 'queued' | 'preparing' | 'downloading' | 'done' | 'error';
    error?: string;
    url?: string;
};

// Helper to convert SRT to VTT format for broader browser support
const srtToVtt = (srtText: string): string => {
    let vttText = "WEBVTT\n\n";
    const lines = srtText.trim().replace(/\r/g, '').split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('-->')) {
            const timeLine = lines[i].replace(/,/g, '.');
            vttText += timeLine + '\n';
            i++;
            while (i < lines.length && lines[i].trim() !== '') {
                vttText += lines[i] + '\n';
                i++;
            }
            vttText += '\n';
        }
    }
    return vttText;
};

const formatTimeRemaining = (totalSeconds: number): string => {
    if (totalSeconds === Infinity || isNaN(totalSeconds) || totalSeconds < 0) {
        return '∞';
    }
    if (totalSeconds < 1) {
        return 'Done';
    }

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (hours === 0 && seconds > 0) parts.push(`${seconds}s`);
    
    return parts.join(' ') || '...';
};

const formatTime = (timeInSeconds: number) => {
    if (isNaN(timeInSeconds) || timeInSeconds === Infinity) return '00:00';
    const date = new Date(0);
    date.setSeconds(timeInSeconds);
    const requiresHours = date.getUTCHours() > 0;
    return date.toISOString().substr(requiresHours ? 11 : 14, requiresHours ? 8 : 5);
};

interface FileInfoModalProps {
    info: GeminiInfo;
    onClose: () => void;
}

const FileInfoModal: React.FC<FileInfoModalProps> = ({ info, onClose }) => (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 transition-opacity animate-fade-in-fast" onClick={onClose}>
        <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-md m-4 relative flex flex-col sm:flex-row" onClick={e => e.stopPropagation()}>
            <img src={info.posterUrl} alt={info.title} className="w-full sm:w-1/3 h-auto object-cover rounded-t-lg sm:rounded-l-lg sm:rounded-t-none" />
            <div className="p-6 flex-1">
                <h2 className="text-2xl font-bold text-white">{info.title}</h2>
                <div className="flex items-center space-x-4 text-sm text-gray-300 mt-2">
                    <span>{info.year}</span>
                    <span className="font-semibold">{info.rating}</span>
                </div>
                <p className="mt-4 text-gray-400 text-sm leading-relaxed max-h-40 overflow-y-auto">{info.summary}</p>
            </div>
        </div>
        <style>{`.animate-fade-in-fast { animation: fade-in 0.2s ease-out forwards; } @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </div>
);

interface UnifiedPlayerProps {
    media: ActiveMedia;
    onBack: () => void;
}

const UnifiedPlayer: React.FC<UnifiedPlayerProps> = ({ media, onBack }) => {
    // Refs
    const videoRef = useRef<HTMLVideoElement>(null);
    const playerContainerRef = useRef<HTMLDivElement>(null);
    const torrentClientRef = useRef<WebTorrentInstance | null>(null);
    const torrentRef = useRef<Torrent | null>(null);
    const subtitleInputRef = useRef<HTMLInputElement>(null);
    const originalCueTimesRef = useRef<Map<TextTrackCue, { startTime: number; endTime: number }>>(new Map());
    const timeUpdateTimeoutRef = useRef<number | null>(null);

    // Chromecast
    const { castState, requestSession, stopCasting, castMedia } = useChromecast(videoRef.current);

    // IPTV State
    const [currentChannel, setCurrentChannel] = useState<Channel | null>(null);
    const [isSidebarOpen, setSidebarOpen] = useState(true);
    const [isCompactMode, setIsCompactMode] = useState(false);
    const [epgData, setEpgData] = useState<EpgData | null>(null);
    const [isEpgLoading, setIsEpgLoading] = useState(false);
    const [isEpgGridVisible, setIsEpgGridVisible] = useState(false);

    // Torrent State
    const [torrentInfo, setTorrentInfo] = useState<{
        name: string;
        files: TorrentFile[];
        progress: number;
        downloaded: number;
        length: number;
        downloadSpeed: number;
        uploadSpeed: number;
        numPeers: number;
        infoHash: string;
    } | null>(null);
    const [selectedFile, setSelectedFile] = useState<TorrentFile | null>(null);
    const [torrentStatus, setTorrentStatus] = useState('Initializing...');
    const [torrentError, setTorrentError] = useState<string | null>(null);
    const [timeRemaining, setTimeRemaining] = useState<string>('Calculating...');
    const [downloadQueue, setDownloadQueue] = useState<DownloadQueueItem[]>([]);
    const [isZipping, setIsZipping] = useState(false);
    const [torrentFileFilter, setTorrentFileFilter] = useState('');
    const [torrentFileSort, setTorrentFileSort] = useState('default');
    const [prioritizedFiles, setPrioritizedFiles] = useState<Set<string>>(new Set());
    const [geminiInfo, setGeminiInfo] = useState<GeminiInfo | null>(null);
    const [isGeminiLoading, setIsGeminiLoading] = useState(false);
    const [activeFileInfo, setActiveFileInfo] = useState<GeminiInfo | null>(null);
    const [isFetchingFileInfo, setIsFetchingFileInfo] = useState<string | null>(null);


    // Local file State
    const [localFileUrl, setLocalFileUrl] = useState<string | null>(null);

    // Common Player State
    const [playing, setPlaying] = useState(false);
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1.0);
    const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
    const [availableSubtitleTracks, setAvailableSubtitleTracks] = useState<SubtitleTrack[]>([]);
    const [activeSubtitleTrack, setActiveSubtitleTrack] = useState<SubtitleTrack | null>(null);
    const [subtitleSettings, setSubtitleSettings] = useState<SubtitleSettings>(getSubtitleSettings);
    const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
    const [activeAudioTrack, setActiveAudioTrack] = useState<AudioTrack | null>(null);
    const [bufferedTime, setBufferedTime] = useState(0);
    const [isPipActive, setIsPipActive] = useState(false);
    const [isPipSupported, setIsPipSupported] = useState(false);
    const [mediaId, setMediaId] = useState<string | null>(null);
    const [resumeTime, setResumeTime] = useState<number | null>(null);
    const [chapters, setChapters] = useState<Chapter[] | null>(null);
    const [isAnalyzingChapters, setIsAnalyzingChapters] = useState(false);
    const [showSkipIntro, setShowSkipIntro] = useState(false);

    const handleCast = () => {
        if (castState === 'CONNECTED') {
            stopCasting();
        } else {
            requestSession();
        }
    };
    
    useEffect(() => {
        const castCurrentMedia = async () => {
             if (castState !== 'CONNECTED') return;

            let url: string | null = null;
            let title: string | null = null;

            if (media.type === 'iptv' && currentChannel) {
                url = currentChannel.url;
                title = currentChannel.name;
            } else if (media.type === 'local' && localFileUrl) {
                // Casting local files is complex, requires a local server. Skipping for now.
                alert("La transmisión de archivos locales a Chromecast no es compatible en esta versión.");
                return;
            } else if (media.type === 'torrent' && selectedFile && torrentRef.current) {
                if (selectedFile.done) {
                     selectedFile.getBlobURL((err, blobUrl) => {
                        if (blobUrl) {
                            // Casting blob URLs is also complex.
                             alert("La transmisión de torrents a Chromecast aún no es totalmente compatible.");
                        }
                    });
                    return;
                } else {
                    alert("Por favor, espera a que el archivo del torrent se descargue por completo para transmitirlo.");
                    return;
                }
            }

            if (url && title) {
                const subtitleUrl = activeSubtitleTrack?.src;
                castMedia(url, title, subtitleUrl);
            }
        };
        castCurrentMedia();

    }, [castState, currentChannel, selectedFile, localFileUrl]);



    const loadEpg = useCallback(async (epgUrl: string) => {
        setIsEpgLoading(true);
        const cached = getEpgFromCache(epgUrl);
        if (cached) {
            setEpgData(cached);
            setIsEpgLoading(false);
            return;
        }

        const proxy = 'https://corsproxy.io/?';
        const fetchUrl = `${proxy}${encodeURIComponent(epgUrl)}`;
        try {
            const response = await fetch(fetchUrl);
            if (!response.ok) throw new Error(`EPG fetch failed: ${response.status}`);
            const xmlString = await response.text();
            const parsedData = parseXMLTV(xmlString);
            setEpgData(parsedData);
            cacheEpg(epgUrl, parsedData);
        } catch (error) {
            console.error("Failed to load or parse EPG:", error);
            setEpgData(null);
        } finally {
            setIsEpgLoading(false);
        }
    }, []);
    
     const handleFetchFileInfo = async (fileName: string) => {
        setIsFetchingFileInfo(fileName);
        const cached = getGeminiInfoFromCache(fileName);
        if (cached) {
            setActiveFileInfo(cached);
            setIsFetchingFileInfo(null);
            return;
        }
        const info = await getContentInfo(fileName);
        if (info) {
            setActiveFileInfo(info);
            cacheGeminiInfo(fileName, info);
        } else {
            alert('No se pudo obtener la información para este archivo.');
        }
        setIsFetchingFileInfo(null);
    };

    const handleAnalyzeChapters = async () => {
        const title = geminiInfo?.title || torrentInfo?.name || (media.type === 'local' ? media.file.name : null);
        if (!title || !duration) return;

        const cacheKey = `${title}-${Math.round(duration)}`;
        const cached = getChaptersFromCache(cacheKey);
        if (cached) {
            setChapters(cached);
            return;
        }

        setIsAnalyzingChapters(true);
        const result = await getVideoChapters(title, duration);
        if (result) {
            setChapters(result);
            cacheChapters(cacheKey, result);
        } else {
            alert('No se pudieron generar los capítulos.');
        }
        setIsAnalyzingChapters(false);
    };

    // Effect to setup player based on media type
    useEffect(() => {
        setIsPipSupported(document.pictureInPictureEnabled);
        let isMounted = true;
        let progressIntervalId: number | null = null;
        let metadataTimeoutId: number | null = null;
        
        const tracksToClean = [...subtitleTracks];
        setSubtitleTracks([]);
        setActiveSubtitleTrack(null);
        setAvailableSubtitleTracks([]);
        setAudioTracks([]);
        setActiveAudioTrack(null);
        setPlaybackRate(1.0);
        setMediaId(null);
        setResumeTime(null);
        setGeminiInfo(null);
        setIsGeminiLoading(false);
        setChapters(null);
        setIsAnalyzingChapters(false);


        const cleanup = () => {
            isMounted = false;
            if (progressIntervalId) clearInterval(progressIntervalId);
            if (metadataTimeoutId) clearTimeout(metadataTimeoutId);
            if (timeUpdateTimeoutRef.current) clearTimeout(timeUpdateTimeoutRef.current);
            if (torrentClientRef.current) {
                torrentClientRef.current.destroy(() => { torrentClientRef.current = null; });
            }
            if (localFileUrl) {
                URL.revokeObjectURL(localFileUrl);
            }
            if (videoRef.current) {
                videoRef.current.removeAttribute('src');
                videoRef.current.load();
            }
            tracksToClean.forEach(track => URL.revokeObjectURL(track.src));
        };

        setCurrentChannel(null);
        setTorrentInfo(null);
        setSelectedFile(null);
        setDownloadQueue([]);
        setTorrentError(null);
        setTorrentStatus('Initializing...');
        setLocalFileUrl(oldUrl => {
            if (oldUrl) URL.revokeObjectURL(oldUrl);
            return null;
        });

        const fetchGeminiData = async (name: string) => {
            if (!isMounted) return;
            const cachedInfo = getGeminiInfoFromCache(name);
            if (cachedInfo) {
                setGeminiInfo(cachedInfo);
                return;
            }
            setIsGeminiLoading(true);
            const info = await getContentInfo(name);
            if (isMounted) {
                if (info) {
                    setGeminiInfo(info);
                    cacheGeminiInfo(name, info);
                }
                setIsGeminiLoading(false);
            }
        };

        if (media.type === 'iptv') {
             const initial = media.initialChannel ? 
                media.channels.find(c => c.url === media.initialChannel?.url) :
                media.channels.length > 0 ? media.channels[0] : null;
            setCurrentChannel(initial);
            if (media.epgUrl) {
                loadEpg(media.epgUrl);
            }
        } else if (media.type === 'local') {
            const url = URL.createObjectURL(media.file);
            const id = `local-file-${media.file.name}-${media.file.size}-${media.file.lastModified}`;
            setMediaId(id);
            setLocalFileUrl(url);
            if (videoRef.current) {
                videoRef.current.src = url;
            }
            fetchGeminiData(media.file.name);
        } else if (media.type === 'torrent') {
             if (typeof (window as any).WebTorrent === 'undefined') {
                setTorrentError('La librería de Torrent no se pudo cargar. Refresca la página.');
                return;
            }
            
            torrentClientRef.current = new (window as any).WebTorrent();
            const client = torrentClientRef.current;
            
            client.add(media.identifier, (torrent: Torrent) => {
                if (!isMounted) return;
                
                torrentRef.current = torrent;
                setTorrentStatus('Fetching torrent metadata...');
                fetchGeminiData(torrent.name);

                metadataTimeoutId = window.setTimeout(() => {
                    if (isMounted && !torrent.ready) {
                        setTorrentError("Está tardando mucho en obtener la información. El torrent puede tener pocas fuentes (seeds) o puede haber un problema de red.");
                    }
                }, 30000);

                const handleTorrentReady = () => {
                    if (!isMounted) return;
                    if (metadataTimeoutId) clearTimeout(metadataTimeoutId);
                    setTorrentError(null);
                    setTorrentStatus('Downloading...');

                    const updateUiState = () => {
                        if (!isMounted) return;
                        setTorrentInfo({
                            name: torrent.name,
                            files: torrent.files,
                            progress: torrent.progress,
                            downloaded: torrent.downloaded,
                            length: torrent.length,
                            downloadSpeed: torrent.downloadSpeed,
                            uploadSpeed: torrent.uploadSpeed,
                            numPeers: torrent.numPeers,
                            infoHash: torrent.infoHash,
                        });
                        
                        if (torrent.progress >= 1) { setTimeRemaining('Done'); } 
                        else if (torrent.downloadSpeed > 0) {
                            const remainingBytes = torrent.length - torrent.downloaded;
                            setTimeRemaining(formatTimeRemaining(remainingBytes / torrent.downloadSpeed));
                        } else { setTimeRemaining('∞'); }
                    };
                    
                    updateUiState();
                     if (media.initialFile) {
                        const fileToSelect = torrent.files.find(f => f.name === media.initialFile);
                        if (fileToSelect) setSelectedFile(fileToSelect);
                    }

                    progressIntervalId = window.setInterval(updateUiState, 1000);
                    torrent.on('download', updateUiState);
                    torrent.on('upload', updateUiState);
                    torrent.on('done', () => {
                        if (!isMounted) return;
                        updateUiState();
                        setTorrentInfo(prev => prev ? ({ ...prev, progress: 1, downloadSpeed: 0 }) : null);
                        if (progressIntervalId) clearInterval(progressIntervalId);
                    });
                };

                torrent.on('ready', handleTorrentReady);
                if (torrent.ready) handleTorrentReady();

                torrent.on('error', (err: any) => {
                    if (!isMounted) return;
                    console.error('Torrent error:', err);
                    const message = typeof err === 'string' ? err : err.message;
                    let userMessage = `Error: ${message}`;
                    if (message.includes('invalid torrent identifier')) userMessage = 'El enlace magnet o el archivo .torrent no es válido.';
                    else if (message.includes('tracker')) userMessage = 'Problema al contactar con los trackers. Revisa tu conexión o prueba otro torrent.';
                    
                    setTorrentError(userMessage);
                    if (progressIntervalId) clearInterval(progressIntervalId);
                    if (metadataTimeoutId) clearTimeout(metadataTimeoutId);
                });
            });
        }
        
        return cleanup;
    }, [media, loadEpg]);

    // Set mediaId for playback position tracking
    useEffect(() => {
        if (media.type === 'iptv' && currentChannel) {
            setMediaId(`iptv-channel-${currentChannel.url}`);
        } else if (media.type === 'torrent' && torrentInfo && selectedFile) {
            setMediaId(`torrent-${torrentInfo.infoHash}-${selectedFile.name}`);
        }
    }, [media, currentChannel, torrentInfo, selectedFile]);
    
    // Check for saved playback position when mediaId is set
    useEffect(() => {
        if (!mediaId) return;
        const savedTime = getPlaybackPosition(mediaId);
        if (savedTime && savedTime > 5) { // Only prompt if past 5 seconds
            setResumeTime(savedTime);
        } else {
             videoRef.current?.play().catch(console.error);
        }
    }, [mediaId]);

    const handleResumePlayback = (resume: boolean) => {
        const video = videoRef.current;
        if (!video) return;
        if (resume && resumeTime) {
            video.currentTime = resumeTime;
        }
        setResumeTime(null);
        video.play().catch(console.error);
    };

    useEffect(() => {
        if (selectedFile && videoRef.current && media.type === 'torrent' && media.mode === 'stream') {
            setSelectedFile(f => {
                if (f) {
                    // Fetch Gemini info for the specific file if not already fetched for the whole torrent
                    if (!geminiInfo) {
                        getContentInfo(f.name).then(setGeminiInfo);
                    }
                    f.renderTo(videoRef.current, { autoplay: false });
                }
                return f;
            });
        }
    }, [selectedFile, media, geminiInfo]);
    
    useEffect(() => {
        if (media.type === 'iptv' && media.playlistUrl && currentChannel) {
            setLastWatchedMedia({
                type: 'iptv',
                playlistUrl: media.playlistUrl,
                channel: currentChannel,
                epgUrl: media.epgUrl,
            });
        }
    }, [currentChannel, media]);

    useEffect(() => {
        if (media.type === 'torrent' && media.mode === 'stream' && typeof media.identifier === 'string' && selectedFile) {
            setLastWatchedMedia({
                type: 'torrent',
                identifier: media.identifier,
                fileName: selectedFile.name,
            });
        }
    }, [selectedFile, media]);

    useEffect(() => {
        const torrent = torrentRef.current;
        if (!torrent || torrent.files.length === 0) return;
        if (prioritizedFiles.size > 0) {
            torrent.files.forEach(file => prioritizedFiles.has(file.name) ? file.select() : file.deselect());
        } else {
            torrent.files.forEach(file => file.select());
        }
    }, [prioritizedFiles, torrentInfo]);


    const handlePlayPause = useCallback(() => {
        if (videoRef.current?.paused) videoRef.current?.play().catch(console.error);
        else videoRef.current?.pause();
    }, []);

    const handleVolumeChange = useCallback((newVolume: number) => {
        if (videoRef.current) {
            const clampedVolume = Math.max(0, Math.min(1, newVolume));
            videoRef.current.muted = false;
            setMuted(false);
            videoRef.current.volume = clampedVolume;
            setVolume(clampedVolume);
        }
    }, []);
    
    const handleMuteToggle = useCallback(() => {
         if (videoRef.current) {
            videoRef.current.muted = !videoRef.current.muted;
            setMuted(videoRef.current.muted);
        }
    }, []);

    const handleSeek = useCallback((time: number) => {
        if (videoRef.current) videoRef.current.currentTime = time;
    }, []);

    const handleToggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            playerContainerRef.current?.requestFullscreen().catch(err => alert(`Error: ${err.message}`));
        } else {
            document.exitFullscreen();
        }
    }, []);

    const handlePlaybackRateChange = useCallback((rate: number) => {
        if (videoRef.current) videoRef.current.playbackRate = rate;
    }, []);

    const handleTogglePip = useCallback(() => {
        if (!isPipSupported || !videoRef.current) return;
        if (document.pictureInPictureElement) document.exitPictureInPicture().catch(console.error);
        else videoRef.current.requestPictureInPicture().catch(console.error);
    }, [isPipSupported]);
    
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement;
            if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;

            if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) event.preventDefault();

            switch (event.key.toLowerCase()) {
                case ' ': handlePlayPause(); break;
                case 'f': handleToggleFullscreen(); break;
                case 'm': handleMuteToggle(); break;
                case 'arrowleft': if (videoRef.current) handleSeek(Math.max(0, videoRef.current.currentTime - 5)); break;
                case 'arrowright': if (videoRef.current) handleSeek(Math.min(duration, videoRef.current.currentTime + 5)); break;
                case 'arrowup': handleVolumeChange(volume + 0.1); break;
                case 'arrowdown': handleVolumeChange(volume - 0.1); break;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handlePlayPause, handleToggleFullscreen, handleMuteToggle, handleSeek, handleVolumeChange, volume, duration]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        
        const onPlay = () => setPlaying(true);
        const onPause = () => setPlaying(false);
        const onTimeUpdate = () => {
            const time = video.currentTime;
            setCurrentTime(time);

            if (chapters) {
                const intro = chapters.find(c => c.name.toLowerCase().includes('intro'));
                const introEnd = intro ? chapters.find(c => c.timestamp > intro.timestamp) : null;
                if (intro && introEnd && time > intro.timestamp && time < introEnd.timestamp) {
                    setShowSkipIntro(true);
                } else {
                    setShowSkipIntro(false);
                }
            }

            if (!timeUpdateTimeoutRef.current) {
                timeUpdateTimeoutRef.current = window.setTimeout(() => {
                    if (mediaId && time > 0 && video.duration > 0) {
                        if (time / video.duration > 0.95) {
                            clearPlaybackPosition(mediaId);
                        } else {
                            setPlaybackPosition(mediaId, time);
                        }
                    }
                    timeUpdateTimeoutRef.current = null;
                }, 15000);
            }
        };
        const onDurationChange = () => setDuration(video.duration);
        const onRateChange = () => setPlaybackRate(video.playbackRate);
        const onVolumeChangeEv = () => { setVolume(video.volume); setMuted(video.muted); };
        const onLoadedMetadata = () => {
            setDuration(video.duration);
            const handleTracks = () => {
                if ((video as any).audioTracks) {
                    const tracks = Array.from((video as any).audioTracks) as AudioTrack[];
                    setAudioTracks(tracks);
                    setActiveAudioTrack(tracks.find(t => t.enabled) || tracks[0] || null);
                }
                if (video.textTracks) {
                    const embeddedTracks = Array.from(video.textTracks)
                        .filter(track => track.kind === 'subtitles' || track.kind === 'captions')
                        .map((track, i) => ({
                            src: `embedded-${i}-${track.label}-${track.language}`,
                            label: track.label || track.language || `Track ${i+1}`,
                            srclang: track.language,
                        }));
                    const combined = [...subtitleTracks, ...embeddedTracks];
                    setAvailableSubtitleTracks(Array.from(new Map(combined.map(item => [item.label, item])).values()));
                }
            };
            handleTracks();
            if((video as any).audioTracks) (video as any).audioTracks.onchange = handleTracks;
            if(video.textTracks) video.textTracks.onaddtrack = handleTracks;
        };
        const onProgress = () => { if (video.buffered.length > 0) setBufferedTime(video.buffered.end(video.buffered.length - 1)); };
        const onEnterPip = () => setIsPipActive(true);
        const onLeavePip = () => setIsPipActive(false);

        video.addEventListener('play', onPlay);
        video.addEventListener('pause', onPause);
        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('durationchange', onDurationChange);
        video.addEventListener('ratechange', onRateChange);
        video.addEventListener('volumechange', onVolumeChangeEv);
        video.addEventListener('loadedmetadata', onLoadedMetadata);
        video.addEventListener('progress', onProgress);
        video.addEventListener('enterpictureinpicture', onEnterPip);
        video.addEventListener('leavepictureinpicture', onLeavePip);

        if (document.pictureInPictureElement === video) setIsPipActive(true);

        return () => {
            video.removeEventListener('play', onPlay);
            video.removeEventListener('pause', onPause);
            video.removeEventListener('timeupdate', onTimeUpdate);
            // ... remove all other listeners
            if((video as any).audioTracks) (video as any).audioTracks.onchange = null;
            if(video.textTracks) video.textTracks.onaddtrack = null;
        };
    }, [subtitleTracks, mediaId, chapters]);

    // Subtitle Settings Effects
    useEffect(() => {
        const container = playerContainerRef.current;
        if (!container) return;

        container.style.setProperty('--subtitle-font-size', { small: '1rem', normal: '1.25rem', large: '1.5rem' }[subtitleSettings.size]);
        container.style.setProperty('--subtitle-color', subtitleSettings.color === 'white' ? '#FFFFFF' : '#FFFF00');
        container.style.setProperty('--subtitle-bg-color', subtitleSettings.background ? 'rgba(0, 0, 0, 0.7)' : 'transparent');
    }, [subtitleSettings]);
    
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !activeSubtitleTrack) return;
    
        const applyOffset = () => {
            const track = Array.from(video.textTracks).find(t => t.label === activeSubtitleTrack.label);
            if (track?.cues) {
                if (!originalCueTimesRef.current.has(track.cues[0])) {
                    const newOriginals = new Map(originalCueTimesRef.current);
                    Array.from(track.cues).forEach(cue => newOriginals.set(cue, { startTime: cue.startTime, endTime: cue.endTime }));
                    originalCueTimesRef.current = newOriginals;
                }
                Array.from(track.cues).forEach(cue => {
                    const original = originalCueTimesRef.current.get(cue);
                    if (original) {
                        cue.startTime = original.startTime + subtitleSettings.offset;
                        cue.endTime = original.endTime + subtitleSettings.offset;
                    }
                });
            }
        };
    
        const track = Array.from(video.textTracks).find(t => t.label === activeSubtitleTrack.label);
        if (track) track.cues ? applyOffset() : track.addEventListener('load', applyOffset, { once: true });
        
    }, [subtitleSettings.offset, activeSubtitleTrack]);

    const handleSubtitleSettingsChange = (newSettings: Partial<SubtitleSettings>) => {
        setSubtitleSettings(prev => {
            const updated = { ...prev, ...newSettings };
            setSubtitleSettings(updated);
            return updated;
        });
    };


    // Download Queue Logic
    useEffect(() => {
        if (downloadQueue.some(item => ['preparing', 'downloading'].includes(item.status))) return;

        const nextInQueue = downloadQueue.find(item => item.status === 'queued');
        if (nextInQueue) {
            setDownloadQueue(q => q.map(i => i.file.name === nextInQueue.file.name ? { ...i, status: 'preparing' } : i));
            nextInQueue.file.getBlobURL((err, url) => {
                if (err || !url) {
                    setDownloadQueue(q => q.map(i => i.file.name === nextInQueue.file.name ? { ...i, status: 'error', error: err?.message || 'Failed' } : i));
                    return;
                }
                setDownloadQueue(q => q.map(i => i.file.name === nextInQueue.file.name ? { ...i, status: 'downloading', url } : i));
                handleSaveFile(url, nextInQueue.file.name);
                setDownloadQueue(q => q.map(i => i.file.name === nextInQueue.file.name ? { ...i, status: 'done' } : i));
            });
        }
    }, [downloadQueue]);

    const handleAddToDownloadQueue = (file: TorrentFile) => {
        if (!downloadQueue.some(item => item.file.name === file.name)) {
            setDownloadQueue(prev => [...prev, { file, status: 'queued' }]);
        }
    };

    const handleDownloadAllAsZip = async () => {
        if (!torrentInfo || isZipping) return;
        const totalSize = torrentInfo.files.reduce((acc, file) => acc + file.length, 0);
        if (totalSize > 2 * 1024 * 1024 * 1024 && !window.confirm(`El tamaño total es de ${(totalSize / (1024 ** 3)).toFixed(2)} GB. ¿Continuar?`)) return;

        setIsZipping(true);
        setTorrentStatus('Comprimiendo archivos...');
        const fileData: Record<string, Uint8Array> = {};
        try {
            await Promise.all(torrentInfo.files.map(file => 
                new Promise<void>((resolve, reject) => file.getBlob((err, blob) => {
                    if (err || !blob) return reject(err || new Error('Blob failed'));
                    const reader = new FileReader();
                    reader.onload = () => { fileData[file.name] = new Uint8Array(reader.result as ArrayBuffer); resolve(); };
                    reader.onerror = reject;
                    reader.readAsArrayBuffer(blob);
                }))
            ));
            zip(fileData, (err, data) => {
                if (err) throw err;
                const blob = new Blob([data], { type: 'application/zip' });
                const url = URL.createObjectURL(blob);
                handleSaveFile(url, `${torrentInfo.name}.zip`);
                URL.revokeObjectURL(url);
                setIsZipping(false);
                setTorrentStatus('ZIP descargado.');
            });
        } catch (error) {
            setTorrentStatus('Error al crear el archivo ZIP.');
            setIsZipping(false);
        }
    };
    
    const handleSaveFile = (url: string, fileName: string) => {
        const a = document.createElement('a'); a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };

    const handleSubtitleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const text = reader.result as string;
            const blob = new Blob([file.name.endsWith('.srt') ? srtToVtt(text) : text], { type: 'text/vtt' });
            const src = URL.createObjectURL(blob);
            const label = file.name.replace(/\.(vtt|srt)$/i, '');
            const newTrack: SubtitleTrack = { src, label, srclang: label.substring(0, 2).toLowerCase() };
            setSubtitleTracks(prev => [...prev, newTrack]);
            setActiveSubtitleTrack(newTrack);
        };
        reader.readAsText(file);
        event.target.value = '';
    };

    const handleSelectSubtitleTrack = useCallback((track: SubtitleTrack | null) => setActiveSubtitleTrack(track), []);
    const handleSelectAudioTrack = useCallback((track: AudioTrack) => {
        if (!videoRef.current) return;
        const audioTracks = (videoRef.current as any).audioTracks;
        for (let i = 0; i < audioTracks.length; i++) audioTracks[i].enabled = audioTracks[i].id === track.id;
        setActiveAudioTrack(track);
    }, []);
    const handleTogglePriority = useCallback((fileName: string) => {
        setPrioritizedFiles(prev => { const newSet = new Set(prev); newSet.has(fileName) ? newSet.delete(fileName) : newSet.add(fileName); return newSet; });
    }, []);


    useEffect(() => {
        const video = videoRef.current;
        if (!video?.textTracks) return;
        for (let i = 0; i < video.textTracks.length; i++) {
            const textTrack = video.textTracks[i];
            const isTrackActive = activeSubtitleTrack && (textTrack.label === activeSubtitleTrack.label || `embedded-${i}-${textTrack.label}-${textTrack.language}` === activeSubtitleTrack.src);
            textTrack.mode = isTrackActive ? 'showing' : 'hidden';
        }
    }, [activeSubtitleTrack, availableSubtitleTracks]);

    const displayedFiles = useMemo(() => {
        if (!torrentInfo?.files) return [];
        const filtered = torrentInfo.files.filter(file => file.name.toLowerCase().includes(torrentFileFilter.toLowerCase()));
        switch (torrentFileSort) {
            case 'name_asc': return filtered.sort((a, b) => a.name.localeCompare(b.name));
            case 'name_desc': return filtered.sort((a, b) => b.name.localeCompare(a.name));
            case 'size_desc': return filtered.sort((a, b) => b.length - a.length);
            case 'size_asc': return filtered.sort((a, b) => a.length - b.length);
            default: return filtered;
        }
    }, [torrentInfo?.files, torrentFileFilter, torrentFileSort]);

    const renderTorrentScreen = () => {
        if (media.type !== 'torrent' || selectedFile) return null;
        const formatBytes = (bytes: number, decimals = 2) => { if (!+bytes) return '0 Bytes'; const k = 1024; const i = Math.floor(Math.log(bytes) / Math.log(k)); return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals < 0 ? 0 : decimals))} ${['Bytes', 'KB', 'MB', 'GB'][i]}`; };
       
        return (
             <div className="w-full h-full flex items-center justify-center bg-slate-900 text-white p-4 overflow-y-auto">
                <div className="w-full max-w-4xl flex flex-col lg:flex-row gap-8">
                     {/* Left Side: Poster and Info */}
                    <div className="lg:w-1/3 flex-shrink-0">
                        {isGeminiLoading && <div className="aspect-[2/3] w-full bg-slate-800 rounded-lg animate-pulse"></div>}
                        {geminiInfo && (
                            <img src={geminiInfo.posterUrl} alt={`Poster for ${geminiInfo.title}`} className="w-full h-auto object-cover rounded-lg shadow-2xl" />
                        )}
                        {!isGeminiLoading && !geminiInfo && (
                             <div className="aspect-[2/3] w-full bg-slate-800 rounded-lg flex flex-col items-center justify-center text-center p-4">
                                <InfoIcon className="w-12 h-12 text-slate-500 mb-4" />
                                <h3 className="font-bold text-white">Información no disponible</h3>
                                <p className="text-sm text-slate-400">No se pudieron obtener los metadatos para este torrent.</p>
                             </div>
                        )}
                         <div className="mt-4 space-y-2 text-sm">
                            {geminiInfo && <>
                                <div className="flex justify-between">
                                    <span className="font-semibold text-slate-300">Año:</span>
                                    <span>{geminiInfo.year}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="font-semibold text-slate-300">Rating:</span>
                                    <span>{geminiInfo.rating}</span>
                                </div>
                            </>}
                             {torrentInfo && <div className="flex justify-between">
                                <span className="font-semibold text-slate-300">Peers:</span>
                                <span className={torrentInfo.numPeers > 10 ? 'text-green-400' : 'text-yellow-400'}>{torrentInfo.numPeers}</span>
                            </div>}
                             {torrentInfo && <div className="flex justify-between">
                                <span className="font-semibold text-slate-300">Bajada:</span>
                                <span>{formatBytes(torrentInfo.downloadSpeed)}/s</span>
                            </div>}
                             {torrentInfo && <div className="flex justify-between">
                                <span className="font-semibold text-slate-300">Tiempo:</span>
                                <span>{timeRemaining}</span>
                            </div>}
                        </div>
                    </div>
                     {/* Right Side: Title, Summary, Files */}
                    <div className="lg:w-2/3 flex flex-col">
                        <h2 className="text-3xl sm:text-4xl font-bold text-white break-words">{geminiInfo?.title || torrentInfo?.name || 'Cargando...'}</h2>
                        {geminiInfo && <p className="mt-4 text-slate-300 leading-relaxed">{geminiInfo.summary}</p>}
                        
                        <div className="mt-6 flex-grow flex flex-col">
                            <h3 className="text-xl font-semibold mb-3">Archivos</h3>
                            <div className="flex flex-col sm:flex-row gap-2 mb-3">
                                <div className="relative flex-grow"><span className="absolute inset-y-0 left-0 flex items-center pl-3"><SearchIcon className="h-5 w-5 text-gray-400"/></span><input type="text" placeholder="Filtrar archivos..." value={torrentFileFilter} onChange={(e) => setTorrentFileFilter(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"/></div>
                                <select value={torrentFileSort} onChange={(e) => setTorrentFileSort(e.target.value)} className="w-full sm:w-auto appearance-none px-4 py-2 bg-slate-800 border border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"><option value="default">Orden original</option><option value="name_asc">Nombre (A-Z)</option><option value="name_desc">Nombre (Z-A)</option><option value="size_desc">Tamaño (Mayor)</option><option value="size_asc">Tamaño (Menor)</option></select>
                            </div>
                            <div className="bg-slate-800/50 rounded-lg overflow-hidden flex-1 min-h-48 flex flex-col">
                                <div className="overflow-y-auto">{displayedFiles.length > 0 ? displayedFiles.map((file, index) => { const isPrioritized = prioritizedFiles.has(file.name); return <div key={index} className={`p-3 flex justify-between items-center w-full text-left border-b border-slate-700/50 last:border-b-0 ${selectedFile?.name === file.name ? 'bg-blue-600/30' : 'hover:bg-slate-700/50'}`}><button onClick={() => setSelectedFile(file)} className="flex-1 text-left truncate pr-2" title={`Ver: ${file.name}`}><span>{file.name} ({formatBytes(file.length)})</span></button><div className="flex items-center space-x-2 flex-shrink-0"><button onClick={() => handleTogglePriority(file.name)} title={isPrioritized ? "Quitar prioridad" : "Priorizar descarga"} className="p-2 rounded-full hover:bg-slate-700">{isPrioritized ? <StarFilledIcon className="w-5 h-5 text-yellow-400"/> : <StarIcon className="w-5 h-5 text-gray-400"/>}</button><button onClick={() => handleFetchFileInfo(file.name)} disabled={isFetchingFileInfo === file.name} className="p-2 rounded-full hover:bg-slate-700 disabled:opacity-50"><SparklesIcon className={`w-5 h-5 text-purple-400 ${isFetchingFileInfo === file.name ? 'animate-pulse' : ''}`}/></button></div></div>; }) : <div className="p-4 text-center text-gray-400">No se encontraron archivos.</div>}</div>
                            </div>
                        </div>
                    </div>
                </div>
             </div>
        );
    };

    const handleSkipIntro = () => {
        if (!chapters || !videoRef.current) return;
        const intro = chapters.find(c => c.name.toLowerCase().includes('intro'));
        const introEnd = intro ? chapters.find(c => c.timestamp > intro.timestamp) : null;
        if (introEnd) {
            videoRef.current.currentTime = introEnd.timestamp;
            setShowSkipIntro(false);
        }
    };
    
    const renderSkipIntroButton = () => {
        if (!showSkipIntro) return null;
        return (
            <button
                onClick={handleSkipIntro}
                className="absolute bottom-24 right-4 z-50 bg-slate-900/80 backdrop-blur-md rounded-lg px-4 py-2 shadow-2xl text-white font-semibold animate-fade-in-up hover:bg-slate-800"
            >
                Saltar Intro
            </button>
        );
    };

    const renderDownloadQueue = () => {
        if (downloadQueue.length === 0) return null;
        return <div className="absolute bottom-20 sm:bottom-24 left-1/2 -translate-x-1/2 w-11/12 max-w-sm bg-slate-900/80 backdrop-blur-sm rounded-lg shadow-2xl z-40 p-3 text-white"><div className="flex justify-between items-center mb-2"><div className="flex items-center space-x-2"><QueueIcon className="w-5 h-5"/><h4 className="font-semibold text-sm">Cola de Descargas</h4></div><button onClick={() => setDownloadQueue([])} className="p-1 hover:bg-slate-700 rounded-full" title="Limpiar cola"><CloseIcon className="w-4 h-4" /></button></div><ul className="space-y-2 text-xs max-h-32 overflow-y-auto pr-2">{downloadQueue.map(({ file, status }) => <li key={file.name} className="flex justify-between items-center"><span className="truncate pr-2">{file.name}</span><span className="flex-shrink-0 font-semibold" style={{ color: {done:'#16a34a', error:'#dc2626', queued:'#d97706', downloading:'#2563eb'}[status] }}>{status}</span></li>)}</ul></div>;
    };

    const renderResumePrompt = () => {
        if (!resumeTime) return null;
        return (
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 bg-slate-900/80 backdrop-blur-md rounded-lg p-4 shadow-2xl flex items-center space-x-4 animate-fade-in-up">
                <p className="text-white text-sm">¿Reanudar desde <span className="font-semibold">{formatTime(resumeTime)}</span>?</p>
                <div className="flex space-x-2">
                    <button onClick={() => handleResumePlayback(true)} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded-md text-xs font-bold text-white">SÍ</button>
                    <button onClick={() => handleResumePlayback(false)} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded-md text-xs">NO</button>
                </div>
                <style>{`@keyframes fade-in-up { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } } .animate-fade-in-up { animation: fade-in-up 0.3s ease-out forwards; }`}</style>
            </div>
        );
    };

    const handleCompactModeBack = () => { setIsCompactMode(false); onBack(); };
    
    const showPlayer = media.type === 'iptv' || media.type === 'local' || (media.type === 'torrent' && selectedFile);

    let mediaInfoDetails = null;
    if (media.type === 'iptv' && currentChannel) mediaInfoDetails = { mediaType: 'iptv' as const, channel: currentChannel, duration, epgData };
    else if (media.type === 'torrent' && torrentInfo && selectedFile) mediaInfoDetails = { mediaType: 'torrent' as const, torrentInfo, selectedFile, duration };
    else if (media.type === 'local' && media.file) mediaInfoDetails = { mediaType: 'local' as const, localFileName: media.file.name, duration };

    if (media.type === 'iptv' && isCompactMode) {
        return <main className="w-screen h-screen bg-slate-900"><div className="h-full md:w-80"><Sidebar channels={media.channels} onSelectChannel={setCurrentChannel} currentChannel={currentChannel} onBack={handleCompactModeBack} onClose={() => {}} isCompactMode={true} epgData={epgData} isEpgLoading={isEpgLoading} onShowEpgGrid={() => setIsEpgGridVisible(true)}/></div><div ref={playerContainerRef} className="fixed bottom-4 right-4 w-80 h-44 z-50 rounded-lg shadow-2xl bg-black overflow-hidden group/player"><button onClick={() => setIsCompactMode(false)} title="Expandir" className="absolute top-2 right-2 z-40 p-2 bg-black/50 rounded-full hover:bg-black/80 opacity-0 group-hover/player:opacity-100"><ExitCompactIcon className="w-5 h-5 text-white" /></button><video ref={videoRef} className="w-full h-full object-contain" playsInline autoPlay /><Player channel={currentChannel} videoRef={videoRef} /></div></main>;
    }

    return (
        <div ref={playerContainerRef} className="w-screen h-screen bg-black flex relative text-white overflow-hidden group/player">
            {activeFileInfo && <FileInfoModal info={activeFileInfo} onClose={() => setActiveFileInfo(null)} />}
            {isEpgGridVisible && epgData && <EpgGrid channels={media.type === 'iptv' ? media.channels : []} epgData={epgData} onClose={() => setIsEpgGridVisible(false)} onSelectChannel={setCurrentChannel} />}
            
            {media.type === 'iptv' && <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="absolute top-4 right-4 z-40 p-2 bg-black/50 rounded-full hover:bg-black/80"><MenuIcon className="w-6 h-6" /></button>}
            {media.type === 'torrent' && selectedFile && <button onClick={() => setSelectedFile(null)} title="Volver a la lista" className="absolute top-4 right-4 z-40 p-2 bg-black/50 rounded-full hover:bg-black/80"><ListIcon className="w-6 h-6" /></button>}
            <button onClick={onBack} className="absolute top-4 left-4 z-40 p-2 bg-black/50 rounded-full hover:bg-black/80"><BackIcon className="w-6 h-6" /></button>
            
            {showPlayer && mediaInfoDetails && <MediaInfo {...mediaInfoDetails} />}
            {renderDownloadQueue()}
            {renderResumePrompt()}
            {renderSkipIntroButton()}

            <div className="w-full h-full flex items-center justify-center">
                {media.type === 'iptv' && <>
                    <div className={`absolute top-0 left-0 h-full z-30 transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} w-full md:w-80`}>
                       <Sidebar channels={media.channels} onSelectChannel={setCurrentChannel} currentChannel={currentChannel} onBack={onBack} onClose={() => setSidebarOpen(false)} isCompactMode={false} epgData={epgData} isEpgLoading={isEpgLoading} onShowEpgGrid={() => setIsEpgGridVisible(true)} />
                    </div>
                    <Player channel={currentChannel} videoRef={videoRef} />
                </>}
                {renderTorrentScreen()}
                <video ref={videoRef} className={`w-full h-full object-contain ${showPlayer ? '' : 'hidden'}`} playsInline crossOrigin="anonymous">
                    {subtitleTracks.map((track) => <track key={track.src} src={track.src} kind="subtitles" srcLang={track.srclang} label={track.label} default={track.src === activeSubtitleTrack?.src} />)}
                </video>
                 <input type="file" ref={subtitleInputRef} onChange={handleSubtitleFileChange} className="hidden" accept=".vtt,.srt"/>
            </div>
            
            {showPlayer && <Controls onPlayPause={handlePlayPause} onVolumeChange={handleVolumeChange} onMuteToggle={handleMuteToggle} onSeek={handleSeek} onToggleFullscreen={handleToggleFullscreen} onLoadSubtitles={() => subtitleInputRef.current?.click()} onSelectSubtitleTrack={handleSelectSubtitleTrack} availableSubtitleTracks={availableSubtitleTracks} activeSubtitleTrack={activeSubtitleTrack} audioTracks={audioTracks} activeAudioTrack={activeAudioTrack} onSelectAudioTrack={handleSelectAudioTrack} playing={playing} volume={volume} muted={muted} duration={duration} currentTime={currentTime} bufferedTime={bufferedTime} playbackRate={playbackRate} onPlaybackRateChange={handlePlaybackRateChange} onTogglePip={handleTogglePip} isPipActive={isPipActive} isPipSupported={isPipSupported} subtitleSettings={subtitleSettings} onSubtitleSettingsChange={handleSubtitleSettingsChange} mediaType={media.type} onToggleCompactMode={() => setIsCompactMode(true)} castState={castState} onCast={handleCast} onAnalyzeChapters={handleAnalyzeChapters} isAnalyzingChapters={isAnalyzingChapters} chapters={chapters} />}
        </div>
    );
};

export default UnifiedPlayer;