import type { AiSettings } from '../../types/ai';

type FetchLike = (input: string, init: {
  method: string;
  headers: Record<string, string>;
  body: string;
}) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DeepSeekChoice {
  message?: {
    content?: string | null;
  };
}

interface DeepSeekResponse {
  choices?: DeepSeekChoice[];
  error?: {
    message?: string;
    code?: string;
  };
}

export class DeepSeekClient {
  private readonly fetchImpl: FetchLike;

  constructor(
    private readonly settings: AiSettings,
    private readonly apiKey: string,
    fetchImpl?: FetchLike,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  async chatText(messages: DeepSeekMessage[], opts: { temperature?: number } = {}): Promise<string> {
    return this.request(messages, { json: false, temperature: opts.temperature });
  }

  async chatJson<T>(messages: DeepSeekMessage[], opts: { temperature?: number } = {}): Promise<T> {
    const text = await this.request(messages, { json: true, temperature: opts.temperature });
    try {
      return JSON.parse(stripJsonFence(text)) as T;
    } catch (error) {
      throw new Error(
        `deepseek.invalid_json:${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  private async request(
    messages: DeepSeekMessage[],
    opts: { json: boolean; temperature?: number },
  ): Promise<string> {
    const response = await this.fetchImpl(`${this.settings.baseUrl.replace(/\/+$/g, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.settings.model,
        messages,
        temperature: opts.temperature ?? 0.2,
        stream: false,
        thinking: { type: 'disabled' },
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    const raw = await response.text();
    let payload: DeepSeekResponse;
    try {
      payload = JSON.parse(raw) as DeepSeekResponse;
    } catch (error) {
      if (!response.ok) {
        throw new Error(`deepseek.http_${response.status}:${raw.slice(0, 240)}`, { cause: error });
      }
      throw new Error(
        `deepseek.invalid_response:${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    if (!response.ok) {
      const message = payload.error?.message ?? payload.error?.code ?? raw.slice(0, 240);
      throw new Error(`deepseek.http_${response.status}:${message}`);
    }

    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('deepseek.empty_response');
    }
    return content;
  }
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}
