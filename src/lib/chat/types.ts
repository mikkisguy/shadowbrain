import type { ChatProvider } from "@/lib/settings/provider-connection";

export interface Target {
  provider: ChatProvider;
  model: string;
}

export interface ThreadRow {
  id: string;
  title: string;
  target_provider: string;
  target_model: string;
  grounded: number;
  allow_model_save: number;
  include_private_in_ai: number;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  thread_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls: string | null;
  tool_call_id: string | null;
  target_provider: string | null;
  target_model: string | null;
  created_at: string;
}
