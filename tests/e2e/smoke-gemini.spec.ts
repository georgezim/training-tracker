/**
 * Smoke test — Gemini API availability
 *
 * Hits the real Gemini REST API directly to verify the model name is correct
 * and the API key has access. This test is the canary for "AI routes will 503
 * in production" before any code is deployed.
 *
 * Skipped automatically when GEMINI_API_KEY is not set.
 */
import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

test.describe('Smoke — Gemini API', () => {
  test('model is reachable and returns a response', async ({ request }) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      test.skip(true, 'GEMINI_API_KEY not set — skipping smoke test');
    }

    const response = await request.post(`${GEMINI_URL}?key=${apiKey}`, {
      data: {
        contents: [{ parts: [{ text: 'Reply with exactly the word: ok' }] }],
      },
    });

    expect(
      response.status(),
      `Gemini returned ${response.status()} — model "${GEMINI_MODEL}" may be unavailable or the API key is invalid.\nBody: ${await response.text()}`
    ).toBe(200);

    const body = await response.json();
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;

    expect(text, 'Gemini response had no text content').toBeDefined();
    expect(typeof text).toBe('string');
    expect((text as string).length).toBeGreaterThan(0);
  });

  test('model supports structured JSON output (responseSchema)', async ({ request }) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      test.skip(true, 'GEMINI_API_KEY not set — skipping smoke test');
    }

    const response = await request.post(`${GEMINI_URL}?key=${apiKey}`, {
      data: {
        contents: [{ parts: [{ text: 'Rate this run: 8km easy run, 145 avg HR, felt comfortable.' }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              effort_rating: { type: 'string', enum: ['too_easy', 'right', 'too_hard'] },
              summary: { type: 'string' },
            },
            required: ['effort_rating', 'summary'],
          },
        },
      },
    });

    expect(
      response.status(),
      `Structured output request failed with ${response.status()}\nBody: ${await response.text()}`
    ).toBe(200);

    const body = await response.json();
    const rawText = body.candidates?.[0]?.content?.parts?.[0]?.text;
    expect(rawText, 'No text in structured output response').toBeDefined();

    const parsed = JSON.parse(rawText as string);
    expect(['too_easy', 'right', 'too_hard']).toContain(parsed.effort_rating);
    expect(typeof parsed.summary).toBe('string');
  });
});
