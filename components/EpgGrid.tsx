import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Channel, EpgData, EpgProgram } from '../types';
import { CloseIcon, TvIcon } from './icons';

interface EpgGridProps {
    channels: Channel[];
    epgData: EpgData;
    onClose: () => void;
    onSelectChannel: (channel: Channel) => void;
}

const PIXELS_PER_MINUTE = 3;
const HOUR_WIDTH = PIXELS_PER_MINUTE * 60;
const CHANNEL_HEADER_WIDTH = 180; // in pixels

const EpgGrid: React.FC<EpgGridProps> = ({ channels, epgData, onClose, onSelectChannel }) => {
    const timelineRef = useRef<HTMLDivElement>(null);
    const programGridRef = useRef<HTMLDivElement>(null);
    const [now, setNow] = useState(new Date());

    const { timeHeaders, gridStartTime, gridEndTime } = useMemo(() => {
        const start = new Date(now);
        start.setHours(start.getHours() - 2, 0, 0, 0); // Start 2 hours ago
        const end = new Date(now);
        end.setHours(end.getHours() + 6, 0, 0, 0); // End 6 hours from now

        const headers: Date[] = [];
        let current = new Date(start);
        while (current < end) {
            headers.push(new Date(current));
            current.setHours(current.getHours() + 1);
        }
        return { timeHeaders: headers, gridStartTime: start.getTime(), gridEndTime: end.getTime() };
    }, [now]);

    // Effect for current time indicator and scrolling
    useEffect(() => {
        const updateNow = () => setNow(new Date());
        const timer = setInterval(updateNow, 60 * 1000); // Update every minute

        const nowOffset = (now.getTime() - gridStartTime) / (1000 * 60) * PIXELS_PER_MINUTE;
        if (timelineRef.current) {
            timelineRef.current.scrollLeft = nowOffset - (timelineRef.current.clientWidth / 2);
        }
         if (programGridRef.current) {
            programGridRef.current.scrollLeft = nowOffset - (programGridRef.current.clientWidth / 2);
        }

        return () => clearInterval(timer);
    }, [now, gridStartTime]);

    // Sync scrolling between timeline and program grid
    useEffect(() => {
        const timeline = timelineRef.current;
        const grid = programGridRef.current;
        if (!timeline || !grid) return;

        const handleTimelineScroll = () => { grid.scrollLeft = timeline.scrollLeft; };
        const handleGridScroll = () => { timeline.scrollLeft = grid.scrollLeft; };

        timeline.addEventListener('scroll', handleTimelineScroll);
        grid.addEventListener('scroll', handleGridScroll);

        return () => {
            timeline.removeEventListener('scroll', handleTimelineScroll);
            grid.removeEventListener('scroll', handleGridScroll);
        };
    }, []);

    const nowPosition = (now.getTime() - gridStartTime) / (1000 * 60) * PIXELS_PER_MINUTE;
    const gridWidth = (gridEndTime - gridStartTime) / (1000 * 60) * PIXELS_PER_MINUTE;

    const [selectedProgram, setSelectedProgram] = useState<EpgProgram & { channelName: string } | null>(null);

    const handleProgramClick = (program: EpgProgram, channel: Channel) => {
        setSelectedProgram({ ...program, channelName: channel.name });
    };

    const handleWatchNow = (channel: Channel) => {
        onSelectChannel(channel);
        onClose();
    };

    return (
        <div className="absolute inset-0 bg-slate-900/95 backdrop-blur-sm z-40 flex flex-col text-white animate-fade-in-fast">
            <header className="flex items-center justify-between p-4 border-b border-slate-800 flex-shrink-0">
                <h2 className="text-xl font-bold">Guía de Programación</h2>
                <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full">
                    <CloseIcon className="w-6 h-6" />
                </button>
            </header>

            <div className="flex-grow flex flex-col overflow-hidden">
                {/* Timeline Header */}
                <div className="flex flex-shrink-0">
                    <div style={{ width: `${CHANNEL_HEADER_WIDTH}px` }} className="flex-shrink-0 p-2 border-r border-b border-slate-800">
                        <span className="text-sm font-semibold">Canal</span>
                    </div>
                    <div ref={timelineRef} className="flex-grow overflow-x-hidden border-b border-slate-800">
                        <div className="relative" style={{ width: `${gridWidth}px` }}>
                            {timeHeaders.map(hour => {
                                const left = (hour.getTime() - gridStartTime) / (1000 * 60) * PIXELS_PER_MINUTE;
                                return (
                                    <div key={hour.toISOString()} className="absolute top-0 h-full p-2 border-r border-slate-800" style={{ left: `${left}px`, width: `${HOUR_WIDTH}px`}}>
                                        <span className="text-sm font-mono">{hour.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                );
                            })}
                            <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10" style={{ left: `${nowPosition}px` }}></div>
                        </div>
                    </div>
                </div>

                {/* Main Grid: Channels + Programs */}
                <div className="flex-grow flex overflow-hidden">
                     {/* Channel Headers */}
                    <div className="flex-shrink-0 overflow-y-auto" style={{ width: `${CHANNEL_HEADER_WIDTH}px` }}>
                        {channels.map(channel => (
                            <div key={channel.url} className="h-20 flex items-center p-2 border-r border-b border-slate-800">
                                <button onClick={() => handleWatchNow(channel)} className="flex items-center space-x-2 w-full text-left">
                                    {channel.logo ? (
                                        <img src={channel.logo} alt={channel.name} className="w-10 h-10 object-contain" />
                                    ) : (
                                        <div className="w-10 h-10 flex items-center justify-center bg-slate-700 rounded-md"><TvIcon className="w-5 h-5" /></div>
                                    )}
                                    <span className="text-sm font-medium truncate">{channel.name}</span>
                                </button>
                            </div>
                        ))}
                    </div>
                     {/* Program Grid */}
                    <div ref={programGridRef} className="flex-grow overflow-auto">
                        <div className="relative" style={{ width: `${gridWidth}px`, height: `${channels.length * 80}px` }}>
                            {channels.map((channel, index) => {
                                const programs = channel.tvgId ? epgData.get(channel.tvgId) : [];
                                return (
                                    <div key={channel.url} className="absolute h-20 border-b border-slate-800" style={{ top: `${index * 80}px`, width: '100%' }}>
                                        {programs && programs.map(program => {
                                            if (program.end < gridStartTime || program.start > gridEndTime) return null;
                                            const left = (program.start - gridStartTime) / (1000 * 60) * PIXELS_PER_MINUTE;
                                            const width = (program.end - program.start) / (1000 * 60) * PIXELS_PER_MINUTE;
                                            const isAiring = now.getTime() >= program.start && now.getTime() < program.end;

                                            return (
                                                <button
                                                    key={program.start}
                                                    onClick={() => handleProgramClick(program, channel)}
                                                    className={`absolute top-1 bottom-1 p-2 text-left rounded-md transition-colors ${isAiring ? 'bg-blue-800/70' : 'bg-slate-700/50 hover:bg-slate-700'}`}
                                                    style={{ left: `${left}px`, width: `${width - 4}px` }} // -4 for padding
                                                >
                                                    <p className="text-xs font-semibold truncate">{program.title}</p>
                                                    <p className="text-xs text-gray-400 truncate">{program.desc}</p>
                                                </button>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                            <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10" style={{ left: `${nowPosition}px` }}></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Selected Program Modal */}
            {selectedProgram && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setSelectedProgram(null)}>
                    <div className="bg-slate-800 p-6 rounded-lg max-w-lg w-full m-4 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-bold">{selectedProgram.title}</h3>
                        <p className="text-sm text-gray-400 mt-1">{selectedProgram.channelName}</p>
                        <p className="text-sm text-gray-300 mt-4">{selectedProgram.desc || 'No hay descripción disponible.'}</p>
                    </div>
                </div>
            )}
             <style>{`.animate-fade-in-fast { animation: fade-in 0.2s ease-out forwards; } @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }`}</style>
        </div>
    );
};

export default EpgGrid;
