import { NextResponse } from 'next/server';
import { ApiError } from './service';
import type { Credentials } from '../types';

export function credentials(request: Request): Credentials {
  return { token: request.headers.get('authorization')?.replace(/^Bearer /, '') || '', playerId: request.headers.get('x-player-id') || undefined };
}
export async function body(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > 8192) throw new ApiError(413, '送出的內容太大。');
  try { return JSON.parse(text); } catch { throw new ApiError(400, '請送出有效的 JSON。'); }
}
export async function respond(operation: () => Promise<unknown>) {
  try { return NextResponse.json(await operation(), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (error) {
    if (!(error instanceof ApiError)) console.error('Room API error', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: error instanceof ApiError ? error.message : '伺服器暫時無法處理，請稍後重試。' }, { status: error instanceof ApiError ? error.status : 500, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
