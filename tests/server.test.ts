import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LocalStore } from '../src/lib/server/store';
import { act as rawAct, ApiError, createRoom, joinRoom, viewRoom } from '../src/lib/server/service';
import type { Credentials, RoomView } from '../src/lib/types';

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'forest-tea-test-'));
  return { store: new LocalStore(directory), directory, clean: () => rm(directory, { recursive: true, force: true }) };
}
const rejects = (operation: Promise<unknown>, status: number) => assert.rejects(operation, error => error instanceof ApiError && error.status === status);
const publicIdentity: Credentials = { token: '' };
async function act(code: string, credentials: Credentials, input: Record<string, unknown>, store: LocalStore) {
  const revision = (await store.get(code))?.revision;
  return rawAct(code, credentials, {revision, ...input}, store);
}

test('default introductory lesson uses one-question trees and keeps new answers sealed', async () => {
  const { store, clean } = await fixture();
  try {
    const owner = await createRoom({ demo: true }, store);
    const learner = await joinRoom(owner.code, { name: '小安', avatar: 0 }, store);
    let view = await viewRoom(owner.code, owner, store);
    assert.equal(view.duration, 'short');
    const visited = [view.phase];
    for (const phase of ['tree', 'forest'] as const) {
      view = await act(owner.code, owner, { action: 'advance' }, store) as RoomView;
      visited.push(view.phase);
      assert.equal(view.phase, phase);
      const mine = await viewRoom(owner.code, learner, store);
      const root = phase === 'forest' ? mine.me!.offers.root[0] : 'afternoon';
      await rejects(act(owner.code, learner, { action: 'tree', choices: { root, left: 'company' } }, store), 400);
      await rejects(act(owner.code, learner, { action: 'tree', choices: { root, right: 'company' } }, store), 400);
      const saved = await act(owner.code, learner, { action: 'tree', choices: { root } }, store) as RoomView;
      assert.equal(saved.me!.trees[phase]!.left?.feature, undefined);
      assert.equal(saved.me!.trees[phase]!.right?.feature, undefined);
      for (const credentials of [owner, learner, publicIdentity]) {
        const hidden = await viewRoom(owner.code, credentials, store);
        assert.equal(hidden.testOrders, undefined);
        assert.equal(hidden.results, undefined);
      }
    }
    view = await act(owner.code, owner, { action: 'advance' }, store) as RoomView;
    visited.push(view.phase);
    assert.equal(view.phase, 'final');
    assert.equal(view.testOrders, undefined);
    assert.equal(view.results, undefined);
    view = await act(owner.code, owner, { action: 'reveal' }, store) as RoomView;
    assert.equal(view.testOrders?.length, 6);
    assert.equal(view.results?.length, 4);
    assert.ok(view.results?.every(row => !/Bagging|AdaBoost/.test(row.name) && row.total === 6));
    assert.equal(view.results?.[0].name, '手作單樹 · 小安');
    assert.equal(view.boosts?.length, 0);
    view = await act(owner.code, owner, { action: 'advance' }, store) as RoomView;
    visited.push(view.phase);
    await act(owner.code, learner, { action: 'answers', answers: [1, 1, 0] }, store);
    view = await act(owner.code, owner, { action: 'advance' }, store) as RoomView;
    visited.push(view.phase);
    assert.deepEqual(visited, ['waiting', 'tree', 'forest', 'final', 'reflection', 'ended']);
    assert.deepEqual(view.reflections, { answered: 1, correct: [1, 1, 1] });
  } finally { await clean(); }
});

test('duplicate teacher transitions cannot skip a stage', async () => {
  const {store, clean} = await fixture();
  try {
    const owner = await createRoom({duration:'short',demo:true},store);
    await act(owner.code, owner, {action:'advance'},store);
    const revision = (await viewRoom(owner.code,owner,store)).revision;
    const outcomes = await Promise.allSettled([0,1].map(()=>rawAct(owner.code,owner,{action:'advance',revision},store)));
    assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
    assert.equal((await viewRoom(owner.code,owner,store)).phase,'forest');
    await rejects(rawAct(owner.code,owner,{action:'end'},store),409);
  } finally { await clean(); }
});

