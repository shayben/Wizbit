/**
 * Story generation service — uses Azure OpenAI GPT-4o-mini via the
 * Wizbit backend proxy (`/api/openai/chat`, purpose:'story-chapter').
 *
 * Per-user rate limits are enforced server-side; a 429 response surfaces
 * here as `QuotaExceededError` so the calling component can show the
 * upgrade screen.
 */

import { z } from 'zod';
import { apiPost } from './apiClient';

export interface StoryChoice {
  emoji: string;
  text: string;
}

export interface ChapterResult {
  chapterNumber: number;
  title: string;
  text: string;
  summary: string;
  choices: StoryChoice[];
  isEnding: boolean;
}

export interface StoryContext {
  prompt: string;
  readingLevel: string;
  chapters: { summary: string; choiceMade: string }[];
}

const LEVEL_CONFIG: Record<string, { words: number; vocab: string }> = {
  K: { words: 80, vocab: 'very simple words a 5-year-old knows, short sentences (5-8 words)' },
  '1': { words: 100, vocab: 'simple words a 6-year-old knows, short sentences (6-10 words)' },
  '2': { words: 130, vocab: 'common words a 7-year-old knows, sentences up to 12 words' },
  '3': { words: 180, vocab: 'grade-3 vocabulary, varied sentence lengths up to 15 words' },
  '4': { words: 220, vocab: 'grade-4 vocabulary with some challenging words, compound sentences allowed' },
  '5': { words: 280, vocab: 'grade-5 vocabulary, descriptive language, varied sentence structure' },
  '6': { words: 350, vocab: 'grade-6 vocabulary, rich descriptive language, complex sentences allowed' },
};

function buildSystemPrompt(readingLevel: string, chapterCount: number): string {
  const cfg = LEVEL_CONFIG[readingLevel] ?? LEVEL_CONFIG['3'];
  const isNearEnd = chapterCount >= 4;

  return `You are an award-winning children's storyteller writing an interactive "choose your own adventure" story.

READING LEVEL: Grade ${readingLevel}
VOCABULARY: ${cfg.vocab}
TARGET LENGTH: About ${cfg.words} words per chapter.

STORYTELLING RULES:
- Start each chapter with an exciting hook that pulls the reader in
- Use vivid sensory details (sights, sounds, smells) to make scenes come alive
- Build rising tension — every chapter should feel like something important is happening
- End each chapter on a cliffhanger or moment of suspense before the choices
- Make the main character relatable and brave
- Include dialogue to bring characters to life
- Keep paragraphs short (2-3 sentences) for easier reading

${isNearEnd ? 'IMPORTANT: The story has been going for several chapters. Start wrapping up toward a satisfying, exciting conclusion within the next 1-2 chapters.' : ''}

RESPONSE FORMAT: Return ONLY valid JSON (no markdown fences):
{
  "title": "Short exciting chapter title",
  "text": "The chapter text. Multiple paragraphs separated by \\n\\n.",
  "summary": "2-3 sentence summary of what happened in this chapter",
  "choices": [
    {"emoji": "🔥", "text": "Short description of choice 1"},
    {"emoji": "🌊", "text": "Short description of choice 2"},
    {"emoji": "⚡", "text": "Short description of choice 3"}
  ],
  "isEnding": false
}

If this is the final chapter (story reaches a natural conclusion), set "isEnding": true and "choices": [].
The ending should feel satisfying and celebrate the character's journey.`;
}

function buildUserMessage(context: StoryContext, choice?: string): string {
  if (context.chapters.length === 0) {
    return `Start a new adventure story based on this idea: "${context.prompt}"\n\nThis is Chapter 1.`;
  }

  const history = context.chapters
    .map((ch, i) => `Chapter ${i + 1}: ${ch.summary}\nChoice made: ${ch.choiceMade}`)
    .join('\n\n');

  const nextNum = context.chapters.length + 1;
  return `Story so far:\n${history}\n\nThe reader chose: "${choice}"\n\nWrite Chapter ${nextNum}.`;
}

const ChapterSchema = z.object({
  title: z.string().optional(),
  text: z.string(),
  summary: z.string().optional(),
  choices: z.array(z.object({
    emoji: z.string(),
    text: z.string(),
  })).optional(),
  isEnding: z.boolean().optional(),
});

export async function generateChapter(
  context: StoryContext,
  choice?: string,
): Promise<ChapterResult> {
  const chapterNumber = context.chapters.length + 1;

  const data = await apiPost<unknown, { content: string }>('/openai/chat', {
    purpose: 'story-chapter',
    messages: [
      { role: 'system', content: buildSystemPrompt(context.readingLevel, context.chapters.length) },
      { role: 'user', content: buildUserMessage(context, choice) },
    ],
    temperature: 0.85,
    max_tokens: 800,
  });

  const content = data.content ?? '';
  const jsonStr = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();

  try {
    const parsed = ChapterSchema.parse(JSON.parse(jsonStr));
    return {
      chapterNumber,
      title: parsed.title ?? `Chapter ${chapterNumber}`,
      text: parsed.text,
      summary: parsed.summary ?? '',
      choices: parsed.choices ?? [],
      isEnding: parsed.isEnding ?? false,
    };
  } catch {
    return {
      chapterNumber,
      title: `Chapter ${chapterNumber}`,
      text: content,
      summary: content.substring(0, 100),
      choices: [
        { emoji: '➡️', text: 'Continue the adventure' },
        { emoji: '🔄', text: 'Try a different path' },
        { emoji: '🏁', text: 'Find a way to end the story' },
      ],
      isEnding: false,
    };
  }
}
