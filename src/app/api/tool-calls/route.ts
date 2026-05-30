import { listToolCallLogs } from "@/lib/database";

export async function GET(): Promise<Response> {
  return Response.json({ toolCalls: listToolCallLogs() });
}
