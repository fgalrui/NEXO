import { useState, useEffect, useCallback } from 'react';
import { Channel } from '../types';
import { getFavoriteChannels, setFavoriteChannels } from '../utils/storage';

export const useFavorites = () => {
    const [favorites, setFavorites] = useState<Channel[]>([]);

    useEffect(() => {
        setFavorites(getFavoriteChannels());
    }, []);

    const isFavorite = useCallback((channel: Channel) => {
        return favorites.some(fav => fav.url === channel.url);
    }, [favorites]);

    const toggleFavorite = useCallback((channel: Channel) => {
        let updatedFavorites;
        if (isFavorite(channel)) {
            updatedFavorites = favorites.filter(fav => fav.url !== channel.url);
        } else {
            updatedFavorites = [...favorites, channel];
        }
        setFavorites(updatedFavorites);
        setFavoriteChannels(updatedFavorites);
    }, [favorites, isFavorite]);

    return { favorites, isFavorite, toggleFavorite };
};
