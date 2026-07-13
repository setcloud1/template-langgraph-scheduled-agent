export interface GeneratedAgentTool {
  id: string;
  name: string;
  description: string;
  type: 'current_time' | 'http';
  enabled: boolean;
  method?: 'GET' | 'POST';
  url?: string;
}
export interface GeneratedKnowledgeSource {
  id: string;
  name: string;
  type: 'text' | 'url';
  value: string;
  enabled: boolean;
}
export interface GeneratedAgentConfig {
  version: 1;
  instructions: string;
  modelId: string;
  temperature: number;
  tools: GeneratedAgentTool[];
  knowledge: GeneratedKnowledgeSource[];
  triggers: { api: boolean; schedules: boolean };
}
export const agentConfig: GeneratedAgentConfig = {
  "version": 1,
  "instructions": "You are a concise, accurate assistant. Use tools when they improve the answer.",
  "modelId": "claude-haiku-4.5",
  "temperature": 0.2,
  "tools": [
    {
      "id": "current-time",
      "name": "current_time",
      "description": "Get the current date and time in an IANA time zone.",
      "type": "current_time",
      "enabled": true
    }
  ],
  "knowledge": [],
  "triggers": {
    "api": true,
    "schedules": true
  }
};
