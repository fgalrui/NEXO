export interface Channel {
    name: string;
    url: string;
    logo?: string;
    group?: string;
    tvgId?: string;
}

export const parseM3U = (content: string, baseUrl?: string): Channel[] => {
    const channels: Channel[] = [];
    const lines = content.split(/\r?\n/);

    let currentChannel: Partial<Channel> = {};

    for (const line of lines) {
        const trimmedLine = line.trim();

        if (trimmedLine.startsWith('#EXTINF:')) {
            currentChannel = {}; 

            const lastCommaIndex = trimmedLine.lastIndexOf(',');
            const name = lastCommaIndex !== -1 ? trimmedLine.substring(lastCommaIndex + 1).trim() : 'Canal sin título';

            const logoMatch = trimmedLine.match(/tvg-logo="([^"]+)"/);
            const groupMatch = trimmedLine.match(/group-title="([^"]+)"/);
            const tvgNameMatch = trimmedLine.match(/tvg-name="([^"]+)"/);
            const tvgIdMatch = trimmedLine.match(/tvg-id="([^"]+)"/);
            
            currentChannel = {
                name: tvgNameMatch ? tvgNameMatch[1].trim() : name,
                logo: logoMatch ? logoMatch[1] : undefined,
                group: groupMatch ? groupMatch[1] : 'Sin categoría',
                tvgId: tvgIdMatch ? tvgIdMatch[1] : undefined,
            };
        } else if (trimmedLine && !trimmedLine.startsWith('#')) {
            if (currentChannel.name) {
                let absoluteUrl = trimmedLine;
                // Si tenemos una URL base y la URL del canal es relativa, la resolvemos.
                if (baseUrl && !trimmedLine.startsWith('http')) {
                    try {
                        absoluteUrl = new URL(trimmedLine, baseUrl).href;
                    } catch (e) {
                        console.error(`URL inválida encontrada: ${trimmedLine}`, e);
                        // Si la URL es inválida, saltamos este canal
                        currentChannel = {};
                        continue;
                    }
                }
                
                channels.push({
                    ...currentChannel,
                    url: absoluteUrl,
                } as Channel);
                currentChannel = {}; 
            }
        }
    }

    return channels;
};