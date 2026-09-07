import { act, viewRoom } from '@/lib/server/service';
import { body, credentials, respond } from '@/lib/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ code: string }> };
export async function GET(request: Request, context: Context) { return respond(async () => viewRoom((await context.params).code, credentials(request))); }
export async function POST(request: Request, context: Context) { return respond(async () => act((await context.params).code, credentials(request), await body(request))); }
