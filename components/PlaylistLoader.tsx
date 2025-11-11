import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Channel, FavoritePlaylist } from '../types';
import { parseM3U } from '../services/m3uParser';
import { 
    addIptvUrl, 
    getIptvHistory, 
    removeIptvUrl, 
    getFavoritePlaylists, 
    addFavoritePlaylist,
    removeFavoritePlaylist,
    updateFavoritePlaylist,
    getPlaylistFromCache,
    cachePlaylist,
} from '../utils/storage';
import { UploadIcon, LinkIcon, StarIcon, StarFilledIcon, TrashIcon, EditIcon, CheckIcon, CloseIcon } from './icons';

interface PlaylistLoaderProps {
    onPlaylistLoaded: (channels: Channel[], url?: string, epgUrl?: string) => void;
}

const PlaylistLoader: React.FC<PlaylistLoaderProps> = ({ onPlaylistLoaded }) => {
    const [url, setUrl] = useState('');
    const [epgUrl, setEpgUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [history, setHistory] = useState<string[]>([]);
    const [favorites, setFavorites] = useState<FavoritePlaylist[]>([]);
    
    const [editingUrl, setEditingUrl] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [editingEpgUrl, setEditingEpgUrl] = useState('');

    useEffect(() => {
        setHistory(getIptvHistory());
        setFavorites(getFavoritePlaylists());
    }, []);

    const handleRemoveUrl = (urlToRemove: string) => {
        removeIptvUrl(urlToRemove);
        removeFavoritePlaylist(urlToRemove);
        setHistory(getIptvHistory());
        setFavorites(getFavoritePlaylists());
    };
    
    const handleAddToFavorites = (urlToAdd: string) => {
        const defaultName = urlToAdd.split('/').pop()?.replace(/\.(m3u|m3u8)$/i, '') || urlToAdd;
        const name = prompt("Introduce un nombre para esta lista de favoritos:", defaultName);
        if (name) {
            const epgUrlPrompt = prompt("Opcional: Introduce la URL de la guía EPG (XMLTV):");
            addFavoritePlaylist({ name, url: urlToAdd, epgUrl: epgUrlPrompt || undefined });
            setFavorites(getFavoritePlaylists());
            if (!history.includes(urlToAdd)) {
                addIptvUrl(urlToAdd);
                setHistory(getIptvHistory());
            }
        }
    };

    const handleRemoveFromFavorites = (urlToRemove: string) => {
        removeFavoritePlaylist(urlToRemove);
        setFavorites(getFavoritePlaylists());
    };

    const isFavorite = (urlToCheck: string) => favorites.some(fav => fav.url === urlToCheck);

    const handleStartEditing = (playlist: FavoritePlaylist) => {
        setEditingUrl(playlist.url);
        setEditingName(playlist.name);
        setEditingEpgUrl(playlist.epgUrl || '');
    };

    const handleCancelEditing = () => {
        setEditingUrl(null);
        setEditingName('');
        setEditingEpgUrl('');
    };

    const handleSaveEditing = () => {
        if (editingUrl && editingName.trim()) {
            updateFavoritePlaylist(editingUrl, editingName.trim(), editingEpgUrl.trim());
            setFavorites(getFavoritePlaylists());
            handleCancelEditing();
        }
    };

    const processM3UFile = useCallback((content: string) => {
        try {
            const channels = parseM3U(content);
            if (channels.length > 0) {
                setError(null);
                onPlaylistLoaded(channels);
            } else {
                setError('El archivo no contiene canales válidos o está vacío.');
            }
        } catch (err) {
            console.error(err);
            setError('Error al procesar el archivo M3U.');
        } finally {
            setLoading(false);
        }
    }, [onPlaylistLoaded]);


    const loadM3UFromUrl = useCallback(async (urlToLoad: string, associatedEpgUrl?: string) => {
        if (!urlToLoad || !/^(https?:\/\/)/.test(urlToLoad)) {
            setError('Por favor, introduce una URL de playlist válida.');
            return;
        }

        const cachedChannels = getPlaylistFromCache(urlToLoad);
        if (cachedChannels) {
            setError(null);
            onPlaylistLoaded(cachedChannels, urlToLoad, associatedEpgUrl);
            addIptvUrl(urlToLoad);
            setHistory(getIptvHistory());
            return;
        }

        setFileName(null);
        setLoading(true);
        setError(null);
        
        const proxy = 'https://corsproxy.io/?';
        const fetchUrl = `${proxy}${encodeURIComponent(urlToLoad)}`;

        try {
            const response = await fetch(fetchUrl, { signal: AbortSignal.timeout(30000) });

            if (!response.ok) {
                throw new Error(`El servidor respondió con un error: ${response.status} ${response.statusText}`);
            }
            const content = await response.text();
            
            if (!content || !content.trim().startsWith('#EXTM3U')) {
                 setError('El contenido de la URL no parece ser una lista M3U válida.');
                 setLoading(false);
                 return;
            }

            const channels = parseM3U(content, urlToLoad);
            
            if (channels && channels.length > 0) {
                onPlaylistLoaded(channels, urlToLoad, associatedEpgUrl);
                cachePlaylist(urlToLoad, channels);
                addIptvUrl(urlToLoad);
                setHistory(getIptvHistory());
            } else {
                setError('La lista de reproducción está vacía o su formato es incorrecto.');
            }
        } catch (err: any) {
            console.error("Error al cargar la lista M3U:", err);
            if (err.name === 'AbortError') {
                 setError('La petición tardó demasiado en responder. Revisa la URL y tu conexión.');
            } else if (err instanceof TypeError) {
                setError('Error de red. Revisa tu conexión a internet o la URL.');
            } else {
                setError(`No se pudo cargar la URL. ${err.message || 'Error desconocido.'}`);
            }
        } finally {
            setLoading(false);
        }
    }, [onPlaylistLoaded]);
    
    const handleHistoryClick = (urlToLoad: string) => {
        const favorite = favorites.find(f => f.url === urlToLoad);
        setUrl(urlToLoad);
        setEpgUrl(favorite?.epgUrl || '');
        loadM3UFromUrl(urlToLoad, favorite?.epgUrl);
    };

    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            const file = acceptedFiles[0];
            setFileName(file.name);
            setUrl('');
            setEpgUrl('');
            setLoading(true);
            setError(null);
            
            const reader = new FileReader();
            reader.onload = (event) => {
                const content = event.target?.result as string;
                if (content) {
                    processM3UFile(content);
                } else {
                    setError('El archivo está vacío o no se pudo leer.');
                    setLoading(false);
                }
            };
            reader.onerror = () => {
                setError('Error al leer el archivo.');
                setLoading(false);
            }
            reader.readAsText(file);
        }
    }, [processM3UFile]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'audio/x-mpegurl': ['.m3u', '.m3u8'] },
        multiple: false
    });

    const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setUrl(e.target.value);
        if (fileName) setFileName(null);
    };

    return (
        <div className="space-y-4">
            {error && <div className="p-3 text-center bg-red-900/50 text-red-300 border-red-700 rounded-md">{error}</div>}
            
            <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400"><LinkIcon className="h-5 w-5" /></span>
                <input type="text" value={url} onChange={handleUrlChange} placeholder="URL de la playlist .m3u o .m3u8" className="w-full pl-10 pr-4 py-3 bg-slate-700/50 text-white border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
             <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 opacity-70 text-gray-400"><LinkIcon className="h-5 w-5" /></span>
                <input type="text" value={epgUrl} onChange={(e) => setEpgUrl(e.target.value)} placeholder="URL de la guía EPG (opcional)" className="w-full pl-10 pr-4 py-3 bg-slate-700/50 text-white border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <button onClick={() => loadM3UFromUrl(url, epgUrl)} disabled={loading || !url} className="w-full flex justify-center items-center py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed">
                {loading ? 'Cargando...' : 'Cargar Playlist'}
            </button>

            <div className="relative my-4"><div className="absolute inset-0 flex items-center" aria-hidden="true"><div className="w-full border-t border-slate-700" /></div><div className="relative flex justify-center"><span className="bg-slate-900/50 px-2 text-sm text-gray-400">o</span></div></div>

            <div {...getRootProps()} className={`p-6 border-2 border-dashed border-slate-600 rounded-lg text-center cursor-pointer hover:border-blue-500 transition-colors ${isDragActive ? 'bg-slate-700/50 border-blue-500' : 'bg-transparent'}`}>
                <input {...getInputProps()} />
                <div className="flex flex-col items-center">
                    <UploadIcon className="w-8 h-8 text-gray-500 mb-2"/>
                    {isDragActive ? (
                        <p className="text-blue-400 font-semibold">Suelta el archivo M3U aquí...</p>
                    ) : (
                        <p className="text-gray-400">
                            {fileName ? <span className="font-semibold">{fileName}</span> : 'Arrastra un archivo .m3u o .m3u8'}
                        </p>
                    )}
                </div>
            </div>

            {(history.length > 0 || favorites.length > 0) && (
                <div className="mt-6 space-y-4 max-h-60 overflow-y-auto pr-2">
                    {/* Favorites Section */}
                    {favorites.length > 0 && (
                        <div>
                            <h3 className="text-sm font-semibold text-gray-400 mb-2">Favoritos</h3>
                            <ul className="space-y-2">
                                {favorites.map((playlist) => (
                                    <li key={playlist.url} className="group flex flex-col bg-slate-700/50 p-2 rounded-md transition-colors hover:bg-slate-700">
                                        {editingUrl === playlist.url ? (
                                            <div className="w-full space-y-2">
                                                <input
                                                    type="text"
                                                    value={editingName}
                                                    onChange={(e) => setEditingName(e.target.value)}
                                                    className="bg-slate-600 w-full text-white text-sm px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    placeholder="Nombre"
                                                />
                                                 <input
                                                    type="text"
                                                    value={editingEpgUrl}
                                                    onChange={(e) => setEditingEpgUrl(e.target.value)}
                                                    className="bg-slate-600 w-full text-white text-sm px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    placeholder="URL de EPG (opcional)"
                                                />
                                                <div className="flex justify-end space-x-2">
                                                    <button onClick={handleSaveEditing} className="p-1 hover:bg-slate-600 rounded"><CheckIcon className="w-4 h-4 text-green-400" /></button>
                                                    <button onClick={handleCancelEditing} className="p-1 hover:bg-slate-600 rounded"><CloseIcon className="w-4 h-4 text-gray-400" /></button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-between">
                                                <button onClick={() => handleHistoryClick(playlist.url)} className="flex-1 text-left truncate">
                                                    <span className="text-sm text-gray-200 font-medium block">{playlist.name}</span>
                                                    <span className="text-xs text-gray-400 block truncate">{playlist.url}</span>
                                                </button>
                                                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleStartEditing(playlist)} className="p-1 hover:bg-slate-600 rounded" title="Renombrar"><EditIcon className="w-4 h-4 text-gray-400" /></button>
                                                    <button onClick={() => handleRemoveFromFavorites(playlist.url)} className="p-1 hover:bg-slate-600 rounded" title="Quitar de favoritos"><StarFilledIcon className="w-4 h-4 text-yellow-400" /></button>
                                                    <button onClick={() => handleRemoveUrl(playlist.url)} className="p-1 hover:bg-slate-600 rounded" title="Eliminar"><TrashIcon className="w-4 h-4 text-red-500" /></button>
                                                </div>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* History Section */}
                    {history.length > 0 && (
                        <div>
                            <h3 className="text-sm font-semibold text-gray-400 mb-2">Historial</h3>
                            <ul className="space-y-2">
                                {history.filter(h => !isFavorite(h)).map((histUrl) => (
                                    <li key={histUrl} className="group flex items-center justify-between bg-slate-700/50 p-2 rounded-md transition-colors hover:bg-slate-700">
                                        <button onClick={() => handleHistoryClick(histUrl)} className="flex-1 text-left text-xs text-gray-300 hover:text-white truncate">
                                            {histUrl}
                                        </button>
                                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => handleAddToFavorites(histUrl)} className="p-1 hover:bg-slate-600 rounded" title="Añadir a favoritos">
                                                <StarIcon className="w-4 h-4 text-gray-400" />
                                            </button>
                                            <button onClick={() => handleRemoveUrl(histUrl)} className="p-1 hover:bg-slate-600 rounded" title="Eliminar del historial">
                                                <TrashIcon className="w-4 h-4 text-red-500" />
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default PlaylistLoader;