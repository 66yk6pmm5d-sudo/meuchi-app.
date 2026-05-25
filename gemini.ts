import type { Message, UserMemory } from '../types';

const SYSTEM_PROMPT = `あなたは「めうち」という名前のAI相棒です。ユーザーの親友・相棒として、落ち着いていて頼れる存在です。丁寧だけど堅くなく、「〜だよ」「〜だね」のような自然な口調で話してください。ユーザーの状態を読んで寄り添い、会話を重ねるごとにその人の癖や好みを覚えていきます。

返答は短めに、自然な会話のテンポで。長い説明より、相手の言葉に寄り添うことを優先してね。`;

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

function buildHistory(messages: Message[]): GeminiContent[] {
  return messages.slice(-20).map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));
}

function buildSystemWithMemory(memory: UserMemory): string {
  const facts = memory.facts.length
    ? `\n\n【ユーザーについて覚えていること】\n${memory.facts.join('\n')}`
    : '';
  const prefs = Object.keys(memory.preferences).length
    ? `\n\n【ユーザーの好み】\n${Object.entries(memory.preferences)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')}`
    : '';
  return SYSTEM_PROMPT + facts + prefs;
}

export async function sendMessage(
  apiKey: string,
  userText: string,
  history: Message[],
  memory: UserMemory,
  imageBase64?: string,
  imageMime?: string
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const userParts: GeminiPart[] = [];
  if (imageBase64 && imageMime) {
    userParts.push({ inlineData: { mimeType: imageMime, data: imageBase64 } });
  }
  if (userText) userParts.push({ text: userText });

  const contents: GeminiContent[] = [
    ...buildHistory(history),
    { role: 'user', parts: userParts },
  ];

  const body = {
    system_instruction: { parts: [{ text: buildSystemWithMemory(memory) }] },
    contents,
    generationConfig: {
      temperature: 0.9,
      maxOutputTokens: 512,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: { message?: string } })?.error?.message || `HTTP ${res.status}`
    );
  }

  const data = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'うまく返答できなかったよ…もう一度試してみてね。';
}

export async function analyzeImage(
  apiKey: string,
  imageBase64: string,
  imageMime: string,
  prompt: string
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: imageMime, data: imageBase64 } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
