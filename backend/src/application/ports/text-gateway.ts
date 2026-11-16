export interface RinTextRequest {
  systemPrompt: string;
  message: string;
  maxTokens: number;
  temperature: number;
  topP?: number | undefined;
}
/**
 * Plain text generation for the proactive/reminder cron flows. Unlike the agent
 * model gateway it never uses tools and returns a single user-facing string
 * (already stripped of protocol markup), or an empty string when unusable.
 */
export interface RinTextGateway {
  complete(request: RinTextRequest): Promise<string>;
}
