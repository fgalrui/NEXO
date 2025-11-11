import React, { useState, useRef } from 'react';
import PlaylistLoader from './PlaylistLoader';
import TorrentManager from './TorrentManager';
import { Channel } from '../types';

interface LoaderSelectionProps {
    onPlaylistLoaded: (channels: Channel[]) => void;
    onTorrentLoad: (identifier: string | File, mode: 'stream' | 'download') => void;
    onLocalFileLoad: (file: File) => void;
}

type View = 'selection' | 'iptv' | 'torrent';

const LoaderSelection: React.FC<LoaderSelectionProps> = ({ onPlaylistLoaded, onTorrentLoad, onLocalFileLoad }) => {
    const [view, setView] = useState<View>('selection');
    const localFileRef = useRef<HTMLInputElement>(null);

    const handleLocalFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            onLocalFileLoad(event.target.files[0]);
        }
    };

    const handleLocalFileClick = () => {
        localFileRef.current?.click();
    };

    if (view === 'iptv') {
        return (
            <>
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">IPTV</h1>
                    <p className="mt-4 text-lg text-gray-300">Pega una URL de una lista o arrastra un archivo para empezar.</p>
                </div>
                <PlaylistLoader onPlaylistLoaded={onPlaylistLoaded} />
                <div className="text-center">
                    <button onClick={() => setView('selection')} className="mt-6 text-sm text-gray-400 hover:text-white transition-colors">← Volver</button>
                </div>
            </>
        );
    }

    if (view === 'torrent') {
        return (
             <>
                <TorrentManager onLoad={onTorrentLoad} />
                <div className="text-center">
                    <button onClick={() => setView('selection')} className="mt-6 text-sm text-gray-400 hover:text-white transition-colors">← Volver</button>
                </div>
            </>
        );
    }
    
    return (
        <>
            <div className="text-center mb-8">
                <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">NEXO</h1>
                <p className="mt-4 text-lg text-gray-300">Un reproductor moderno para tus listas de IPTV y torrents.</p>
            </div>
            <div className="space-y-4">
                 <input
                    type="file"
                    ref={localFileRef}
                    onChange={handleLocalFileChange}
                    className="hidden"
                    accept="video/*"
                />
                <button 
                    onClick={handleLocalFileClick} 
                    className="w-full flex justify-center items-center py-3 px-4 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-semibold transition-colors text-white"
                >
                    Archivo local
                </button>
                <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => setView('iptv')} className="w-full flex justify-center items-center py-3 px-4 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors text-white">
                        IPTV
                    </button>
                    <button onClick={() => setView('torrent')} className="w-full flex justify-center items-center py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition-colors text-white">
                        Torrent
                    </button>
                </div>
            </div>
        </>
    );
};

export default LoaderSelection;