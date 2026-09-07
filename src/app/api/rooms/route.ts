import { createRoom } from '@/lib/server/service';
import { body, respond } from '@/lib/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) { return respond(async () => createRoom(await body(request))); }
