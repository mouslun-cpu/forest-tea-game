import { createHash, randomBytes, randomInt } from 'node:crypto';
import { TRAIN_ORDERS, OBSERVATION_ORDERS, TEST_ORDERS } from '../data';
import { FEATURES, autoTree, bootstrap, buildTree, createBoostRound, evaluate, evaluateBoost, featureOffers, finishBoostRound, predict } from '../engine';
import type { Credentials, Method, Phase, Player, Room, RoomAction, RoomView, TreeChoices } from '../types';
import { getStore, type RoomStore } from './store';
import { avatars, questions } from '../presentation';

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
const fail = (status: number, message: string): never => { throw new ApiError(status, message); };
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');
const methods: Method[] = ['tree', 'bagging', 'forest'];
const phases: Phase[] = ['waiting', 'tree', 'bagging', 'forest', 'boosting', 'final', 'reflection', 'ended'];
const fullTimes = [3, 6, 7, 8, 3, 4, 3, 0];
const shortTimes = [2, 4, 4, 5, 2, 2, 2, 0];
const expiresMs = 7 * 24 * 60 * 60 * 1000;

function codeOf(code: string) {
  const value = code.toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(value)) fail(400, '房間碼必須是 6 碼英數字。');
  return value;
}
function existing(room: Room | null): Room {
  if (!room) return fail(404, '找不到這間店，請確認房間碼。');
  if (Date.now() - room.createdAt > expiresMs) fail(410, '這間店已超過 7 天保留期限，請建立新房間。');
  return room;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, '資料格式不正確。');
  return value as Record<string, unknown>;
}
function authorize(room: Room, credentials: Credentials) {
  const digest = hash(credentials.token);
  if (credentials.token && digest === room.ownerHash) return { teacher: true, player: undefined };
  const player = credentials.playerId ? room.players[credentials.playerId] : undefined;
  if (credentials.token && player?.tokenHash === digest) return { teacher: false, player };
  if (credentials.token || credentials.playerId) fail(401, '身分憑證無效，請使用原本加入的裝置。');
  return { teacher: false, player: undefined };
}
function makePlayer(room: Room, name: string, avatar: number, id: string, token: string, demo = false): Player {
  const seed = parseInt(hash(`${room.seed}:${id}`).slice(0, 8), 16);
  return { id, name, avatar, joinedAt: Date.now(), tokenHash: hash(token), sampleIds: bootstrap(TRAIN_ORDERS, seed).map(o => o.id), offers: featureOffers(seed + 1), trees: {}, choices: {}, proposals: {}, ...(demo ? { demo: true } : {}) };
}
function sample(player: Player) { return player.sampleIds.map(id => TRAIN_ORDERS.find(o => o.id === id)!); }
function submitted(room: Room, player: Player) {
  if (methods.includes(room.phase as Method)) return !!player.trees[room.phase as Method];
  if (room.phase === 'boosting') return !!player.proposals[String(room.round)];
  if (room.phase === 'reflection') return !!player.answers;
  return false;
}
function fillDemos(room: Room) {
  for (const player of Object.values(room.players).filter(p => p.demo)) {
    if (methods.includes(room.phase as Method) && !player.trees[room.phase as Method]) {
      const method = room.phase as Method;
      const index = player.avatar % FEATURES.length;
      const choices = method === 'forest' ? { root: player.offers.root[0], left: player.offers.left[1], right: player.offers.right[0] } : { root: FEATURES[index].key, left: FEATURES[(index + 1) % FEATURES.length].key, right: FEATURES[(index + 2) % FEATURES.length].key };
      player.choices[method] = choices;
      player.trees[method] = buildTree(method === 'tree' ? TRAIN_ORDERS : sample(player), choices, method === 'forest' ? player.offers : undefined);
    }
    if (room.phase === 'boosting') player.proposals[String(room.round)] ||= room.boosts[room.round].candidates[player.avatar % FEATURES.length].id;
  }
}
function addDemos(room: Room) {
  for (let i = 0; i < 6; i++) {
    const id = `demo-${i}`;
    room.players[id] ||= makePlayer(room, `示範店長 ${i + 1}`, i, id, newToken(), true);
  }
  fillDemos(room);
}
function setPhase(room: Room, phase: Phase) {
  room.phase = phase;
  room.revision++;
  room.open = !['final', 'ended'].includes(phase);
  room.revealed = phase === 'reflection' || phase === 'ended';
  room.remainingMs = (room.duration === 'full' ? fullTimes : shortTimes)[phases.indexOf(phase)] * 60000;
  room.endsAt = phase === 'ended' ? null : Date.now() + room.remainingMs;
  if (phase === 'boosting') { room.round = 0; room.boosts = [createBoostRound(TRAIN_ORDERS)]; }
  if (phase === 'final') finalize(room);
  fillDemos(room);
}
function finalize(room: Room) {
  const players = Object.values(room.players).sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
  const single = players.find(p => !p.demo && p.trees.tree) || players.find(p => p.trees.tree);
  const trees = (method: Method) => players.flatMap(p => p.trees[method] ? [p.trees[method]!] : []);
  const bag = Array.from({ length: 5 }, (_, i) => autoTree(bootstrap(TRAIN_ORDERS, room.seed + i), room.seed + i, false));
  const forest = Array.from({ length: 5 }, (_, i) => autoTree(bootstrap(TRAIN_ORDERS, room.seed + i), room.seed + i, true));
  const autoBoost = [];
  let nextWeights: number[] | undefined;
  for (let i = 0; i < 3; i++) {
    const result = finishBoostRound(createBoostRound(TRAIN_ORDERS, nextWeights, i), TRAIN_ORDERS);
    autoBoost.push(result.round);
    nextWeights = result.nextWeights;
    if (result.round.perfect || result.round.stopped) break;
  }
  room.testOrders = TEST_ORDERS;
  room.results = [
    evaluate(`手作單樹 · ${single?.name || '未提交'}`, single?.trees.tree ? [single.trees.tree] : [], TEST_ORDERS),
    evaluate('全班 Bagging', trees('bagging'), TEST_ORDERS),
    evaluate('全班手作森林', trees('forest'), TEST_ORDERS),
    evaluateBoost('全班 AdaBoost', room.boosts, TEST_ORDERS),
    evaluate('系統示範 · 單樹', [autoTree(TRAIN_ORDERS, room.seed, false)], TEST_ORDERS),
    evaluate('系統示範 · Bagging', bag, TEST_ORDERS),
    evaluate('系統示範 · 隨機森林', forest, TEST_ORDERS),
    evaluateBoost('系統示範 · AdaBoost', autoBoost, TEST_ORDERS),
  ];
}
function close(room: Room, reveal: boolean) {
  if (methods.includes(room.phase as Method) || room.phase === 'boosting') {
    if (!Object.values(room.players).some(p => submitted(room, p))) fail(409, '這一輪還沒有提交，請等候學生或啟用系統示範。');
    if (room.phase === 'boosting' && !room.boosts[room.round].selected) room.boosts[room.round] = finishBoostRound(room.boosts[room.round], TRAIN_ORDERS).round;
  }
  room.open = false;
  if (reveal) room.revealed = true;
}
function toView(room: Room, credentials: Credentials, storage: RoomStore['kind']): RoomView {
  const { teacher, player } = authorize(room, credentials);
  const players = Object.values(room.players).sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
  const view: RoomView = {
    code: room.code, phase: room.phase, round: room.round, revision: room.revision, open: room.open,
    revealed: room.revealed, duration: room.duration, endsAt: room.endsAt, remainingMs: room.remainingMs,
    serverTime: Date.now(), storage, teacher, train: TRAIN_ORDERS,
    players: players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, submitted: submitted(room, p), ...(p.demo ? { demo: true } : {}) })),
    submitted: players.filter(p => submitted(room, p)).length,
  };
  if (player) { const { tokenHash: _secret, ...me } = player; void _secret; view.me = me; }
  if (room.phase === 'boosting') {
    const current = room.boosts[room.round];
    view.boost = room.revealed ? current : { index: current.index, weights: current.weights, candidates: current.candidates };
    view.boosts = room.boosts.filter((_, i) => i < room.round || room.revealed);
    if (room.revealed) view.proposalCounts = Object.fromEntries(current.candidates.map(candidate => [candidate.id, players.filter(p => p.proposals[String(room.round)] === candidate.id).length]));
  }
  if (methods.includes(room.phase as Method) && room.revealed) {
    const method = room.phase as Method;
    const trees = players.flatMap(p => p.trees[method] ? [{ name: p.name, tree: p.trees[method]! }] : []);
    const order = OBSERVATION_ORDERS[methods.indexOf(method)];
    view.showcase = trees.slice(0, 8);
    const yes = trees.filter(p => predict(p.tree, order) === 1).length;
    view.observation = { order, yes, no: trees.length - yes };
  }
  if (room.revealed && ['final', 'reflection', 'ended'].includes(room.phase)) {
    view.results = room.results;
    view.testOrders = room.testOrders;
    view.boosts = room.boosts;
  }
  if (['reflection', 'ended'].includes(room.phase)) {
    const answered = players.filter(p => p.answers);
    view.reflections = { answered: answered.length, correct: questions.map((question, i) => answered.filter(p => p.answers![i] === question.answer).length) };
  }
  return structuredClone(view);
}

