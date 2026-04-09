/**
 * Analyses reading text with Azure OpenAI GPT-4o-mini to identify
 * "key moments" — points in the text where we can show a relevant
 * image or play a short piece of music to make reading immersive.
 */

const OPENAI_ENDPOINT = import.meta.env.VITE_AZURE_OPENAI_ENDPOINT as string;
const OPENAI_KEY = import.meta.env.VITE_AZURE_OPENAI_KEY as string;
const OPENAI_DEPLOYMENT = import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT as string;

export interface KeyMoment {
  wordIndex: number;
  triggerWord: string;
  type: 'image' | 'music' | 'both';
  imageQuery?: string;
  musicCategory?: string;
  caption: string;
}

const SYSTEM_PROMPT = `You are a reading assistant for children ages 6-12. Analyse the given text and identify 2-4 key moments where showing a visual image or playing relevant background music would make reading more engaging.

For each moment return a JSON object with:
- wordIndex: 0-based index of the trigger word in the words array
- triggerWord: the actual trigger word
- type: "image", "music", or "both"
- imageQuery: a Wikipedia article title for finding an image (use underscores for spaces, e.g. "Napoleon", "Amazon_rainforest"). Only if type includes image.
- musicCategory: one of "nature", "dramatic", "celebration", "peaceful", "mysterious", "adventure", "ocean", "space". Only if type includes music.
- caption: a fun, kid-friendly one-sentence fact (max 15 words)

Return ONLY a valid JSON array. No markdown fences, no explanation.`;

export async function analyzeTextForMoments(words: string[]): Promise<KeyMoment[]> {
  if (!OPENAI_ENDPOINT || !OPENAI_KEY || !OPENAI_DEPLOYMENT) return [];

  const text = words.join(' ');
  const indexed = words.map((w, i) => `${i}:${w}`);
  const url = `${OPENAI_ENDPOINT}/openai/deployments/${OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-02-01`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'api-key': OPENAI_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Text: "${text}"\n\nWords (0-indexed): ${JSON.stringify(indexed)}` },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? '';
    const jsonStr = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const moments = JSON.parse(jsonStr) as KeyMoment[];

    return moments.filter(
      (m) =>
        typeof m.wordIndex === 'number' &&
        m.wordIndex >= 0 &&
        m.wordIndex < words.length &&
        typeof m.caption === 'string',
    );
  } catch {
    return [];
  }
}
