import React, { useState, useEffect } from 'react';
import { Channel, EpgData, EpgProgram } from '../types';
import { TvIcon, GroupIcon, ClockIcon, DownloadIcon } from './icons';

interface TorrentInfoSubset {
    name: string;
    numPeers: number;
    downloadSpeed: number;
}
interface TorrentFileSubset {
    name: string;
}

interface MediaInfoProps {
    mediaType: 'iptv' | 'torrent' | 'local';
    channel?: Channel;
    torrentInfo?: TorrentInfoSubset;
    selectedFile?: TorrentFileSubset;
    localFileName?: string;
    duration?: number;
    epgData?: EpgData | null;
}

const useEpgForChannel = (channel: Channel | undefined, epgData: EpgData | null | undefined) => {
    const [programs, setPrograms] = useState<{ current: EpgProgram | null, next: EpgProgram | null }>({ current: null, next: null });

    useEffect(() => {
        if (!channel || !channel.tvgId || !epgData) {
            setPrograms({ current: null, next: null });
            return;
        }

        const findPrograms = () => {
            const now = Date.now();
            const channelPrograms = epgData.get(channel.tvgId!);
            if (!channelPrograms) {
                 setPrograms({ current: null, next: null });
                 return;
            }

            const current = channelPrograms.find(p => now >= p.start && now < p.end) || null;
            let next = null;
            if (current) {
                next = channelPrograms.find(p => p.start >= current.end) || null;
            }
            setPrograms({ current, next });
        };
        
        findPrograms();
        const interval = setInterval(findPrograms, 60 * 1000); // Check every minute
        return () => clearInterval(interval);

    }, [channel, epgData]);

    return programs;
};

const formatTime = (timeInSeconds: number) => {
    if (isNaN(timeInSeconds) || timeInSeconds === Infinity || timeInSeconds <= 0) {
        return null;
    }
    const date = new Date(0);
    date.setSeconds(timeInSeconds);
    const requiresHours = date.getUTCHours() > 0;
    return date.toISOString().substr(requiresHours ? 11 : 14, requiresHours ? 8 : 5);
};

const formatBytes = (bytes: number, decimals = 2) => {
    if (!+bytes) return '0 B/s';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const formatEpgTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
};

const MediaInfo: React.FC<MediaInfoProps> = ({
    mediaType,
    channel,
    torrentInfo,
    selectedFile,
    localFileName,
    duration,
    epgData,
}) => {
    const formattedDuration = formatTime(duration ?? 0);
    const { current: currentProgram, next: nextProgram } = useEpgForChannel(channel, epgData);

    return (
        <div className="absolute top-0 left-0 right-0 p-4 pt-16 sm:pt-4 bg-gradient-to-b from-black/60 to-transparent opacity-0 group-hover/player:opacity-100 transition-opacity duration-300 z-10 pointer-events-none text-white">
            <div className="max-w-4xl mx-auto px-4">
                {mediaType === 'iptv' && channel && (
                    <>
                        <h1 className="text-xl md:text-2xl font-bold truncate">{channel.name}</h1>
                        {currentProgram ? (
                            <div className="mt-1">
                                <p className="text-lg text-gray-100 truncate">{currentProgram.title}</p>
                                <p className="text-sm text-gray-400">
                                    A continuación: {nextProgram ? `${nextProgram.title} (${formatEpgTime(nextProgram.start)})` : 'No disponible'}
                                </p>
                            </div>
                        ) : (
                             <div className="flex items-center space-x-4 text-sm text-gray-300 mt-1">
                                {channel.group && (
                                    <div className="flex items-center space-x-2">
                                        <TvIcon className="w-4 h-4" />
                                        <span>{channel.group}</span>
                                    </div>
                                )}
                                {formattedDuration && (
                                    <div className="flex items-center space-x-2">
                                        <ClockIcon className="w-4 h-4" />
                                        <span>{formattedDuration}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
                {mediaType === 'torrent' && torrentInfo && selectedFile && (
                    <>
                        <h1 className="text-lg md:text-xl font-bold truncate" title={torrentInfo.name}>{torrentInfo.name}</h1>
                        <p className="text-md text-gray-200 truncate mt-1" title={selectedFile.name}>{selectedFile.name}</p>
                        <div className="flex items-center space-x-4 text-sm text-gray-300 mt-2">
                            <div className="flex items-center space-x-2">
                                <GroupIcon className="w-4 h-4" />
                                <span>{torrentInfo.numPeers} peers</span>
                            </div>
                             <div className="flex items-center space-x-2">
                                <DownloadIcon className="w-4 h-4" />
                                <span>{formatBytes(torrentInfo.downloadSpeed)}</span>
                            </div>
                            {formattedDuration && (
                                <div className="flex items-center space-x-2">
                                    <ClockIcon className="w-4 h-4" />
                                    <span>{formattedDuration}</span>
                                </div>
                            )}
                        </div>
                    </>
                )}
                {mediaType === 'local' && localFileName && (
                     <>
                        <h1 className="text-xl md:text-2xl font-bold truncate">{localFileName}</h1>
                        {formattedDuration && (
                            <div className="flex items-center space-x-2 text-sm text-gray-300 mt-2">
                                <ClockIcon className="w-4 h-4" />
                                <span>{formattedDuration}</span>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default MediaInfo;