test('60 concurrent joins and submissions are durable and share one phase revision', async () => {
  const { store, directory, clean } = await fixture();
  try {
    const owner = await createRoom({ duration: 'short' }, store);
    const players = await Promise.all(Array.from({ length: 60 }, (_, i) => joinRoom(owner.code, { name: `店長${i}`, avatar: i % 6 }, store)));
    const started = await act(owner.code, owner, { action: 'advance' }, store) as RoomView;
    await Promise.all(players.map(player => act(owner.code, player, { action: 'tree', revision: started.revision, choices: { root: 'company' } }, store)));
    const view = await viewRoom(owner.code, owner, new LocalStore(directory));
    assert.equal(view.submitted, 60);
    assert.equal(view.players.length, 60);
    assert.equal(view.revision, started.revision);
    const first = await viewRoom(owner.code, players[0], store);
    assert.equal(first.me?.id, players[0].playerId);
    await rejects(act(owner.code, players[0], { action: 'tree', revision: started.revision, choices: { root: 'takeaway' } }, store), 409);
    await act(owner.code, owner, { action: 'advance' }, store);
    await rejects(act(owner.code, players[0], { action: 'tree', revision: started.revision, choices: { root: 'company' } }, store), 409);
  } finally { await clean(); }
});

test('authorization, private player models, hidden holdout and forest constraints', async () => {
  const { store, clean } = await fixture();
  try {
    const owner = await createRoom({ duration: 'full' }, store);
    const a = await joinRoom(owner.code, { name: '小熊', avatar: 0 }, store);
    const b = await joinRoom(owner.code, { name: '小兔', avatar: 1 }, store);
    await rejects(act(owner.code, publicIdentity, { action: 'advance' }, store), 403);
    await rejects(act(owner.code, a, { action: 'advance' }, store), 403);
    await rejects(viewRoom(owner.code, { token: a.token, playerId: b.playerId }, store), 401);
    await rejects(joinRoom('../bad', { name: '客人', avatar: 0 }, store), 400);
    await rejects(joinRoom(owner.code, { name: ' ', avatar: 0 }, store), 400);
    await rejects(createRoom({ duration: 'wrong' }, store), 400);
    let view = await act(owner.code, owner, { action: 'advance' }, store) as RoomView;
    await rejects(act(owner.code, owner, { action: 'advance' }, store), 409);
    assert.equal((await viewRoom(owner.code, owner, store)).phase, 'tree');
    await act(owner.code, a, { action: 'tree', revision: view.revision, choices: { root: 'company' } }, store);
    const projection = await viewRoom(owner.code, publicIdentity, store);
    assert.equal(projection.me, undefined);
    assert.equal(projection.showcase, undefined);
    assert.equal(projection.observation, undefined);
    for (const credentials of [owner, a, b, publicIdentity]) {
      const serialized = JSON.stringify(await viewRoom(owner.code, credentials, store));
      for (const forbidden of ['ownerHash', 'tokenHash', 'testOrders', '"seed"', 'test-']) assert.equal(serialized.includes(forbidden), false, forbidden);
      assert.equal(serialized.includes(owner.token), false);
      assert.equal(serialized.includes(a.token), false);
    }
    await act(owner.code, owner, { action: 'reveal' }, store);
    assert.ok((await viewRoom(owner.code, publicIdentity, store)).observation);
    await rejects(act(owner.code, b, { action: 'tree', revision: view.revision, choices: { root: 'company' } }, store), 409);
    await act(owner.code, owner, { action: 'demo' }, store);
    await act(owner.code, owner, { action: 'advance' }, store);
    await act(owner.code, owner, { action: 'advance' }, store);
    view = await viewRoom(owner.code, a, store);
    const excluded = ['afternoon', 'company', 'discount', 'takeaway'].find(f => !view.me!.offers.root.includes(f as 'company'));
    await rejects(act(owner.code, a, { action: 'tree', revision: view.revision, choices: { root: excluded } }, store), 400);
    await store.update(owner.code, room => {
      room!.players[a.playerId].sampleIds = Array(24).fill(view.train[0].id);
      return room!;
    });
    const stopped = await act(owner.code, a, { action: 'tree', revision: view.revision, choices: { root: view.me!.offers.root[0] } }, store) as RoomView;
    assert.equal(stopped.me!.trees.forest!.feature, undefined);
    assert.equal(stopped.me!.trees.forest!.count, 24);
  } finally { await clean(); }
});

