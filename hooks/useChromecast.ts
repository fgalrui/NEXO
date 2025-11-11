import { useState, useEffect, useCallback } from 'react';

// FIX: Add a global declaration for the 'chrome' object to resolve TypeScript errors
// related to the Chromecast API, which is loaded from an external script.
declare global {
  var chrome: any;
}

type CastState = 'NO_DEVICES_AVAILABLE' | 'NOT_CONNECTED' | 'CONNECTING' | 'CONNECTED';

export const useChromecast = (videoElement: HTMLVideoElement | null) => {
    const [castState, setCastState] = useState<CastState>('NO_DEVICES_AVAILABLE');
    // FIX: Replaced chrome.cast.Session with any to resolve namespace error.
    const [session, setSession] = useState<any | null>(null);
    // FIX: Replaced chrome.cast.media.RemotePlayer with any to resolve namespace error.
    const [remotePlayer, setRemotePlayer] = useState<any | null>(null);
    // FIX: Replaced chrome.cast.media.RemotePlayerController with any to resolve namespace error.
    const [remotePlayerController, setRemotePlayerController] = useState<any | null>(null);

    // FIX: Replaced chrome.cast.Session with any to resolve namespace error.
    const sessionListener = useCallback((newSession: any) => {
        console.log('New session ID: ' + newSession.sessionId);
        setSession(newSession);
        setCastState('CONNECTED');
    }, []);

    const receiverListener = useCallback((availability: string) => {
        if (availability === chrome.cast.ReceiverAvailability.AVAILABLE) {
            console.log('Receiver available');
            setCastState(prevState => (prevState === 'NO_DEVICES_AVAILABLE' ? 'NOT_CONNECTED' : prevState));
        } else {
            console.log('Receiver unavailable');
            setCastState('NO_DEVICES_AVAILABLE');
        }
    }, []);

    useEffect(() => {
        if (!(window as any).chrome?.cast?.isAvailable) {
            window['__onGCastApiAvailable'] = (isAvailable) => {
                if (isAvailable) {
                    initializeCastApi();
                }
            };
        } else {
            initializeCastApi();
        }
    }, []);
    
     const initializeCastApi = () => {
        const applicationId = chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID;
        const sessionRequest = new chrome.cast.SessionRequest(applicationId);
        const apiConfig = new chrome.cast.ApiConfig(sessionRequest, sessionListener, receiverListener);

        chrome.cast.initialize(apiConfig, 
            () => console.log('Cast API initialized.'),
            (err) => console.error('Cast API failed to initialize:', err)
        );
    };

    const requestSession = () => {
        setCastState('CONNECTING');
        chrome.cast.requestSession(
            (newSession) => {
                sessionListener(newSession);
            },
            (err) => {
                console.error('Session request failed:', err);
                setCastState('NOT_CONNECTED');
            }
        );
    };

    const stopCasting = () => {
        session?.stop(
            () => {
                setSession(null);
                setCastState('NOT_CONNECTED');
                setRemotePlayer(null);
                setRemotePlayerController(null);
                videoElement?.play();
            },
            (err) => console.error('Failed to stop session:', err)
        );
    };

    const castMedia = useCallback((url: string, title: string, subtitleUrl?: string) => {
        if (!session) {
            console.warn('Cannot cast media, no active session.');
            return;
        }
        
        console.log('Casting media: ', { url, title, subtitleUrl });
        videoElement?.pause();

        const mediaInfo = new chrome.cast.media.MediaInfo(url, 'video/mp4');
        mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata();
        mediaInfo.metadata.title = title;

        if (subtitleUrl) {
            const subtitleTrack = new chrome.cast.media.Track(1, chrome.cast.media.TrackType.TEXT);
            subtitleTrack.trackContentId = subtitleUrl;
            subtitleTrack.trackContentType = 'text/vtt';
            subtitleTrack.subtype = chrome.cast.media.TextTrackType.SUBTITLES;
            subtitleTrack.name = 'Subtítulos';
            subtitleTrack.language = 'es';
            mediaInfo.tracks = [subtitleTrack];
        }

        const request = new chrome.cast.media.LoadRequest(mediaInfo);
        
        if (subtitleUrl) {
            request.activeTrackIds = [1];
        }

        session.loadMedia(
            request,
            (media) => {
                console.log('Media loaded successfully');
                const player = new chrome.cast.media.RemotePlayer();
                const controller = new chrome.cast.media.RemotePlayerController(player);
                setRemotePlayer(player);
                setRemotePlayerController(controller);
            },
            (err) => console.error('Failed to load media:', err)
        );
    }, [session, videoElement]);

    return { castState, requestSession, stopCasting, castMedia, remotePlayer, remotePlayerController };
};
