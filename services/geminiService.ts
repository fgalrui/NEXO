import { GoogleGenAI, Type } from "@google/genai";
import { GeminiInfo, Chapter } from "../types";

const cleanName = (name: string): string => {
    // Remove common tags, file extensions, and clean up separators
    return name
        .replace(/\.(mkv|mp4|avi|mov|srt)$/i, '') // remove file extensions
        .replace(/\b(1080p|720p|2160p|4K|UHD|HD|BluRay|WEB-DL|WEBRip|x264|x265|HEVC|AAC|DTS|AC3)\b/gi, '')
        .replace(/\[[^\]]+\]/g, '') // Tags in brackets
        .replace(/\([^)]+\)/g, '') // Tags in parentheses
        .replace(/\./g, ' ')       // Replace dots with spaces
        .replace(/_/g, ' ')        // Replace underscores with spaces
        .replace(/S\d{2}E\d{2}/i, '') // S01E01 format
        .replace(/\s{2,}/g, ' ')     // Collapse multiple spaces
        .trim();
};

const infoSchema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING, description: "El título oficial de la película o del episodio de la serie." },
        year: { type: Type.INTEGER, description: "El año de estreno." },
        rating: { type: Type.STRING, description: "La calificación, por ejemplo '8.5/10 IMDb'." },
        summary: { type: Type.STRING, description: "Una sinopsis corta y atractiva de 1 o 2 frases. Si es un episodio, debe ser la sinopsis del episodio, no de la serie." },
        posterUrl: { type: Type.STRING, description: "Una URL directa a una imagen del póster oficial en alta calidad. Si es un episodio, puede ser una imagen representativa del episodio o el póster de la serie." },
    },
    required: ["title", "year", "rating", "summary", "posterUrl"],
};

const chaptersSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            timestamp: { type: Type.INTEGER, description: "El momento de inicio del capítulo en segundos totales desde el inicio del video." },
            name: { type: Type.STRING, description: "Un nombre corto y descriptivo para el capítulo (ej. 'Introducción', 'Batalla Final')." }
        },
        required: ["timestamp", "name"]
    }
};


const callGemini = async (prompt: string, schema: any) => {
    if (!process.env.API_KEY) {
        console.error("API_KEY for Gemini is not set.");
        return null;
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
         const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema,
            },
        });
        
        const text = response.text;
        if (!text) return null;
        
        return JSON.parse(text);

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        return null;
    }
};

export const getContentInfo = async (fileName: string): Promise<GeminiInfo | null> => {
    const cleanedName = cleanName(fileName);
    const prompt = `
        Basado en el siguiente nombre de archivo, identifica la película o el episodio de la serie y proporciona la información solicitada en formato JSON.
        Nombre del archivo: "${cleanedName}"
        
        Si es un episodio de una serie, la información (especialmente el resumen y el título) debe ser específica de ESE EPISODIO. Si es una película, la información debe ser sobre la película.
    `;
    const result = await callGemini(prompt, infoSchema);
    return result as GeminiInfo | null;
};


export const getVideoChapters = async (title: string, durationInSeconds: number): Promise<Chapter[] | null> => {
    const prompt = `
        Genera una lista de capítulos clave en formato JSON para el siguiente contenido de video.
        Título: "${title}"
        Duración total: ${Math.round(durationInSeconds)} segundos.

        Crea entre 5 y 15 capítulos. Los timestamps deben estar distribuidos a lo largo de la duración total.
        Incluye capítulos relevantes como "Introducción", "Créditos iniciales", puntos clave de la trama, y "Créditos finales".
        El timestamp debe ser el inicio del capítulo en segundos.
    `;
    const result = await callGemini(prompt, chaptersSchema);
    return result as Chapter[] | null;
};