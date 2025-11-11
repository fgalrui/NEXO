import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Channel, EpgData, EpgProgram } from '../types';
import { TvIcon, SearchIcon, GroupIcon, BackIcon, CloseIcon, StarIcon, StarFilledIcon, PlayIcon, CopyIcon, GridIcon } from './icons';
import { useFavorites } from '../hooks/useFavorites';

const useCurrentProgram = (channel: Channel, epgData: EpgData | null): { program: EpgProgram | null, progress: number } => {
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const timer = setInterval(() => {
            setNow(Date.now());
        }, 60 * 1000); // Update every minute
        return () => clearInterval(timer);
    }, []);

    const program = useMemo(() => {
        if (!epgData || !channel.tvgId) return null;
        const programs = epgData.get(channel.tvgId);
        if (!programs) return null;
        
        return programs.find(p => now >= p.start && now < p.end) || null;
    }, [now, channel.tvgId, epgData]);

    const progress = useMemo(() => {
        if (!program) return 0;
        const duration = program.end - program.start;
        const elapsed = now - program.start;
        return (elapsed / duration) * 100;
    }, [now, program]);

    return { program, progress };
};


interface SidebarProps {
    channels: Channel[];
    onSelectChannel: (channel: Channel) => void;
    currentChannel: Channel | null;
    onBack: () => void;
    onClose: () => void;
    isCompactMode: boolean;
    epgData: EpgData | null;
    isEpgLoading: boolean;
    onShowEpgGrid: () => void;
}

const ChannelListItem: React.FC<{ channel: Channel, isSelected: boolean, onSelect: () => void, onContextMenu: (e: React.MouseEvent) => void, isFavorite: boolean, onToggleFavorite: () => void, epgData: EpgData | null }> = React.memo(({
    channel, isSelected, onSelect, onContextMenu, isFavorite, onToggleFavorite, epgData
}) => {
    const { program, progress } = useCurrentProgram(channel, epgData);
    
    return (
         <li className="flex items-center pr-2 group text-white" onContextMenu={onContextMenu}>
            <button
                onClick={onSelect}
                className={`w-full text-left p-3 flex items-center space-x-4 transition-colors duration-200 ${
                    isSelected
                        ? 'bg-gradient-to-r from-blue-600/30 to-transparent border-l-4 border-blue-400'
                        : 'hover:bg-slate-800'
                }`}
            >
                {channel.logo ? (
                    <img src={channel.logo} alt={channel.name} className="w-12 h-12 rounded-md object-contain bg-slate-700 ring-1 ring-slate-600" />
                ) : (
                    <div className="w-12 h-12 flex items-center justify-center bg-slate-700 rounded-md ring-1 ring-slate-600">
                        <TvIcon className="w-6 h-6 text-gray-400" />
                    </div>
                )}
                <div className="flex-1 truncate">
                    <span className="font-medium block">{channel.name}</span>
                    {program && (
                        <div className="mt-1">
                            <span className="text-xs text-gray-300 block truncate">{program.title}</span>
                            <div className="w-full bg-slate-600 rounded-full h-1 mt-1">
                                <div className="bg-blue-400 h-1 rounded-full" style={{ width: `${progress}%` }}></div>
                            </div>
                        </div>
                    )}
                </div>
            </button>
            <button 
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite();
                }}
                className="p-2 rounded-full hover:bg-slate-700 opacity-0 group-hover:opacity-100 transition-opacity"
            >
                {isFavorite ? (
                    <StarFilledIcon className="w-5 h-5 text-yellow-400" />
                ) : (
                    <StarIcon className="w-5 h-5 text-gray-400" />
                )}
            </button>
        </li>
    );
});


