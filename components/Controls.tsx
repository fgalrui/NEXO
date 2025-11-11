import React, { useRef, useEffect, useState } from 'react';
import { SubtitlesIcon, PipEnterIcon, PipExitIcon, SettingsIcon, EnterCompactIcon, CastIcon, CastConnectedIcon, SparklesIcon } from './icons';
import { SubtitleTrack, AudioTrack, SubtitleSettings, Chapter } from '../types';

// Icons defined outside the component to prevent re-creation on each render
const PlayIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
);
const PauseIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
);
const VolumeUpIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
);
const VolumeOffIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" /></svg>
);
const FullscreenIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>
);


interface ControlsProps {
  onPlayPause: () => void;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
  onSeek: (time: number) => void;
  onToggleFullscreen: () => void;
  onLoadSubtitles: () => void;
  onSelectSubtitleTrack: (track: SubtitleTrack | null) => void;
  availableSubtitleTracks: SubtitleTrack[];
  activeSubtitleTrack: SubtitleTrack | null;
  audioTracks: AudioTrack[];
  activeAudioTrack: AudioTrack | null;
  onSelectAudioTrack: (track: AudioTrack) => void;
  onPlaybackRateChange: (rate: number) => void;
  onTogglePip: () => void;
  onAnalyzeChapters: () => void;
  isAnalyzingChapters: boolean;
  chapters: Chapter[] | null;
  playing: boolean;
  volume: number;
  muted: boolean;
  duration: number;
  currentTime: number;
  bufferedTime: number;
  playbackRate: number;
  isPipActive: boolean;
  isPipSupported: boolean;
  subtitleSettings: SubtitleSettings;
  onSubtitleSettingsChange: (settings: Partial<SubtitleSettings>) => void;
  mediaType: 'iptv' | 'torrent' | 'local';
  onToggleCompactMode: () => void;
  castState: string;
  onCast: () => void;
}

