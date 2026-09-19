import type { Order } from './types';

// 教學模擬資料 v2，僅由伺服器 API 匯入。封存題不能送入尚未揭曉的回應。
// 合成規則：肚子餓或想吃甜食就加點心；折扣、外帶不決定答案，不代表真實消費行為。
const names = ['小安', '小晴', '小宇', '小涵', '小樂', '小米', '小恩', '小辰'];
function makeOrder(prefix: string, index: number, combination: number, takeaway: boolean): Order {
  const afternoon = Boolean(combination & 1);
  const company = Boolean(combination & 2);
  const discount = Boolean(combination & 4);
  return { id: `${prefix}-${String(index + 1).padStart(2, '0')}`, name: `${prefix === 'train' ? '' : prefix === 'observe' ? '來買飲料的' : '新客人'}${names[index % names.length]}`,
    features: { afternoon, company, discount, takeaway }, label: afternoon || company ? 1 : 0 };
}

export const TRAIN_ORDERS: Order[] = Array.from({ length: 8 }, (_, i) => makeOrder('train', i, i, i >= 4));
export const OBSERVATION_ORDERS: Order[] = [1, 6, 2, 5, 3, 4].map((n, i) => makeOrder('observe', i, n, i % 2 === 0));
export const TEST_ORDERS: Order[] = [0, 1, 2, 4, 6, 7].map((n, i) => makeOrder('test', i, n, i % 2 === 1));
