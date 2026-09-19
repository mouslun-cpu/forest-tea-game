'use client';

import { useEffect, useState } from 'react';
import { Check, Send } from 'lucide-react';
import { buildTree } from '@/lib/engine';
import { featureInfo, features } from '@/lib/presentation';
import type { Feature, RoomAction, RoomView } from '@/lib/types';
import { Done, OrderCard, TreeView, playChime } from './shared';

export function SimpleTreeMission({room,busy,act}:{room:RoomView;busy:boolean;act:(action:RoomAction)=>Promise<boolean>}) {
  const method=room.phase==='forest'?'forest':'tree';
  const me=room.me!;
  const locked=me.trees[method];
  const rows=method==='tree'?room.train:me.sampleIds.map(id=>room.train.find(order=>order.id===id)!).filter(Boolean);
  const offered=method==='tree'?features:me.offers.root;
  const [selected,setSelected]=useState<Feature>();
  const draftKey=`forest-tea:simple:${room.code}:${me.id}:${method}`;
  useEffect(()=>{const saved=localStorage.getItem(draftKey) as Feature|null;if(saved&&offered.includes(saved))setSelected(saved);},[draftKey]);
  const preview=selected?buildTree(rows,{root:selected},method==='forest'?me.offers:undefined):undefined;
  return <>
    <section className="panel simple-context"><span className="eyebrow">{method==='tree'?'先看一個例子':'這次，分頭看紀錄'}</span><h2>{method==='tree'?'客人說：「我有點餓。」':'每個店長，都有自己的小樹'}</h2><p>{method==='tree'?'店長要猜：他會不會加一份點心？先看過去客人實際買了什麼，再選一個問題當規則。':'系統已幫你抽好一袋舊紀錄和兩個問題。和上一關一樣，選一個就好；等大家送出，小樹會各出一票。'}</p><details><summary>查看這次的 {rows.length} 筆舊紀錄{method==='forest'?'（可能重複抽到）':''}</summary><div className="orders-grid">{rows.map((order,i)=><OrderCard key={`${order.id}-${i}`} order={order}/>)}</div></details></section>
    {locked ? <><Done/><section className="panel"><h2>我的小樹會這樣猜</h2><TreeView node={locked} order={room.observation?.order}/><p>送出後就照這條規則猜，不會替新客人改答案。</p></section></> : room.open ? <section className="panel simple-builder"><span className="eyebrow">現在只要做這件事</span><h2>選一個問題，再送出</h2><p>每個問題下方，都列出舊紀錄。選了就能看到規則，不用自己算。</p><div className="feature-options">{offered.map(feature=>{
      const yes=rows.filter(o=>o.features[feature]);const no=rows.filter(o=>!o.features[feature]);
      return <button className={`feature-option ${selected===feature?'selected':''}`} key={feature} onClick={()=>{setSelected(feature);localStorage.setItem(draftKey,feature);}}><span>{featureInfo[feature].icon}</span><div><strong>{featureInfo[feature].question}</strong><small>回答是：{yes.length} 人裡，{yes.filter(o=>o.label).length} 人加點<br/>回答否：{no.length} 人裡，{no.filter(o=>o.label).length} 人加點</small></div>{selected===feature&&<Check size={19}/>}</button>;
    })}</div>{preview&&<div className="simple-preview"><h3>這就是你的小樹</h3><TreeView node={preview}/><p>每一邊都猜舊紀錄裡比較多人選的答案。平手時猜「不加點」；沒有紀錄的一邊沿用上一層的答案。</p></div>}<button className="button primary full large" disabled={!selected||busy} onClick={async()=>{if(selected&&await act({action:'tree',choices:{root:selected},revision:room.revision})){localStorage.removeItem(draftKey);playChime();}}}><Send size={18}/>{busy?'送出中…':'送出我的小樹'}</button></section> : <section className="panel"><h2>這一輪已收件</h2><p>先看全班結果，下一輪再一起加入。</p></section>}
    {room.observation&&<section className="panel observation"><h2>小樹們投票的結果</h2><OrderCard order={room.observation.order}/><div className="vote-labels"><strong>🍪 會加點 {room.observation.yes} 票</strong><span>🥤 不加點 {room.observation.no} 票</span></div><p>票是規則算出來的，不是大家臨時猜的。{room.observation.yes===room.observation.no?'這次平票，採全部舊紀錄的多數答案。':`多數猜「${room.observation.yes>room.observation.no?'會':'不會'}加點」。`}</p><small>這是練習揭曉，最後還有不同的新客人。</small></section>}
  </>;
}
