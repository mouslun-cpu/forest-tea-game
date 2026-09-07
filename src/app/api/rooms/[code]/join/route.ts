import { joinRoom } from '@/lib/server/service';
import { body, respond } from '@/lib/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ code: string }> }) { return respond(async () => joinRoom((await context.params).code, await body(request))); }
