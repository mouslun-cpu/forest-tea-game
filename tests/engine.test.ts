import test from 'node:test';
import assert from 'node:assert/strict';
import { autoTree, bootstrap, buildTree, createBoostRound, evaluate, evaluateBoost, featureOffers, finishBoostRound, predict, predictBoost, vote } from '../src/lib/engine';
import { OBSERVATION_ORDERS, TEST_ORDERS, TRAIN_ORDERS } from '../src/lib/data';
import type { BoostRound, Label, Order, TreeNode } from '../src/lib/types';

const card = (id: string, label: Label, afternoon = false, company = false): Order => ({ id, name: id, label, features: { afternoon, company, discount: false, takeaway: false } });
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} ≠ ${expected}`);

test('抽樣有放回、長度相同，固定種子重現相同袋子', () => {
  const sample = bootstrap(TRAIN_ORDERS, 20260907);
  assert.equal(sample.length, 24);
  assert.ok(new Set(sample.map(o => o.id)).size < 24);
  assert.deepEqual(sample, bootstrap(TRAIN_ORDERS, 20260907));
  assert.deepEqual(bootstrap([], 1), []);
});

test('森林各節點各抽兩個不同線索，子節點不是沿用整棵樹候選', () => {
  const offers = featureOffers(20260907);
  assert.deepEqual(offers, featureOffers(20260907));
  for (const list of Object.values(offers)) assert.equal(new Set(list).size, 2);
  assert.ok(new Set(Object.values(offers).map(v => v.join(','))).size > 1);
  const tree = autoTree(TRAIN_ORDERS, 20260907, true);
  assert.ok(offers.root.includes(tree.feature!));
  if (tree.left?.feature) assert.ok(offers.left.includes(tree.left.feature));
  if (tree.right?.feature) assert.ok(offers.right.includes(tree.right.feature));
});

test('重複卡真的計入葉節點多數，空分支沿用父預測，葉平手選不加', () => {
  const yes = card('yes', 1);
  const no = card('no', 0);
  const tree = buildTree([yes, yes, no], { root: 'afternoon' });
  assert.equal(tree.count, 3);
  assert.equal(tree.yesCount, 2);
  assert.equal(tree.left?.prediction, 1);
  assert.equal(tree.right?.count, 0);
  assert.equal(predict(tree, card('unseen', 0, true)), 1);
  assert.equal(buildTree([yes, no], { root: 'afternoon' }).prediction, 0);
});

test('自動樹找Gini最小分裂，森林無可分特徵時停止', () => {
  const rows = [card('a', 0), card('b', 0), card('c', 1, true), card('d', 1, true)];
  const tree = autoTree(rows, 1, false);
  assert.equal(tree.feature, 'afternoon');
  assert.equal(evaluate('單樹', [tree], rows).correct, 4);
  const constant = autoTree([card('a', 0), card('b', 1)], 1, true);
  assert.equal(constant.feature, undefined);
});

test('手作森林在各節點兩候選皆不可分時停葉，其他方法保留空葉fallback', () => {
  const choices = { root: 'afternoon', left: 'company', right: 'takeaway' } as const;
  const offers = { root: ['afternoon', 'company'], left: ['company', 'discount'], right: ['takeaway', 'discount'] } as const;
  const mutableOffers = { root: [...offers.root], left: [...offers.left], right: [...offers.right] };
  const single = [card('a', 1, true)];
  const stopped = buildTree(single, choices, mutableOffers);
  assert.equal(stopped.feature, undefined);
  assert.equal(stopped.prediction, 1);
  assert.equal(buildTree(single, choices).feature, 'afternoon');
  const rows = [card('a', 0), card('b', 1, true)];
  const split = buildTree(rows, choices, mutableOffers);
  assert.equal(split.feature, 'afternoon');
  assert.equal(split.left?.feature, undefined);
  assert.equal(split.right?.feature, undefined);
  assert.equal(split.left?.prediction, 0);
  assert.equal(split.right?.prediction, 1);
});

test('投票僅計已提供模型；平票依指定fallback，複製同樹不改預測', () => {
  const yes: TreeNode = { count: 1, yesCount: 1, prediction: 1 };
  const no: TreeNode = { count: 1, yesCount: 0, prediction: 0 };
  const order = card('x', 0);
  assert.equal(vote([], order), 0);
  assert.equal(vote([yes, no], order, 1), 1);
  assert.equal(vote([yes, no], order), 0);
  assert.equal(vote(Array(20).fill(yes), order), predict(yes, order));
});

test('AdaBoost第一輪手算ε=1/4；錯題總權重升至1/2，正確卡仍保留', () => {
  const initial = createBoostRound(TRAIN_ORDERS);
  assert.equal(initial.candidates.length, 4);
  const { round, nextWeights } = finishBoostRound(initial, TRAIN_ORDERS);
  assert.equal(round.selected?.feature, 'afternoon');
  close(round.epsilon!, 1 / 4);
  close(round.alpha!, 0.5 * Math.log(3));
  close(nextWeights.reduce((a, b) => a + b, 0), 1);
  TRAIN_ORDERS.forEach((o, i) => close(nextWeights[i], predict(round.selected!.tree, o) === o.label ? 1 / 36 : 1 / 12));
});

test('每輪候選葉子由當輪權重多数決，非未加權張數', () => {
  const rows = [card('a', 1), card('b', 0), card('c', 0)];
  const round = createBoostRound(rows, [0.8, 0.1, 0.1]);
  assert.equal(round.candidates[0].tree.left?.prediction, 1);
  close(round.candidates[0].error, 0.2);
});

test('完美弱模型提前完成、避免無限alpha；無有效弱模型停止', () => {
  const rows = [card('a', 0), card('b', 1, true)];
  const perfect = finishBoostRound(createBoostRound(rows), rows).round;
  assert.equal(perfect.perfect, true);
  assert.ok(Number.isFinite(perfect.alpha));
  assert.equal(predictBoost([perfect], rows[1]), 1);
  const inseparable = [card('a', 0), card('b', 1)];
  const stopped = finishBoostRound(createBoostRound(inseparable), inseparable).round;
  assert.equal(stopped.stopped, true);
  assert.equal(stopped.selected, undefined);
  assert.equal(evaluateBoost('接力', [stopped, perfect], rows).modelCount, 1);
});

test('題庫分離、三輪有效模型與封存評估由即時計算得出', () => {
  assert.deepEqual([TRAIN_ORDERS.length, OBSERVATION_ORDERS.length, TEST_ORDERS.length], [24, 6, 12]);
  const ids = [...TRAIN_ORDERS, ...OBSERVATION_ORDERS, ...TEST_ORDERS].map(o => o.id);
  assert.equal(new Set(ids).size, ids.length);
  const rounds: BoostRound[] = [];
  let weights: number[] | undefined;
  for (let index = 0; index < 3; index++) {
    const finished = finishBoostRound(createBoostRound(TRAIN_ORDERS, weights, index), TRAIN_ORDERS);
    assert.ok(finished.round.epsilon! > 0 && finished.round.epsilon! < 0.5);
    rounds.push(finished.round);
    weights = finished.nextWeights;
  }
  assert.equal(new Set(rounds.map(r => r.selected?.feature)).size, 3);
  const before = JSON.stringify(rounds);
  const results = evaluateBoost('接力', rounds, TEST_ORDERS);
  assert.equal(results.total, 12);
  assert.equal(results.modelCount, 3);
  assert.equal(results.correct, TEST_ORDERS.filter((o, i) => o.label === results.predictions[i]).length);
  const changedLabels = TEST_ORDERS.map(o => ({ ...o, label: (1 - o.label) as Label }));
  assert.deepEqual(evaluateBoost('接力', rounds, changedLabels).predictions, results.predictions);
  assert.equal(JSON.stringify(rounds), before);
});
