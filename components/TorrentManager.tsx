import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { getRecentMagnets, addRecentMagnet } from '../utils/storage';
import { UploadIcon, LinkIcon, SearchIcon, ExternalLinkIcon, SparklesIcon } from './icons';

interface TorrentManagerProps {
    onLoad: (identifier: string | File, mode: 'stream' | 'download') => void;
}

const SEARCH_PROVIDERS = [
    { name: 'The Pirate Bay', url: 'https://thepiratebay.torrentbay.st/search.php?q=' },
    // Se pueden añadir más proveedores aquí en el futuro
];

const TorrentManager: React.FC<TorrentManagerProps> = ({ onLoad }) => {
    const [identifier, setIdentifier] = useState<string | File>('');
    const [inputValue, setInputValue] = useState('');
    const [recents, setRecents] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedProvider, setSelectedProvider] = useState(SEARCH_PROVIDERS[0].url);

    useEffect(() => {
        setRecents(getRecentMagnets());
    }, []);

    const handleLoad = (mode: 'stream' | 'download') => {
        if (identifier) {
            if (typeof identifier === 'string') {
                addRecentMagnet(identifier);
            }
            onLoad(identifier, mode);
        }
    };
    
    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            const file = acceptedFiles[0];
            setIdentifier(file);
            setInputValue(file.name);
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'application/x-bittorrent': ['.torrent'] },
        multiple: false,
    });
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setInputValue(value);
        if (value.startsWith('magnet:?')) {
            setIdentifier(value);
        } else {
            setIdentifier('');
        }
    }

    const handleRecentClick = (magnet: string) => {
        setInputValue(magnet);
        setIdentifier(magnet);
    }

    const handleSearch = () => {
        if (searchQuery.trim()) {
            const searchUrl = `${selectedProvider}${encodeURIComponent(searchQuery)}`;
            window.open(searchUrl, '_blank', 'noopener,noreferrer');
        }
    };

    return (
        <div className="space-y-6">
            <div className="text-center">
                <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Torrents</h2>
                <p className="mt-4 text-lg text-gray-300">Busca, pega un enlace magnet o arrastra un archivo.</p>
            </div>

            {/* Search Section */}
            <div className="space-y-3 p-4 bg-slate-900/50 rounded-lg border border-slate-700">
                 <label htmlFor="provider-select" className="block text-sm font-medium text-gray-300">Buscar en:</label>
                 <div className="flex flex-col sm:flex-row gap-2">
                    <select
                        id="provider-select"
                        value={selectedProvider}
                        onChange={(e) => setSelectedProvider(e.target.value)}
                        className="appearance-none w-full sm:w-auto px-3 py-2 bg-slate-700 text-white border border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    >
                        {SEARCH_PROVIDERS.map(provider => (
                            <option key={provider.name} value={provider.url}>{provider.name}</option>
                        ))}
                    </select>
                    <div className="relative flex-grow">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                            <SearchIcon className="h-5 w-5 text-gray-400" />
                        </span>
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            placeholder="Ej: Robin Hood 2025 S01E03"
                            className="w-full pl-10 pr-4 py-2 bg-slate-700 text-white border border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                    </div>
                     <button onClick={handleSearch} title="Buscar en una nueva pestaña" className="flex-shrink-0 flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md font-semibold transition-colors disabled:bg-gray-500" disabled={!searchQuery.trim()}>
                        <ExternalLinkIcon className="w-5 h-5" />
                        <span className="sm:hidden">Buscar</span>
                    </button>
                </div>
            </div>

            <div className="relative my-2"><div className="absolute inset-0 flex items-center" aria-hidden="true"><div className="w-full border-t border-slate-700" /></div><div className="relative flex justify-center"><span className="bg-slate-900/50 px-2 text-sm text-gray-400">o</span></div></div>


             <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                    <LinkIcon className="h-5 w-5 text-gray-400" />
                </span>
                <input
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    placeholder="Enlace magnet o nombre de archivo"
                    className="w-full pl-10 pr-4 py-3 bg-slate-700/50 text-white border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
            </div>
             <div className="flex items-center justify-center gap-2 text-xs text-purple-300/80 p-2 bg-purple-900/30 rounded-md">
                <SparklesIcon className="w-4 h-4 flex-shrink-0" />
                <p>La información del torrent se enriquece con IA para una mejor experiencia.</p>
            </div>

            <div {...getRootProps()} className={`p-6 border-2 border-dashed border-slate-600 rounded-lg text-center cursor-pointer hover:border-purple-500 transition-colors ${isDragActive ? 'bg-slate-700/50 border-purple-500' : 'bg-transparent'}`}>
                <input {...getInputProps()} />
                <div className="flex flex-col items-center">
                    <UploadIcon className="w-8 h-8 text-gray-500 mb-2"/>
                    {isDragActive ? (
                        <p className="text-purple-400 font-semibold">Suelta el archivo .torrent...</p>
                    ) : (
                        <p className="text-gray-400 text-sm">Arrastra un archivo .torrent o haz click.</p>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button onClick={() => handleLoad('stream')} disabled={!identifier} className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-500 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors">Ver Ahora</button>
                <button onClick={() => handleLoad('download')} disabled={!identifier} className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-gray-500 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors">Descargar</button>
            </div>

            {recents.length > 0 && (
                <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-gray-400">Recientes:</h3>
                    <ul className="space-y-1">
                        {recents.map((magnet) => (
                            <li key={magnet}>
                                <button onClick={() => handleRecentClick(magnet)} className="w-full text-left text-xs text-gray-300 hover:text-white truncate bg-slate-700/50 p-2 rounded-md">
                                    {magnet}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default TorrentManager;