export async function createRoom(input: unknown, store = getStore()) {
  const body = object(input);
  if (body.duration !== 'full' && body.duration !== 'short') fail(400, '請選擇完整或精簡課程。');
  if (body.demo !== undefined && typeof body.demo !== 'boolean') fail(400, '示範設定格式不正確。');
  const token = newToken();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join('');
    try {
      await store.update(code, previous => {
        if (previous) fail(409, '房間碼重複。');
        const room: Room = { code, ownerHash: hash(token), createdAt: Date.now(), revision: 0, phase: 'waiting', round: 0, open: true, revealed: false, duration: body.duration as 'full' | 'short', endsAt: null, remainingMs: (body.duration === 'full' ? 3 : 2) * 60000, seed: randomInt(2147483647), players: {}, boosts: [] };
        if (body.demo) addDemos(room);
        return room;
      });
      return { code, token };
    } catch (error) { if (!(error instanceof ApiError) || error.status !== 409 || attempt === 4) throw error; }
  }
  return fail(503, '暫時無法建立房間。');
}
export async function joinRoom(code: string, input: unknown, store = getStore()) {
  code = codeOf(code);
  const body = object(input);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || [...name].length > 16 || /[\u0000-\u001f\u007f]/.test(name)) fail(400, '暱稱請使用 1–16 個字。');
  if (!Number.isInteger(body.avatar) || Number(body.avatar) < 0 || Number(body.avatar) >= avatars.length) fail(400, '請選擇有效的頭像。');
  const playerId = randomBytes(12).toString('hex'), token = newToken();
  await store.update(code, value => {
    const room = existing(value);
    if (room.phase === 'ended') fail(409, '這間店已結束營業。');
    if (Object.keys(room.players).length >= 120) fail(409, '房間已滿。');
    room.players[playerId] = makePlayer(room, name, body.avatar as number, playerId, token);
    return room;
  });
  return { playerId, token };
}
export async function viewRoom(code: string, credentials: Credentials = { token: '' }, store = getStore()) {
  return toView(existing(await store.get(codeOf(code))), credentials, store.kind);
}
export async function act(code: string, credentials: Credentials, input: unknown, store = getStore()) {
  code = codeOf(code);
  const body = object(input);
  if (typeof body.action !== 'string') fail(400, '缺少操作名稱。');
  if (body.action === 'reset') {
    const room = existing(await store.get(code));
    if (!authorize(room, credentials).teacher) fail(403, '只有老師可以重置。');
    return createRoom({ duration: room.duration }, store);
  }
  const room = await store.update(code, value => {
    const room = existing(value);
    const { teacher, player } = authorize(room, credentials);
    const action = body.action as RoomAction['action'];
    if (room.phase === 'ended') fail(409, '活動已結束，資料已封存。');
    if (['tree', 'proposal', 'answers'].includes(action)) {
      if (!player) fail(403, '請先加入房間。');
      if (body.revision !== room.revision) fail(409, '階段已更新，請重新整理後再提交。');
      if (!room.open) fail(409, '這一輪已收件。');
      if (action === 'tree') {
        if (!methods.includes(room.phase as Method)) fail(409, '現在不是建立規則的階段。');
        const method = room.phase as Method;
        const choices = object(body.choices);
        for (const slot of ['root', 'left', 'right'] as const) {
          if (slot !== 'root' && choices[slot] === undefined) continue;
          if (!FEATURES.some(f => f.key === choices[slot])) fail(400, '請選擇有效的線索。');
          if (method === 'forest' && !player!.offers[slot].includes(choices[slot] as TreeChoices['root'])) fail(400, '森林只能選擇本節點抽到的線索。');
        }
        const parsed: TreeChoices = { root: choices.root as TreeChoices['root'], ...(choices.left ? { left: choices.left as TreeChoices['root'] } : {}), ...(choices.right ? { right: choices.right as TreeChoices['root'] } : {}) };
        if (player!.trees[method]) {
          if (JSON.stringify(player!.choices[method]) === JSON.stringify(parsed)) return room;
          fail(409, '規則已鎖定，不能覆寫。');
        }
        player!.choices[method] = parsed;
        player!.trees[method] = buildTree(method === 'tree' ? TRAIN_ORDERS : sample(player!), parsed, method === 'forest' ? player!.offers : undefined);
      } else if (action === 'proposal') {
        if (room.phase !== 'boosting') fail(409, '現在不是提案階段。');
        if (!room.boosts[room.round].candidates.some(c => c.id === body.candidateId)) fail(400, '請選擇有效的候選規則。');
        const previous = player!.proposals[String(room.round)];
        if (previous && previous !== body.candidateId) fail(409, '提案已鎖定，不能覆寫。');
        player!.proposals[String(room.round)] = body.candidateId as string;
      } else {
        if (room.phase !== 'reflection') fail(409, '概念題尚未開放。');
        if (!Array.isArray(body.answers) || body.answers.length !== questions.length || body.answers.some((a, i) => !Number.isInteger(a) || a < 0 || a >= questions[i].options.length)) fail(400, '請完成三題選擇題。');
        if (player!.answers && JSON.stringify(player!.answers) !== JSON.stringify(body.answers)) fail(409, '答案已提交。');
        player!.answers = body.answers as number[];
      }
      return room;
    }
    if (!teacher) fail(403, '只有老師可以控制課堂。');
    if (body.revision !== room.revision) fail(409, '課堂已更新，請等畫面同步後再操作。');
    switch (action) {
      case 'demo': addDemos(room); break;
      case 'pause': if (room.endsAt !== null) { room.remainingMs = Math.max(0, room.endsAt - Date.now()); room.endsAt = null; } break;
      case 'resume': if (room.endsAt === null) room.endsAt = Date.now() + room.remainingMs; break;
      case 'addTime': room.remainingMs += 60000; if (room.endsAt !== null) room.endsAt += 60000; break;
      case 'end': room.phase = 'ended'; room.revision++; room.open = false; room.endsAt = null; break;
      case 'close': close(room, false); break;
      case 'reveal': close(room, true); break;
      case 'advance': {
        if (methods.includes(room.phase as Method) || room.phase === 'boosting') close(room, true);
        if (room.phase === 'boosting' && room.round < 2 && !room.boosts[room.round].perfect && !room.boosts[room.round].stopped) {
          const { nextWeights } = finishBoostRound(room.boosts[room.round], TRAIN_ORDERS);
          room.round++; room.revision++; room.open = true; room.revealed = false;
          room.boosts.push(createBoostRound(TRAIN_ORDERS, nextWeights, room.round));
          room.remainingMs = (room.duration === 'full' ? 3 : 2) * 60000;
          room.endsAt = Date.now() + room.remainingMs;
          fillDemos(room);
        } else setPhase(room, phases[phases.indexOf(room.phase) + 1]);
        break;
      }
      default: fail(400, '不支援這個操作。');
    }
    return room;
  });
  return toView(room, credentials, store.kind);
}