const Sidebar: React.FC<SidebarProps> = ({ channels, onSelectChannel, currentChannel, onBack, onClose, isCompactMode, epgData, isEpgLoading, onShowEpgGrid }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedGroup, setSelectedGroup] = useState('Todos');
    const { favorites, isFavorite, toggleFavorite } = useFavorites();

    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; channel: Channel; } | null>(null);
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

    useEffect(() => {
        const handleClickOutside = () => setContextMenu(null);
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const handleContextMenu = (event: React.MouseEvent, channel: Channel) => {
        event.preventDefault();
        setContextMenu({ x: event.pageX, y: event.pageY, channel: channel });
    };

    const handleCopyLink = () => {
        if (contextMenu) {
            navigator.clipboard.writeText(contextMenu.channel.url).then(() => {
                setCopyStatus('copied');
                setTimeout(() => {
                    setContextMenu(null);
                    setCopyStatus('idle');
                }, 1000);
            });
        }
    };

    const groups = useMemo(() => {
        const groupSet = new Set(channels.map(c => c.group || 'Sin categoría'));
        const sortedGroups = Array.from(groupSet).sort();
        return favorites.length > 0 ? ['Todos', '⭐ Favoritos', ...sortedGroups] : ['Todos', ...sortedGroups];
    }, [channels, favorites.length]);

    const filteredChannels = useMemo(() => {
        const lowerCaseSearch = searchTerm.toLowerCase();
        
        let channelList = channels;
        if (selectedGroup === '⭐ Favoritos') {
            const favoriteUrls = new Set(favorites.map(f => f.url));
            channelList = channels.filter(c => favoriteUrls.has(c.url));
        } else if (selectedGroup !== 'Todos') {
            channelList = channels.filter(c => c.group === selectedGroup);
        }

        if (!lowerCaseSearch) return channelList;
        
        // Complex search: first by name, then by current program title
        return channelList.filter(channel => {
            if (channel.name.toLowerCase().includes(lowerCaseSearch)) {
                return true;
            }
            if (epgData && channel.tvgId) {
                const programs = epgData.get(channel.tvgId);
                if(programs) {
                    const now = Date.now();
                    const currentProgram = programs.find(p => now >= p.start && now < p.end);
                    if (currentProgram && currentProgram.title.toLowerCase().includes(lowerCaseSearch)) {
                        return true;
                    }
                }
            }
            return false;
        });
    }, [channels, searchTerm, selectedGroup, favorites, epgData]);

    return (
        <div className="w-full h-full bg-slate-900 flex flex-col text-white">
            <div className="p-3 space-y-3 border-b border-slate-800">
                <div className="flex items-center justify-between">
                    {!isCompactMode && (
                        <>
                            <button onClick={onBack} className="p-2 hidden md:block hover:bg-slate-700 rounded-full">
                                <BackIcon className="w-6 h-6" />
                            </button>
                             <h2 className="text-xl font-bold hidden md:block flex-1 ml-4">Canales</h2>
                             {epgData && (
                                <button onClick={onShowEpgGrid} className="p-2 hover:bg-slate-700 rounded-full" title="Guía de Programación">
                                    <GridIcon className="w-6 h-6" />
                                </button>
                             )}
                             <button onClick={onClose} className="p-2 md:hidden hover:bg-slate-700 rounded-full">
                                <CloseIcon className="w-6 h-6" />
                            </button>
                        </>
                    )}
                    {isCompactMode && <h2 className="text-xl font-bold flex-1">Canales</h2>}
                </div>
                <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                        <SearchIcon className="h-5 w-5 text-gray-400" />
                    </span>
                    <input
                        type="text"
                        placeholder="Buscar por canal o programa..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div className="relative">
                     <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                        <GroupIcon className="h-5 w-5 text-gray-400" />
                    </span>
                    <select
                        value={selectedGroup}
                        onChange={(e) => setSelectedGroup(e.target.value)}
                        className="w-full appearance-none pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        {groups.map(group => (
                            <option key={group} value={group}>{group}</option>
                        ))}
                    </select>
                </div>
                 {isEpgLoading && <div className="text-xs text-center text-gray-400 animate-pulse">Cargando guía de programas...</div>}
            </div>
            <ul className="flex-1 overflow-y-auto">
                {filteredChannels.length > 0 ? filteredChannels.map((channel, index) => (
                    <ChannelListItem
                        key={`${channel.url}-${index}`}
                        channel={channel}
                        isSelected={currentChannel?.url === channel.url}
                        onSelect={() => onSelectChannel(channel)}
                        onContextMenu={(e) => handleContextMenu(e, channel)}
                        isFavorite={isFavorite(channel)}
                        onToggleFavorite={() => toggleFavorite(channel)}
                        epgData={epgData}
                    />
                )) : (
                    <div className="p-4 text-center text-gray-400">
                        No se encontraron canales.
                    </div>
                )}
            </ul>

            {contextMenu && (
                <div
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    className="absolute z-50 w-52 py-2 bg-slate-800 rounded-md shadow-xl ring-1 ring-black/5 flex flex-col"
                >
                    <button onClick={() => { if(contextMenu) onSelectChannel(contextMenu.channel); setContextMenu(null); }} className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-blue-600 hover:text-white flex items-center space-x-3">
                        <PlayIcon className="w-4 h-4" />
                        <span>Iniciar reproducción</span>
                    </button>
                    <button onClick={handleCopyLink} disabled={copyStatus === 'copied'} className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-blue-600 hover:text-white flex items-center space-x-3 disabled:text-green-400">
                        <CopyIcon className="w-4 h-4" />
                        <span>{copyStatus === 'copied' ? '¡Enlace copiado!' : 'Copiar enlace'}</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default Sidebar;