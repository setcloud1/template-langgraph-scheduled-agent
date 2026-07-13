# SetCloud LangGraph scheduled agent

A SetCloud-maintained TypeScript starter for recurring agent automations. It is
built on LangChain's production agent API and LangGraph runtime, deploys on
SetCloud's serverless agent runtime, uses the SetCloud AI Gateway, persists
LangGraph checkpoints in the managed agent database, and publishes schedules
from source-controlled Markdown files.

## Create the agent

In the SetCloud dashboard, open **Agents**, choose **Templates**, and clone the
**LangGraph Scheduled Agent** template into your GitHub account. Before the first deploy,
create a secret named `SET_AGENT_PASSWORD` and link it to the project. The
message endpoint rejects every request until that secret exists.

Grant the SetCloud GitHub App access to the generated repository to enable
push-to-deploy. Deploy the agent, then call it with:

```bash
curl -X POST "https://YOUR_AGENT/set/v1/session" \
  -H "Authorization: Bearer $SET_AGENT_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"demo","message":"What time is it in America/New_York?"}'
```

SetCloud injects `SET_GATEWAY_URL`, `SET_GATEWAY_KEY`, `SET_DRAIN_TOKEN`, and
`SET_AGENT_POSTGRES_URL`. Do not create or commit those values. Set
`SETCLOUD_MODEL` to a model id available in your AI Gateway; the default is
`claude-haiku-4.5`. Set `SET_AGENT_INSTRUCTIONS` to replace the system prompt.

The dashboard Builder writes `agent/setcloud.json`. That manifest controls the
default model, instructions, temperature, tools, knowledge sources, and enabled
triggers. Environment variables remain deployment-level overrides for the model
and instructions.

## Scheduled automations

Markdown files in `agent/schedules` become scheduled automations. The dashboard
edits the same files and commits changes to your repository. Each file needs a
five-field cron expression in front matter and the prompt as its body.

The included `daily-summary` automation runs at 09:00 UTC every weekday. Edit
its cron expression and prompt before deploying it for production use.

## Local verification

```bash
corepack enable
pnpm install
pnpm typecheck
pnpm test
SET_GATEWAY_URL=https://gateway.invalid/v1 SET_GATEWAY_KEY=test pnpm build:set
```

The build output must contain `.output/server/index.mjs`. A local model call
requires your own OpenAI-compatible endpoint and credentials; never reuse the
platform-injected deployment key outside SetCloud.

## Maintenance

SetCloud pins and tests runtime dependencies. Generated repositories are owned
by the client and do not receive updates automatically. Compare against this
repository when adopting later changes. See [NOTICE](NOTICE) for dependency
attribution and [LICENSE](LICENSE) for the template license.
