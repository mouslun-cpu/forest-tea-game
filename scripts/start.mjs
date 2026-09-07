import { cp, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { loadEnvFile } from 'node:process';

const root = process.cwd();
try { loadEnvFile(path.join(root, '.env.local')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const target = path.join(root, '.next', 'standalone');
await mkdir(path.join(target, '.next'), { recursive: true });
await cp(path.join(root, 'public'), path.join(target, 'public'), { recursive: true });
await cp(path.join(root, '.next', 'static'), path.join(target, '.next', 'static'), { recursive: true });
const server = spawn(process.execPath, [path.join(target, 'server.js')], {
  stdio: 'inherit',
  env: { ...process.env, HOSTNAME: '0.0.0.0', PORT: process.env.PORT || '3100', ROOM_DATA_DIR: path.resolve(process.env.ROOM_DATA_DIR || path.join(root, '.data')) },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('exit', code => process.exit(code ?? 0));
