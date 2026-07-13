import { timingSafeEqual } from 'node:crypto';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { ChatOpenAI } from '@langchain/openai';
import { createAgent, tool } from 'langchain';
import { z } from 'zod';
import { agentConfig } from './generated/config.js';
import { schedules } from './generated/schedules.js';

interface AlbEvent {
  body?: string | null;
  headers?: Record<string, string | undefined>;
  httpMethod?: string;
  isBase64Encoded?: boolean;
  path?: string;
}

interface MessageBody {
  message?: unknown;
  sessionId?: unknown;
}

let checkpointer: PostgresSaver | null = null;
let checkpointerReady: Promise<void> | null = null;

function json(statusCode: number, data: unknown) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(data),
  };
}

function requestBody(event: AlbEvent): MessageBody {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  try {
    return JSON.parse(raw) as MessageBody;
  } catch {
    return {};
  }
}

function secureEqual(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function bearer(event: AlbEvent): string {
  const value = event.headers?.authorization ?? event.headers?.Authorization ?? '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

function sessionAuthorized(event: AlbEvent): boolean {
  const password = process.env.SET_AGENT_PASSWORD;
  return Boolean(password && secureEqual(bearer(event), password));
}

function platformAuthorized(event: AlbEvent): boolean {
  const expected = process.env.SET_DRAIN_TOKEN;
  const actual = event.headers?.['x-set-drain-token'] ?? '';
  return Boolean(expected && secureEqual(actual, expected));
}

async function getCheckpointer(): Promise<PostgresSaver | undefined> {
  const connectionString = process.env.SET_AGENT_POSTGRES_URL;
  if (!connectionString) return undefined;
  checkpointer ??= PostgresSaver.fromConnString(connectionString, { schema: 'langgraph' });
  checkpointerReady ??= checkpointer.setup();
  await checkpointerReady;
  return checkpointer;
}

function textContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((part) => (
      typeof part === 'object' && part && 'text' in part ? String(part.text) : ''
    )).join('');
  }
  return String(value ?? '');
}

function configuredTools() {
  return agentConfig.tools.filter((definition) => definition.enabled).map((definition) => {
    if (definition.type === 'current_time') {
      return tool(
        ({ timeZone }) => new Intl.DateTimeFormat('en-US', {
          dateStyle: 'full',
          timeStyle: 'long',
          timeZone,
        }).format(new Date()),
        {
          name: definition.name,
          description: definition.description,
          schema: z.object({ timeZone: z.string().default('UTC') }),
        },
      );
    }

    return tool(
      async ({ input }) => {
        if (!definition.url || !definition.method) throw new Error('HTTP tool is incomplete');
        const url = new URL(definition.url);
        const init: RequestInit = {
          method: definition.method,
          signal: AbortSignal.timeout(15_000),
        };
        if (definition.method === 'GET') {
          for (const [key, value] of Object.entries(input || {})) {
            url.searchParams.set(key, String(value));
          }
        } else {
          init.headers = { 'content-type': 'application/json' };
          init.body = JSON.stringify(input || {});
        }
        const response = await fetch(url, init);
        const body = (await response.text()).slice(0, 50_000);
        if (!response.ok) throw new Error(`Tool request failed with status ${response.status}`);
        return body;
      },
      {
        name: definition.name,
        description: definition.description,
        schema: z.object({ input: z.record(z.string(), z.unknown()).optional() }),
      },
    );
  });
}

async function knowledgeContext(): Promise<string> {
  const parts = await Promise.all(agentConfig.knowledge
    .filter((source) => source.enabled)
    .map(async (source) => {
      if (source.type === 'text') return `${source.name}:\n${source.value}`;
      try {
        const response = await fetch(source.value, { signal: AbortSignal.timeout(10_000) });
        if (!response.ok) return '';
        return `${source.name}:\n${(await response.text()).slice(0, 50_000)}`;
      } catch {
        return '';
      }
    }));
  const available = parts.filter(Boolean);
  return available.length ? `\n\nKnowledge:\n${available.join('\n\n')}` : '';
}

async function runAgent(message: string, sessionId: string): Promise<string> {
  const gatewayUrl = process.env.SET_GATEWAY_URL;
  const gatewayKey = process.env.SET_GATEWAY_KEY;
  if (!gatewayUrl || !gatewayKey) throw new Error('SetCloud gateway configuration is unavailable');

  const model = new ChatOpenAI({
    model: process.env.SETCLOUD_MODEL || agentConfig.modelId,
    apiKey: gatewayKey,
    configuration: { baseURL: gatewayUrl },
    temperature: agentConfig.temperature,
    maxRetries: 2,
  });
  const agent = createAgent({
    model,
    tools: configuredTools(),
    systemPrompt: process.env.SET_AGENT_INSTRUCTIONS
      || `${agentConfig.instructions}${await knowledgeContext()}`,
    checkpointer: await getCheckpointer(),
  });
  const result = await agent.invoke(
    { messages: [{ role: 'user' as const, content: message }] },
    { configurable: { thread_id: sessionId } },
  );
  return textContent(result.messages.at(-1)?.content);
}

async function handleSchedule(event: AlbEvent, path: string) {
  if (!platformAuthorized(event)) return json(401, { error: 'Unauthorized' });
  if (!agentConfig.triggers.schedules) return json(404, { error: 'Not found' });
  if (path === '/.well-known/set/v1/schedules') {
    return json(200, { schedules: schedules.map(({ name, cron }) => ({ name, cron })) });
  }
  const match = path.match(/^\/\.well-known\/set\/v1\/schedules\/([^/]+)\/trigger$/);
  if (!match) return json(404, { error: 'Not found' });
  const schedule = schedules.find((item) => item.name === decodeURIComponent(match[1]));
  if (!schedule) return json(404, { error: 'Schedule not found' });
  const answer = await runAgent(schedule.prompt, `schedule:${schedule.name}`);
  return json(200, { ok: true, schedule: schedule.name, answer });
}

export async function handler(event: AlbEvent) {
  const path = event.path || '/';
  if (path === '/set/v1/health') return json(200, { status: 'ok' });
  if (path.startsWith('/.well-known/')) return handleSchedule(event, path);
  if (path !== '/set/v1/session' || event.httpMethod !== 'POST') {
    return json(404, { error: 'Not found' });
  }
  if (!agentConfig.triggers.api) return json(404, { error: 'Not found' });
  if (!sessionAuthorized(event)) {
    return json(401, { error: 'Set SET_AGENT_PASSWORD and send it as a Bearer token.' });
  }
  const body = requestBody(event);
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const sessionId = typeof body.sessionId === 'string' && body.sessionId.trim()
    ? body.sessionId.trim().slice(0, 120)
    : 'default';
  if (!message || message.length > 20_000) {
    return json(400, { error: 'message must contain 1 to 20000 characters' });
  }
  try {
    return json(200, { sessionId, answer: await runAgent(message, sessionId) });
  } catch (error) {
    console.error('Agent invocation failed', error);
    return json(502, { error: 'The agent could not complete this request.' });
  }
}