const Controls: React.FC<ControlsProps> = ({
  onPlayPause,
  onVolumeChange,
  onMuteToggle,
  onSeek,
  onToggleFullscreen,
  onLoadSubtitles,
  onSelectSubtitleTrack,
  availableSubtitleTracks,
  activeSubtitleTrack,
  audioTracks,
  activeAudioTrack,
  onSelectAudioTrack,
  onPlaybackRateChange,
  onTogglePip,
  onAnalyzeChapters,
  isAnalyzingChapters,
  chapters,
  playing,
  volume,
  muted,
  duration,
  currentTime,
  bufferedTime,
  playbackRate,
  isPipActive,
  isPipSupported,
  subtitleSettings,
  onSubtitleSettingsChange,
  mediaType,
  onToggleCompactMode,
  castState,
  onCast,
}) => {
  const progressRef = useRef<HTMLInputElement>(null);
  const volumeRef = useRef<HTMLInputElement>(null);
  const [isTracksMenuOpen, setTracksMenuOpen] = useState(false);
  const [isSpeedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [isSettingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const isLiveStream = duration === Infinity;

  const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

  const formatTime = (timeInSeconds: number) => {
    if (isNaN(timeInSeconds) || timeInSeconds === Infinity) {
        return '00:00';
    }
    const date = new Date(0);
    date.setSeconds(timeInSeconds);
    const requiresHours = date.getUTCHours() > 0;
    return date.toISOString().substr(requiresHours ? 11 : 14, requiresHours ? 8 : 5);
  };

  useEffect(() => {
    if (isLiveStream) return;
    const progress = (currentTime / duration) * 100;
    if(progressRef.current) {
        progressRef.current.style.background = `linear-gradient(to right, #3b82f6 ${progress}%, transparent ${progress}%)`;
    }
  }, [currentTime, duration, isLiveStream]);

  useEffect(() => {
    const progress = (muted ? 0 : volume) * 100;
     if(volumeRef.current) {
        volumeRef.current.style.background = `linear-gradient(to right, #fff ${progress}%, rgba(255, 255, 255, 0.2) ${progress}%)`;
    }
  }, [volume, muted]);
  
  const bufferProgress = isLiveStream || !duration ? 0 : (bufferedTime / duration) * 100;
  const showTracksMenuButton = audioTracks.length > 1 || availableSubtitleTracks.length > 0;

  const SubtitleSettingsMenu = () => (
    <div className="absolute bottom-full right-0 mb-2 w-64 bg-slate-800/95 backdrop-blur-sm rounded-md shadow-lg ring-1 ring-black/5 py-2 text-sm text-white">
        <div className="px-3 pb-2">
            <label className="text-xs text-gray-400 font-semibold uppercase">Tamaño</label>
            <div className="flex justify-between mt-1">
                {['small', 'normal', 'large'].map(size => (
                    <button key={size} onClick={() => onSubtitleSettingsChange({ size: size as any })} className={`px-3 py-1 rounded w-full ${subtitleSettings.size === size ? 'bg-blue-600 text-white' : 'hover:bg-slate-700'}`}>
                        {size.charAt(0).toUpperCase() + size.slice(1)}
                    </button>
                ))}
            </div>
        </div>
        <div className="border-t border-slate-700 my-2"></div>
        <div className="px-3 pb-2">
            <label className="text-xs text-gray-400 font-semibold uppercase">Color</label>
            <div className="flex justify-between mt-1">
                {['white', 'yellow'].map(color => (
                     <button key={color} onClick={() => onSubtitleSettingsChange({ color: color as any })} className={`px-3 py-1 rounded w-full ${subtitleSettings.color === color ? 'bg-blue-600 text-white' : 'hover:bg-slate-700'}`}>
                        {color.charAt(0).toUpperCase() + color.slice(1)}
                    </button>
                ))}
            </div>
        </div>
         <div className="border-t border-slate-700 my-2"></div>
        <div className="px-3 pb-2">
            <label className="flex justify-between items-center cursor-pointer">
                <span className="text-xs text-gray-400 font-semibold uppercase">Fondo</span>
                <div className="relative">
                    <input type="checkbox" className="sr-only" checked={subtitleSettings.background} onChange={e => onSubtitleSettingsChange({ background: e.target.checked })} />
                    <div className={`block w-10 h-6 rounded-full ${subtitleSettings.background ? 'bg-blue-600' : 'bg-slate-600'}`}></div>
                    <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${subtitleSettings.background ? 'translate-x-4' : ''}`}></div>
                </div>
            </label>
        </div>
         <div className="border-t border-slate-700 my-2"></div>
        <div className="px-3 pb-2">
            <label className="text-xs text-gray-400 font-semibold uppercase">Sincronización</label>
            <div className="flex items-center justify-between mt-1">
                <button onClick={() => onSubtitleSettingsChange({ offset: subtitleSettings.offset - 0.1 })} className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600">-0.1s</button>
                <span className="font-mono">{subtitleSettings.offset.toFixed(1)}s</span>
                <button onClick={() => onSubtitleSettingsChange({ offset: subtitleSettings.offset + 0.1 })} className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600">+0.1s</button>
            </div>
        </div>
    </div>
  );

  return (
    <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-4 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover/player:opacity-100 focus-within:opacity-100 transition-opacity duration-300 z-20 group">
      {!isLiveStream && (
        <div className="w-full px-2 group/progress relative h-4 flex items-center">
            <div className="absolute top-1/2 -translate-y-1/2 left-2 right-2 h-[6px] bg-white/20 rounded-full">
                <div className="h-full bg-white/40 rounded-full transition-all duration-100" style={{ width: `${bufferProgress}%` }}></div>
                 {/* Chapter Markers */}
                {chapters && chapters.map(chapter => (
                    <div
                        key={chapter.timestamp}
                        className="absolute top-1/2 -translate-y-1/2 w-1 h-[10px] bg-white/70 rounded-sm"
                        style={{ left: `${(chapter.timestamp / duration) * 100}%` }}
                        title={chapter.name}
                    />
                ))}
            </div>
            <input
              ref={progressRef}
              type="range"
              min="0"
              max={duration || 1}
              value={currentTime}
              onChange={(e) => onSeek(parseFloat(e.target.value))}
              className="absolute w-full h-[6px] left-0 right-0 top-1/2 -translate-y-1/2"
            />
        </div>
      )}
      <div className="flex items-center space-x-2 sm:space-x-4 text-white px-2 mt-1">
        <button onClick={onPlayPause} className="p-2">
          {playing ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
        </button>
        
        <div className="flex items-center space-x-2 group/volume">
          <button onClick={onMuteToggle}>
            {muted || volume === 0 ? <VolumeOffIcon className="w-6 h-6" /> : <VolumeUpIcon className="w-6 h-6" />}
          </button>
          <input
            ref={volumeRef}
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={muted ? 0 : volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-0 group-hover/volume:w-24 h-[6px] transition-all duration-300"
          />
        </div>

        <div className="text-sm font-mono flex-shrink-0">
            {isLiveStream ? (
                <div className="flex items-center space-x-2 bg-red-600/80 px-2 py-1 rounded-md">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-200 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-300"></span>
                    </span>
                    <span className="text-xs font-semibold tracking-wider uppercase">En Vivo</span>
                </div>
            ) : (
                <>
                    <span>{formatTime(currentTime)}</span>
                    <span className="text-gray-400"> / </span>
                    <span>{formatTime(duration)}</span>
                </>
            )}
        </div>
      
        <div className="flex-1"></div> {/* Spacer */}
        
         {(mediaType === 'torrent' || mediaType === 'local') && !isLiveStream && (
             <button
                onClick={onAnalyzeChapters}
                disabled={isAnalyzingChapters || !!chapters}
                className="p-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title={chapters ? "Capítulos analizados" : "Analizar capítulos con IA"}
            >
                <SparklesIcon className={`w-6 h-6 ${isAnalyzingChapters ? 'animate-pulse text-purple-400' : chapters ? 'text-green-400' : 'text-white'}`} />
            </button>
        )}

        {!isLiveStream && (
            <div className="relative">
                <button
                    onClick={() => setSpeedMenuOpen(!isSpeedMenuOpen)}
                    className="p-2 text-sm font-semibold w-16 text-center"
                    title="Velocidad de reproducción"
                >
                    {playbackRate === 1 ? 'Normal' : `${playbackRate}x`}
                </button>
                {isSpeedMenuOpen && (
                    <div className="absolute bottom-full right-0 mb-2 w-28 bg-slate-800/95 backdrop-blur-sm rounded-md shadow-lg ring-1 ring-black/5 py-1 text-sm text-white">
                        {PLAYBACK_RATES.map(rate => (
                            <button
                                key={rate}
                                onClick={() => { onPlaybackRateChange(rate); setSpeedMenuOpen(false); }}
                                className={`w-full text-center px-3 py-1.5 hover:bg-slate-700 ${playbackRate === rate ? 'text-blue-400 font-semibold' : ''}`}
                            >
                                {rate === 1 ? 'Normal' : `${rate}x`}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        )}

        {showTracksMenuButton && (
            <div className="relative">
                <button 
                    onClick={() => setTracksMenuOpen(!isTracksMenuOpen)} 
                    className="p-2" 
                    title="Audio y Subtítulos"
                >
                    <SubtitlesIcon className={`w-6 h-6 transition-colors ${activeSubtitleTrack ? 'text-blue-400' : 'text-white'}`} />
                </button>

                {isTracksMenuOpen && (
                    <div className="absolute bottom-full right-0 mb-2 w-56 bg-slate-800/95 backdrop-blur-sm rounded-md shadow-lg ring-1 ring-black/5 py-1 text-sm text-white max-h-60 overflow-y-auto">
                        {audioTracks.length > 1 && (
                            <div className="px-3 pt-2 pb-1 text-xs text-gray-400 font-semibold uppercase">Audio</div>
                        )}
                        {audioTracks.length > 1 && audioTracks.map((track) => (
                             <button
                                key={track.id}
                                onClick={() => { onSelectAudioTrack(track); setTracksMenuOpen(false); }}
                                className={`w-full text-left px-3 py-1.5 hover:bg-slate-700 truncate ${activeAudioTrack?.id === track.id ? 'text-blue-400 font-semibold' : ''}`}
                            >
                                {track.label || track.language || `Audio ${track.id}`}
                            </button>
                        ))}
                         {(audioTracks.length > 1) && <div className="border-t border-slate-700 my-1"></div>}

                        <div className="px-3 pt-2 pb-1 text-xs text-gray-400 font-semibold uppercase">Subtítulos</div>
                        <button
                            onClick={() => { onSelectSubtitleTrack(null); setTracksMenuOpen(false); }}
                            className={`w-full text-left px-3 py-1.5 hover:bg-slate-700 ${!activeSubtitleTrack ? 'text-blue-400 font-semibold' : ''}`}
                        >
                            Desactivados
                        </button>
                        {availableSubtitleTracks.map((track) => (
                            <button
                                key={track.src || track.label}
                                onClick={() => { onSelectSubtitleTrack(track); setTracksMenuOpen(false); }}
                                className={`w-full text-left px-3 py-1.5 hover:bg-slate-700 truncate ${activeSubtitleTrack?.label === track.label ? 'text-blue-400 font-semibold' : ''}`}
                            >
                                {track.label}
                            </button>
                        ))}
                        <div className="border-t border-slate-700 my-1"></div>
                        <button
                            onClick={() => { onLoadSubtitles(); setTracksMenuOpen(false); }}
                            className="w-full text-left px-3 py-1.5 hover:bg-slate-700"
                        >
                            Cargar archivo...
                        </button>
                    </div>
                )}
            </div>
        )}
        
        <div className="relative">
            <button onClick={() => setSettingsMenuOpen(v => !v)} className="p-2" title="Ajustes de subtítulos">
                <SettingsIcon className="w-6 h-6" />
            </button>
            {isSettingsMenuOpen && <SubtitleSettingsMenu />}
        </div>
        
        {castState !== 'NO_DEVICES_AVAILABLE' && (
            <button onClick={onCast} className="p-2" title={castState === 'CONNECTED' ? 'Detener Cast' : 'Enviar a Dispositivo'}>
                {castState === 'CONNECTED' ? (
                    <CastConnectedIcon className="w-6 h-6 text-blue-400" />
                ) : (
                    <CastIcon className="w-6 h-6" />
                )}
            </button>
        )}
        
        {mediaType === 'iptv' && (
             <button onClick={onToggleCompactMode} className="p-2" title="Modo compacto">
                <EnterCompactIcon className="w-6 h-6" />
            </button>
        )}

        {isPipSupported && (
            <button onClick={onTogglePip} className="p-2" title={isPipActive ? "Salir de Picture-in-Picture" : "Entrar a Picture-in-Picture"}>
                {isPipActive ? <PipExitIcon className="w-6 h-6" /> : <PipEnterIcon className="w-6 h-6" />}
            </button>
        )}

        <button onClick={onToggleFullscreen} className="p-2">
            <FullscreenIcon className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};

export default Controls;