test('full demonstration completes three boosting rounds, reveals only on demand, freezes end and resets separately', async () => {
  const { store, clean } = await fixture();
  try {
    const owner = await createRoom({ duration: 'full', demo: true }, store);
    const learner = await joinRoom(owner.code, { name: '測試同學', avatar: 0 }, store);
    let view = await viewRoom(owner.code, owner, store);
    while (view.phase !== 'boosting') view = await act(owner.code, owner, { action: 'advance' }, store) as RoomView;
    for (let round = 0; round < 3; round++) {
      assert.equal(view.round, round);
      assert.equal(view.boost?.selected, undefined);
      assert.equal(view.proposalCounts, undefined);
      view = await act(owner.code, owner, { action: 'close' }, store) as RoomView;
      assert.equal(view.boost?.selected, undefined);
      assert.equal(view.proposalCounts, undefined);
      const revealed = await act(owner.code, owner, { action: 'reveal' }, store) as RoomView;
      assert.ok(revealed.boost?.selected);
      assert.equal(revealed.boost.selected.error, Math.min(...revealed.boost.candidates.map(c => c.error)));
      assert.equal(Object.values(revealed.proposalCounts!).reduce((sum, count) => sum + count, 0), 6);
      assert.deepEqual((await viewRoom(owner.code, publicIdentity, store)).proposalCounts, revealed.proposalCounts);
      view = await act(owner.code, owner, { action: 'advance' }, store) as RoomView;
    }
    assert.equal(view.phase, 'final');
    assert.equal(view.results, undefined);
    assert.equal(view.testOrders, undefined);
    view = await act(owner.code, owner, { action: 'advance' }, store) as RoomView;
    assert.equal(view.phase, 'reflection');
    assert.equal(view.results?.length, 8);
    assert.equal(view.testOrders?.length, 6);
    assert.ok(view.results?.every(row => row.total === 6));
    assert.equal(view.results?.filter(row => row.name.startsWith('系統示範')).length, 4);
    await rejects(act(owner.code, learner, { action: 'answers', revision: view.revision, answers: [2, 1, 0] }, store), 400);
    await act(owner.code, learner, { action: 'answers', revision: view.revision, answers: [1, 1, 0] }, store);
    view = await act(owner.code, owner, { action: 'end' }, store) as RoomView;
    assert.deepEqual(view.reflections, { answered: 1, correct: [1, 1, 1] });
    await rejects(joinRoom(owner.code, { name: '晚到', avatar: 0 }, store), 409);
    await rejects(act(owner.code, learner, { action: 'answers', revision: view.revision, answers: [1, 1, 0] }, store), 409);
    const reset = await act(owner.code, owner, { action: 'reset' }, store) as { code: string; token: string };
    assert.notEqual(reset.code, owner.code);
    assert.equal((await viewRoom(owner.code, owner, store)).phase, 'ended');
    assert.equal((await viewRoom(reset.code, reset, store)).phase, 'waiting');
  } finally { await clean(); }
});

test('pause/resume/addTime preserve phase revision, clock never auto-closes, rooms expire', async () => {
  const { store, clean } = await fixture();
  try {
    const owner = await createRoom({ duration: 'full' }, store);
    let view = await act(owner.code, owner, { action: 'advance' }, store) as RoomView;
    const revision = view.revision;
    view = await act(owner.code, owner, { action: 'pause' }, store) as RoomView;
    assert.equal(view.endsAt, null);
    const remaining = view.remainingMs;
    view = await act(owner.code, owner, { action: 'addTime' }, store) as RoomView;
    assert.equal(view.remainingMs, remaining + 60000);
    view = await act(owner.code, owner, { action: 'resume' }, store) as RoomView;
    assert.ok(view.endsAt! > Date.now());
    assert.equal(view.revision, revision);
    await store.update(owner.code, room => ({ ...room!, endsAt: Date.now() - 10000 }));
    assert.equal((await viewRoom(owner.code, owner, store)).open, true);
    await store.update(owner.code, room => ({ ...room!, createdAt: Date.now() - 8 * 86400000 }));
    await rejects(viewRoom(owner.code, owner, store), 410);
  } finally { await clean(); }
});
