import { EpgData, EpgProgram } from '../types';

// Function to parse the non-standard date format from XMLTV
const parseXmlTvDate = (dateString: string): number => {
    // Format: 20240728160000 +0000
    const year = parseInt(dateString.substring(0, 4), 10);
    const month = parseInt(dateString.substring(4, 6), 10) - 1; // Month is 0-indexed
    const day = parseInt(dateString.substring(6, 8), 10);
    const hour = parseInt(dateString.substring(8, 10), 10);
    const minute = parseInt(dateString.substring(10, 12), 10);
    const second = parseInt(dateString.substring(12, 14), 10);

    // Basic timezone handling (offset)
    const offsetMatch = dateString.substring(15).match(/([+-])(\d{2})(\d{2})/);
    let date = new Date(Date.UTC(year, month, day, hour, minute, second));

    if (offsetMatch) {
        const sign = offsetMatch[1] === '+' ? -1 : 1;
        const offsetHours = parseInt(offsetMatch[2], 10);
        const offsetMinutes = parseInt(offsetMatch[3], 10);
        const offsetMilliseconds = (offsetHours * 3600 + offsetMinutes * 60) * 1000 * sign;
        date = new Date(date.getTime() + offsetMilliseconds);
    }
    
    return date.getTime();
};

export const parseXMLTV = (xmlString: string): EpgData => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    const programsMap: EpgData = new Map();

    const programNodes = xmlDoc.getElementsByTagName('programme');

    for (let i = 0; i < programNodes.length; i++) {
        const node = programNodes[i];
        const channelId = node.getAttribute('channel');
        const startStr = node.getAttribute('start');
        const stopStr = node.getAttribute('stop');

        const titleNode = node.getElementsByTagName('title')[0];
        const descNode = node.getElementsByTagName('desc')[0];

        if (channelId && startStr && stopStr && titleNode) {
            const program: EpgProgram = {
                title: titleNode.textContent || 'Sin título',
                desc: descNode?.textContent || undefined,
                start: parseXmlTvDate(startStr),
                end: parseXmlTvDate(stopStr),
            };

            if (!programsMap.has(channelId)) {
                programsMap.set(channelId, []);
            }
            programsMap.get(channelId)!.push(program);
        }
    }

    // Sort programs by start time for each channel
    for (const [channelId, programs] of programsMap.entries()) {
        programs.sort((a, b) => a.start - b.start);
    }

    return programsMap;
};
