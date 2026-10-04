import "server-only";
import { ChatDeepSeek } from "@langchain/deepseek";
import { AppError } from "@/lib/config";

export const SUPPORT_MODEL = "deepseek-flash";

export function supportModel() {
  if (!process.env.DEEPSEEK_API_KEY) throw new AppError("Connect DeepSeek to start the support agent.", 503);
  return new ChatDeepSeek({
    apiKey: process.env.DEEPSEEK_API_KEY,
    model: SUPPORT_MODEL,
    temperature: 0.2,
    maxTokens: 1500,
    timeout: 45000,
    maxRetries: 1,
    // The customer receives the final answer only. No reasoning is streamed.
    modelKwargs: { thinking: { type: "disabled" } },
  });
}
