export interface GeneratedSchedule { name: string; cron: string; prompt: string }
export const schedules: readonly GeneratedSchedule[] = [
  {
    "name": "daily-summary",
    "cron": "0 9 * * 1-5",
    "prompt": "Write a concise daily planning prompt with three prioritized actions and one risk to watch."
  }
];
