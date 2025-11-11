import React, { useState, useCallback, useEffect } from 'react';
import { Channel, ActiveMedia } from './types';
import LoaderSelection from './components/LoaderSelection';
import UnifiedPlayer from './components/UnifiedPlayer';
import { parseM3U } from './services/m3uParser';
import { getPlaylistFromCache, cachePlaylist, getLastWatchedMedia, setLastWatchedMedia } from './utils/storage';
import { CloseIcon, KeyboardIcon } from './components/icons';

interface KeyboardShortcutsModalProps {
    onClose: () => void;
}

const shortcuts = [
    { key: 'Espacio', description: 'Reproducir / Pausar' },
    { key: 'F', description: 'Pantalla Completa' },
    { key: 'M', description: 'Silenciar' },
    { key: '←', description: 'Retroceder 5s' },
    { key: '→', description: 'Avanzar 5s' },
    { key: '↑', description: 'Subir volumen' },
    { key: '↓', description: 'Bajar volumen' },
];

const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ onClose }) => {
    return (
        <div 
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 transition-opacity animate-fade-in"
            onClick={onClose}
        >
            <div 
                className="bg-slate-800 rounded-2xl shadow-2xl ring-1 ring-white/10 w-full max-w-md p-6 m-4 relative animate-scale-up"
                onClick={e => e.stopPropagation()}
            >
                <button 
                    onClick={onClose} 
                    className="absolute top-3 right-3 p-2 text-gray-400 hover:text-white hover:bg-slate-700 rounded-full transition-colors"
                    aria-label="Cerrar"
                >
                    <CloseIcon className="w-6 h-6" />
                </button>
                <h2 className="text-2xl font-bold text-white mb-6">Atajos de Teclado</h2>
                <div className="space-y-3">
                    {shortcuts.map(({ key, description }) => (
                        <div key={key} className="flex justify-between items-center text-gray-200">
                            <span className="font-mono bg-slate-700/50 text-sm py-1 px-2 rounded-md border border-slate-600">{key}</span>
                            <span className="text-gray-300">{description}</span>
                        </div>
                    ))}
                </div>
            </div>
            <style>{`
                @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
                .animate-fade-in { animation: fade-in 0.2s ease-out forwards; }
                @keyframes scale-up { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
                .animate-scale-up { animation: scale-up 0.2s ease-out forwards; }
            `}</style>
        </div>
    );
};

const App: React.FC = () => {
    const [activeMedia, setActiveMedia] = useState<ActiveMedia | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);

    const loadPlaylistFromUrl = async (url: string): Promise<Channel[] | null> => {
        const cached = getPlaylistFromCache(url);
        if (cached) return cached;

        const proxy = 'https://corsproxy.io/?';
        const fetchUrl = `${proxy}${encodeURIComponent(url)}`;
        try {
            const response = await fetch(fetchUrl, { signal: AbortSignal.timeout(30000) });
            if (!response.ok) throw new Error(`Response status: ${response.status}`);
            const content = await response.text();
            const channels = parseM3U(content, url);
            if (channels.length > 0) {
                cachePlaylist(url, channels);
                return channels;
            }
            return null;
        } catch (error) {
            console.error("Failed to auto-load playlist:", error);
            return null;
        }
    };
    
    useEffect(() => {
        const autoLoadLastMedia = async () => {
            const lastWatched = getLastWatchedMedia();
            if (!lastWatched) {
                setIsLoading(false);
                return;
            }

            if (lastWatched.type === 'iptv') {
                const channels = await loadPlaylistFromUrl(lastWatched.playlistUrl);
                if (channels) {
                    setActiveMedia({
                        type: 'iptv',
                        channels,
                        playlistUrl: lastWatched.playlistUrl,
                        initialChannel: lastWatched.channel,
                        epgUrl: lastWatched.epgUrl,
                    });
                }
            } else if (lastWatched.type === 'torrent' && lastWatched.identifier) {
                 setActiveMedia({
                    type: 'torrent',
                    identifier: lastWatched.identifier,
                    mode: 'stream',
                    initialFile: lastWatched.fileName,
                });
            }
            setIsLoading(false);
        };
        autoLoadLastMedia();
    }, []);

    const handlePlaylistLoaded = useCallback((channels: Channel[], url?: string, epgUrl?: string) => {
        setActiveMedia({ type: 'iptv', channels, playlistUrl: url, epgUrl });
    }, []);

    const handleTorrentLoad = useCallback((identifier: string | File, mode: 'stream' | 'download') => {
        setActiveMedia({ type: 'torrent', identifier, mode });
    }, []);

    const handleLocalFileLoad = useCallback((file: File) => {
        setActiveMedia({ type: 'local', file });
    }, []);

    const handleBack = useCallback(() => {
        setLastWatchedMedia(null);
        setActiveMedia(null);
    }, []);

    if (isLoading) {
        return (
            <main className="bg-slate-900 text-white h-screen w-screen flex flex-col items-center justify-center">
                 <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl animate-pulse">NEXO</h1>
                 <p className="mt-4 text-lg text-gray-300">Cargando tu última sesión...</p>
            </main>
        );
    }

    if (activeMedia) {
        return <UnifiedPlayer media={activeMedia} onBack={handleBack} />;
    }

    return (
        <main className="bg-slate-900 text-white h-screen w-screen overflow-hidden relative transition-colors duration-300">
             <div className="h-full flex items-center justify-center p-4">
                <div className="w-full max-w-xl mx-auto p-6 sm:p-8 bg-slate-900/50 rounded-2xl shadow-2xl ring-1 ring-white/10 backdrop-blur-md">
                   <LoaderSelection 
                        onPlaylistLoaded={handlePlaylistLoaded}
                        onTorrentLoad={handleTorrentLoad}
                        onLocalFileLoad={handleLocalFileLoad}
                   />
                </div>
            </div>
            <button 
                onClick={() => setIsShortcutsModalOpen(true)}
                className="absolute bottom-6 right-6 p-3 bg-slate-900/60 hover:bg-slate-900/80 rounded-full text-gray-300 hover:text-white transition-all shadow-lg backdrop-blur-sm"
                title="Atajos de Teclado"
            >
                <KeyboardIcon className="w-6 h-6" />
            </button>
            {isShortcutsModalOpen && <KeyboardShortcutsModal onClose={() => setIsShortcutsModalOpen(false)} />}
        </main>
    );
};

export default App;