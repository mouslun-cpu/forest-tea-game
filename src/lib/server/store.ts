import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { Room } from '../types';

export interface RoomStore {
  kind: 'local' | 'firebase';
  get(code: string): Promise<Room | null>;
  update(code: string, change: (room: Room | null) => Room): Promise<Room>;
}

export class LocalStore implements RoomStore {
  kind = 'local' as const;
  private queues = new Map<string, Promise<unknown>>();
  constructor(private directory = process.env.ROOM_DATA_DIR || path.join(process.cwd(), '.data')) {}
  private file(code: string) {
    if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error('Invalid room code');
    return path.join(this.directory, `${code}.json`);
  }
  async get(code: string): Promise<Room | null> {
    try { return JSON.parse(await readFile(this.file(code), 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }
  async update(code: string, change: (room: Room | null) => Room): Promise<Room> {
    const operation = (this.queues.get(code) || Promise.resolve()).catch(() => {}).then(async () => {
      const room = change(await this.get(code));
      await mkdir(this.directory, { recursive: true });
      const temporary = `${this.file(code)}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(room), 'utf8');
      // Windows readers or antivirus can briefly hold the destination open.
      for (let attempt = 0; ; attempt++) {
        try { await rename(temporary, this.file(code)); break; }
        catch (error) {
          if (attempt >= 7 || !['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code || '')) throw error;
          await delay(20 * (attempt + 1));
        }
      }
      return room;
    });
    this.queues.set(code, operation);
    try { return await operation; }
    finally { if (this.queues.get(code) === operation) this.queues.delete(code); }
  }
}

class FirebaseStore implements RoomStore {
  kind = 'firebase' as const;
  private async ref(code: string) {
    const { getApps, initializeApp, cert } = await import('firebase-admin/app');
    const { getDatabase } = await import('firebase-admin/database');
    const app = getApps().find(app => app.name === 'forest-tea') || initializeApp({
      credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    }, 'forest-tea');
    return getDatabase(app).ref(`forestTeaRooms/${code}`);
  }
  async get(code: string): Promise<Room | null> {
    const room = (await (await this.ref(code)).get()).val();
    return room ? normalize(room) : null;
  }
  async update(code: string, change: (room: Room | null) => Room): Promise<Room> {
    const ref = await this.ref(code);
    // Prime the cache: RTDB transactions can otherwise first receive null for an existing room.
    await ref.get();
    const result = await ref.transaction(value => JSON.parse(JSON.stringify(change(value ? normalize(value) : null))), undefined, false);
    if (!result.committed) throw new Error('Room transaction was not committed');
    return normalize(result.snapshot.val());
  }
}

function normalize(room: Room): Room {
  room.players ||= {};
  room.boosts ||= [];
  room.endsAt ??= null;
  for (const player of Object.values(room.players)) {
    player.trees ||= {};
    player.choices ||= {};
    player.proposals ||= {};
  }
  return room;
}

const globalStore = globalThis as typeof globalThis & { forestTeaStore?: RoomStore };
export function getStore(): RoomStore {
  if (!!process.env.FIREBASE_DATABASE_URL !== !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error('Firebase requires both server environment variables');
  return globalStore.forestTeaStore ||= process.env.FIREBASE_DATABASE_URL ? new FirebaseStore() : new LocalStore();
}
