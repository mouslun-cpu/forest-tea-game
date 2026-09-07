'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Credentials, RoomAction, RoomView } from './types';
export const credentialKey = (code: string, teacher = false) => `forest-tea:${teacher ? 'teacher' : 'player'}:${code}`;
export function saveCredentials(code: string, credentials: Credentials, teacher = false) { localStorage.setItem(credentialKey(code, teacher), JSON.stringify(credentials)); }
export function readCredentials(code: string, teacher = false): Credentials | undefined { try { return JSON.parse(localStorage.getItem(credentialKey(code, teacher)) || 'null') || undefined; } catch { return undefined; } }
export async function request<T>(url: string, options: RequestInit = {}, credentials?: Credentials): Promise<T> {
  const response = await fetch(url, { ...options, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(credentials ? { Authorization: `Bearer ${credentials.token}`, ...(credentials.playerId ? {'X-Player-Id': credentials.playerId} : {}) } : {}), ...options.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || '連線暫時中斷，請再試一次。');
  return body;
}
export function useRoom(code: string, role: 'teacher' | 'student' | 'display') {
  const [room, setRoom] = useState<RoomView>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const credentials = useRef<Credentials | undefined>(undefined);
  const serial = useRef(0);
  useEffect(() => {
    credentials.current = role === 'display' ? undefined : readCredentials(code, role === 'teacher');
    setReady(true);
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const generation = ++serial.current;
      try {
        const view = await request<RoomView>(`/api/rooms/${code}`, {}, credentials.current);
        if (active && generation === serial.current) { setRoom(view); setError(''); }
      } catch (e) { if (active && generation === serial.current) setError((e as Error).message); }
      if (active) timer = setTimeout(poll, 1500);
    }
    poll();
    return () => { active = false; clearTimeout(timer); };
  }, [code, role]);
  const act = useCallback(async (action: RoomAction) => {
    setBusy(true); setError(''); ++serial.current;
    try {
      const value = await request<RoomView | {code: string; token: string}>(`/api/rooms/${code}`, {method: 'POST', body: JSON.stringify({revision: room?.revision, ...action})}, credentials.current);
      ++serial.current;
      if ('phase' in value) setRoom(value);
      else { saveCredentials(value.code, {token: value.token}, true); window.location.assign(`/teacher/${value.code}`); }
      return true;
    } catch (e) { setError((e as Error).message); return false; }
    finally { setBusy(false); }
  }, [code, room?.revision]);
  return {room, error, busy, act, ready, authenticated: !!credentials.current};
}
