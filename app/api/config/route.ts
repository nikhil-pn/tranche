import { json, publicConfig } from "@/lib/server";

export const dynamic = "force-dynamic";

export function GET() {
  return json(publicConfig());
}
