import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { build } from 'esbuild';

const schedulesDir = new URL('./agent/schedules/', import.meta.url);
const configFile = new URL('./agent/setcloud.json', import.meta.url);

const defaultConfig = {
  version: 1,
  instructions: 'You are a concise, accurate assistant. Use tools when they improve the answer.',
  modelId: 'claude-haiku-4.5',
  temperature: 0.2,
  tools: [{
    id: 'current-time',
    name: 'current_time',
    description: 'Get the current date and time in an IANA time zone.',
    type: 'current_time',
    enabled: true,
  }],
  knowledge: [],
  triggers: { api: true, schedules: true },
};

async function readAgentConfig() {
  try {
    return { ...defaultConfig, ...JSON.parse(await readFile(configFile, 'utf8')) };
  } catch (error) {
    if (error?.code === 'ENOENT') return defaultConfig;
    throw error;
  }
}

async function readSchedules() {
  let files = [];
  try {
    files = await readdir(schedulesDir);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const schedules = [];
  for (const file of files.filter((name) => extname(name) === '.md').sort()) {
    const source = await readFile(new URL(file, schedulesDir), 'utf8');
    const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
    if (!match) continue;
    const cron = match[1].match(/^cron:\s*["']?([^"'\r\n]+)["']?\s*$/m)?.[1]?.trim();
    const prompt = match[2].trim();
    if (!cron || !prompt) continue;
    schedules.push({ name: basename(file, '.md'), cron, prompt });
  }
  return schedules;
}

await mkdir(new URL('./src/generated/', import.meta.url), { recursive: true });
await writeFile(
  new URL('./src/generated/schedules.ts', import.meta.url),
  `export interface GeneratedSchedule { name: string; cron: string; prompt: string }\nexport const schedules: readonly GeneratedSchedule[] = ${JSON.stringify(await readSchedules(), null, 2)};\n`,
);
await writeFile(
  new URL('./src/generated/config.ts', import.meta.url),
  `export interface GeneratedAgentTool {\n  id: string;\n  name: string;\n  description: string;\n  type: 'current_time' | 'http';\n  enabled: boolean;\n  method?: 'GET' | 'POST';\n  url?: string;\n}\nexport interface GeneratedKnowledgeSource {\n  id: string;\n  name: string;\n  type: 'text' | 'url';\n  value: string;\n  enabled: boolean;\n}\nexport interface GeneratedAgentConfig {\n  version: 1;\n  instructions: string;\n  modelId: string;\n  temperature: number;\n  tools: GeneratedAgentTool[];\n  knowledge: GeneratedKnowledgeSource[];\n  triggers: { api: boolean; schedules: boolean };\n}\nexport const agentConfig: GeneratedAgentConfig = ${JSON.stringify(await readAgentConfig(), null, 2)};\n`,
);
await mkdir(new URL('./.output/server/', import.meta.url), { recursive: true });
await build({
  entryPoints: [join(process.cwd(), 'src/handler.ts')],
  outfile: join(process.cwd(), '.output/server/index.mjs'),
  platform: 'node',
  target: 'node24',
  format: 'esm',
  bundle: true,
  sourcemap: true,
  minify: false,
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
