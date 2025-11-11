import React, { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { Channel } from '../types';

interface PlayerProps {
  channel: Channel | null;
  videoRef: React.RefObject<HTMLVideoElement>;
}

const Player: React.FC<PlayerProps> = ({ channel, videoRef }) => {
  useEffect(() => {
    let hls: Hls | null = null;
    let isMounted = true;

    const cleanup = () => {
        isMounted = false;
        if (hls) {
            hls.destroy();
            hls = null;
        }
    };

    if (!channel || !videoRef.current) {
      return cleanup;
    }

    const video = videoRef.current;
    const originalUrl = channel.url;
    
    const hlsConfig = {
      manifestLoadingMaxRetry: 5,
      manifestLoadingRetryDelay: 1000,
      manifestLoadingRetryTimeout: 10000,
      fragLoadingMaxRetry: 6,
      fragLoadingRetryDelay: 1000,
      fragLoadingRetryTimeout: 20000,
      enableWorker: true,
    };

    const attemptLoad = (urlToLoad: string, isProxyAttempt = false) => {
        if (!isMounted) return;
        
        if (Hls.isSupported()) {
            if (hls) {
                hls.destroy();
            }
            hls = new Hls(hlsConfig);

            hls.on(Hls.Events.ERROR, (event, data) => {
                console.error(`HLS.js error: type: ${data.type}, details: ${data.details}, fatal: ${data.fatal}`);
                if (data.response) {
                    console.error(`- Response code: ${data.response.code}`);
                    console.error(`- Response text: ${data.response.text}`);
                }

                if (data.type === Hls.ErrorTypes.NETWORK_ERROR &&
                    data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR &&
                    !isProxyAttempt) {
                    
                    console.warn('Direct manifest load failed (likely CORS). Retrying with proxy...');
                    const proxy = 'https://api.allorigins.win/raw?url=';
                    const proxiedUrl = `${proxy}${encodeURIComponent(originalUrl)}`;
                    attemptLoad(proxiedUrl, true);
                    return;
                }

                if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            console.error('Fatal network error encountered, trying to recover...');
                            hls?.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            console.error('Fatal media error encountered, trying to recover...');
                            hls?.recoverMediaError();
                            break;
                        default:
                            console.error('Unrecoverable HLS.js error.');
                            break;
                    }
                }
            });

            hls.loadSource(urlToLoad);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                if(isMounted) video.play().catch(error => console.error("Autoplay was prevented:", error));
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = urlToLoad;
            video.addEventListener('loadedmetadata', () => {
                if(isMounted) video.play().catch(error => console.error("Autoplay was prevented:", error));
            });
        }
    };

    // Start with the original URL
    attemptLoad(originalUrl);

    return cleanup;
  }, [channel, videoRef]);
  
  return (
    <div className="w-full h-full bg-black flex items-center justify-center">
        {!channel && <div className="text-gray-400">Selecciona un canal para empezar a ver.</div>}
    </div>
  );
};

export default Player;