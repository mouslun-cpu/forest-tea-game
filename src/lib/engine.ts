import type { BoostRound, Feature, Label, Offers, Order, ResultRow, TreeChoices, TreeNode } from './types';

export const FEATURES: { key: Feature; label: string; yes: string; no: string; icon: string }[] = [
  { key: 'afternoon', label: '肚子餓嗎？', yes: '肚子餓', no: '不餓', icon: '🍽️' },
  { key: 'company', label: '想吃甜食嗎？', yes: '想吃甜食', no: '不想吃甜食', icon: '🍰' },
  { key: 'discount', label: '有折扣嗎？', yes: '有折扣', no: '無折扣', icon: '🎟️' },
  { key: 'takeaway', label: '外帶', yes: '外帶', no: '內用', icon: '🥤' },
];

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let x = Math.imul(state ^ (state >>> 15), 1 | state);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function bootstrap(orders: Order[], seed: number): Order[] {
  const next = random(seed);
  return orders.map(() => orders[Math.floor(next() * orders.length)]);
}

export function featureOffers(seed: number): Offers {
  const next = random(seed);
  const draw = () => {
    const keys = FEATURES.map(f => f.key);
    for (let i = keys.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [keys[i], keys[j]] = [keys[j], keys[i]];
    }
    return keys.slice(0, 2);
  };
  return { root: draw(), left: draw(), right: draw() };
}

function leaf(orders: Order[], fallback: Label = 0, weights?: number[]): TreeNode {
  const yesCount = orders.filter(o => o.label === 1).length;
  const yes = orders.reduce((sum, o, i) => sum + (o.label === 1 ? (weights?.[i] ?? 1) : 0), 0);
  const no = orders.reduce((sum, o, i) => sum + (o.label === 0 ? (weights?.[i] ?? 1) : 0), 0);
  return { prediction: orders.length ? (yes > no + 1e-12 ? 1 : 0) : fallback, count: orders.length, yesCount };
}

export function buildTree(orders: Order[], choices: TreeChoices, offers?: Offers): TreeNode {
  function build(rows: Order[], feature: Feature | undefined, depth: number, fallback: Label, slot: keyof Offers): TreeNode {
    const node = leaf(rows, fallback);
    if (!feature || depth >= 2 || !rows.length) return node;
    if (offers && !offers[slot].some(candidate => rows.some(o => o.features[candidate]) && rows.some(o => !o.features[candidate]))) return node;
    const left = rows.filter(o => !o.features[feature]);
    const right = rows.filter(o => o.features[feature]);
    return { ...node, feature,
      left: build(left, depth === 0 ? choices.left : undefined, depth + 1, node.prediction, 'left'),
      right: build(right, depth === 0 ? choices.right : undefined, depth + 1, node.prediction, 'right') };
  }
  return build(orders, choices.root, 0, 0, 'root');
}

export function predict(tree: TreeNode, order: Order): Label {
  if (!tree.feature) return tree.prediction;
  const child = order.features[tree.feature] ? tree.right : tree.left;
  return child ? predict(child, order) : tree.prediction;
}

export function vote(trees: TreeNode[], order: Order, fallback: Label = 0): Label {
  const sum = trees.reduce((total, tree) => total + (predict(tree, order) ? 1 : -1), 0);
  return sum === 0 ? fallback : sum > 0 ? 1 : 0;
}

export function autoTree(orders: Order[], seed: number, randomFeatures: boolean, maxDepth = 2): TreeNode {
  const offers = featureOffers(seed);
  function build(rows: Order[], depth: number, slot: keyof Offers, fallback: Label): TreeNode {
    const node = leaf(rows, fallback);
    if (depth >= maxDepth || !rows.length || node.yesCount === 0 || node.yesCount === rows.length) return node;
    const candidates = randomFeatures ? offers[slot] : FEATURES.map(f => f.key);
    let best: { feature: Feature; left: Order[]; right: Order[]; score: number } | undefined;
    for (const feature of candidates) {
      const left = rows.filter(o => !o.features[feature]);
      const right = rows.filter(o => o.features[feature]);
      if (!left.length || !right.length) continue;
      const score = [left, right].reduce((sum, group) => {
        const p = group.filter(o => o.label === 1).length / group.length;
        return sum + group.length / rows.length * 2 * p * (1 - p);
      }, 0);
      if (!best || score < best.score - 1e-12) best = { feature, left, right, score };
    }
    if (!best) return node;
    return { ...node, feature: best.feature, left: build(best.left, depth + 1, 'left', node.prediction), right: build(best.right, depth + 1, 'right', node.prediction) };
  }
  return build(orders, 0, 'root', 0);
}

export function createBoostRound(orders: Order[], weights?: number[], index = 0): BoostRound {
  const raw = weights ?? orders.map(() => 1);
  const total = raw.reduce((a, b) => a + b, 0);
  const normalized = raw.map(w => w / total);
  const candidates = FEATURES.map(({ key: feature }) => {
    const node = leaf(orders, 0, normalized);
    const child = (value: boolean) => {
      const indices = orders.flatMap((o, i) => o.features[feature] === value ? [i] : []);
      return leaf(indices.map(i => orders[i]), node.prediction, indices.map(i => normalized[i]));
    };
    const tree = { ...node, feature, left: child(false), right: child(true) };
    const error = orders.reduce((sum, o, i) => sum + (predict(tree, o) !== o.label ? normalized[i] : 0), 0);
    return { id: feature, feature, tree, error };
  });
  return { index, weights: normalized, candidates };
}

export function finishBoostRound(round: BoostRound, orders: Order[]): { round: BoostRound; nextWeights: number[] } {
  const selected = round.candidates.reduce((best, item) => item.error < best.error - 1e-12 ? item : best);
  const epsilon = selected.error;
  if (epsilon <= 0) return { round: { ...round, selected, epsilon, alpha: 0, perfect: true }, nextWeights: [...round.weights] };
  if (epsilon >= 0.5 - 1e-12) return { round: { ...round, epsilon, alpha: 0, stopped: true }, nextWeights: [...round.weights] };
  const alpha = 0.5 * Math.log((1 - epsilon) / epsilon);
  const raw = orders.map((o, i) => round.weights[i] * Math.exp(predict(selected.tree, o) === o.label ? -alpha : alpha));
  const total = raw.reduce((a, b) => a + b, 0);
  return { round: { ...round, selected, epsilon, alpha }, nextWeights: raw.map(w => w / total) };
}

export function predictBoost(rounds: BoostRound[], order: Order): Label {
  const perfect = rounds.find(r => r.perfect && r.selected);
  if (perfect?.selected) return predict(perfect.selected.tree, order);
  const sum = rounds.reduce((total, r) => total + (r.selected && !r.stopped ? (r.alpha ?? 0) * (predict(r.selected.tree, order) ? 1 : -1) : 0), 0);
  return sum > 1e-12 ? 1 : 0;
}

export function evaluate(name: string, trees: TreeNode[], orders: Order[]): ResultRow {
  const predictions = orders.map(o => vote(trees, o));
  return { name, predictions, correct: orders.filter((o, i) => o.label === predictions[i]).length, total: orders.length, modelCount: trees.length };
}

export function evaluateBoost(name: string, rounds: BoostRound[], orders: Order[]): ResultRow {
  const predictions = orders.map(o => predictBoost(rounds, o));
  const perfect = rounds.some(r => r.perfect && r.selected);
  return { name, predictions, correct: orders.filter((o, i) => o.label === predictions[i]).length, total: orders.length, modelCount: perfect ? 1 : rounds.filter(r => r.selected && !r.stopped).length };
}
