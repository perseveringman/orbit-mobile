import { describe, expect, it } from 'vitest';

import { DeepSeekClient } from '@/core/ai/deepseek-client';
import { DEFAULT_AI_SETTINGS } from '@/core/settings/app-settings';

describe('DeepSeekClient', () => {
  it('posts OpenAI-compatible JSON requests and parses JSON content', async () => {
    const fetchImpl = (url: string, init: { body: string; headers: Record<string, string> }) => {
      expect(url).toBe('https://api.deepseek.com/chat/completions');
      expect(init.headers.Authorization).toBe('Bearer sk-test');
      const body = JSON.parse(init.body) as Record<string, unknown>;
      expect(body).toMatchObject({
        model: 'deepseek-v4-flash',
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
      });
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' } }],
        })),
      });
    };

    await expect(
      new DeepSeekClient(DEFAULT_AI_SETTINGS, 'sk-test', fetchImpl).chatJson<{ ok: boolean }>([
        { role: 'user', content: 'hi' },
      ]),
    ).resolves.toEqual({ ok: true });
  });

  it('surfaces HTTP and invalid JSON errors', async () => {
    const httpFail = () => Promise.resolve({
      ok: false,
      status: 401,
      text: () => Promise.resolve(JSON.stringify({ error: { message: 'bad key' } })),
    });
    await expect(
      new DeepSeekClient(DEFAULT_AI_SETTINGS, 'bad', httpFail).chatText([
        { role: 'user', content: 'hi' },
      ]),
    ).rejects.toThrow('deepseek.http_401:bad key');

    const badJson = () => Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({
        choices: [{ message: { content: 'not-json' } }],
      })),
    });
    await expect(
      new DeepSeekClient(DEFAULT_AI_SETTINGS, 'sk-test', badJson).chatJson([
        { role: 'user', content: 'hi' },
      ]),
    ).rejects.toThrow('deepseek.invalid_json');
  });
});
