import { serverConfig } from "@/lib/server/access";
export function GET() {
  return Response.json(serverConfig(), {
    headers: { "Cache-Control": "no-store" },
  });
}
