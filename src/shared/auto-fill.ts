import type { AutoFillResult, NetflixVideoContext } from './types';
import { generateObject } from 'ai';
import { z } from 'zod';
import { createLanguageModel, resolveProviderConfig } from './provider-factory';

const autoFillSchema = z.object({
  tone: z.string().describe('Suggested tone instructions for translation'),
  backgroundNotes: z.string().describe('Brief background about the title, plot, setting, themes'),
  characterNames: z.array(z.object({
    original: z.string().describe('Original character name'),
    translation: z.string().describe('Recommended translation of the character name'),
  })).describe('Key character names and their translations'),
  glossary: z.array(z.object({
    term: z.string().describe('Original term'),
    translation: z.string().describe('Recommended translation'),
  })).describe('Key terms and their translations'),
  sourceURLs: z.array(z.object({
    url: z.string().describe('Source URL used for context'),
    label: z.string().optional().describe('Label or title for the source'),
  })).describe('Sources used for context gathering'),
});

export interface AutoFillConfig {
  apiKey: string;
  provider?: string;
  endpoint?: string;
  model?: string;
}

export async function performAutoFill(
  videoId: string,
  videoTitle: string | undefined,
  sourceLanguage: string,
  targetLanguage: string,
  config: AutoFillConfig,
  netflixContext?: NetflixVideoContext
): Promise<AutoFillResult> {
  const resolved = resolveProviderConfig(config);
  const languageModel = createLanguageModel(resolved);

  const titleInfo = videoTitle ? `titled "${videoTitle}"` : `with ID ${videoId}`;
  const netflixHints = [
    netflixContext?.title ? `Netflix title: ${netflixContext.title}` : undefined,
    netflixContext?.synopsis ? `Netflix synopsis: ${netflixContext.synopsis}` : undefined,
    netflixContext?.maturityRating ? `Maturity rating: ${netflixContext.maturityRating}` : undefined,
    netflixContext?.genres?.length ? `Genres/tags: ${netflixContext.genres.join(', ')}` : undefined,
  ].filter(Boolean).join('\n');

  const result = await generateObject({
    model: languageModel,
    schema: autoFillSchema,
    prompt: `You are helping create a translation context profile for a Netflix show/movie ${titleInfo}. The source language is ${sourceLanguage} and the target language is ${targetLanguage}.

${netflixHints ? `Use these Netflix-provided context hints as higher-confidence context:\n${netflixHints}\n` : ''}

Based on your knowledge of this title, provide:
1. Tone instructions for translating subtitles
2. Brief background notes about the title
3. Key character names in the original language and their recommended ${targetLanguage} translations
4. Key terms/glossary entries with translations
5. Any source URLs you used (use real public URLs if possible)

If you are not confident about this title, provide generic suggestions and note the uncertainty in backgroundNotes. Never fabricate factually incorrect information.`,
  });

  return {
    tone: result.object.tone,
    backgroundNotes: result.object.backgroundNotes,
    characterNames: result.object.characterNames,
    glossary: result.object.glossary,
    sourceURLs: result.object.sourceURLs.map((s) => ({
      url: s.url,
      label: s.label,
    })),
  };
}
