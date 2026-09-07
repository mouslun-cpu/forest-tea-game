'use client';
import Link from 'next/link';
import { ArrowLeft, Leaf, Check, LoaderCircle, X, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Order, TreeNode } from '@/lib/types';
import { featureInfo, features } from '@/lib/presentation';
export function Brand({small = false}: {small?: boolean}) { return <Link href="/" className={`brand ${small ? 'small' : ''}`}><span className="brand-symbol"><Leaf size={22}/></span><span>森林手搖店<small>FOREST TEA CLUB</small></span></Link>; }
export function Back({href = '/'}: {href?: string}) {return <Link href={href} className="back-link"><ArrowLeft size={16}/> 回到小店</Link>;}
export function Loading() { return <div className="loading-screen"><img src="/art/cup-mascot.svg" alt="奶茶店長" width={120}/><LoaderCircle className="spin"/><p>店長正在準備訂單…</p></div>; }
export function ErrorNotice({message}: {message: string}) { return message ? <div className="error-notice" role="alert">{message}</div> : null; }
export function Modal({title, children, onClose}: {title: string; children: React.ReactNode; onClose:()=>void}) {
  useEffect(() => { const onKey = (e: KeyboardEvent) => {if(e.key==='Escape') onClose();}; window.addEventListener('keydown',onKey); return () => window.removeEventListener('keydown',onKey); }, [onClose]);
  return <div className="modal-backdrop" onClick={onClose}><section className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={e=>e.stopPropagation()}><button className="icon-button modal-close" aria-label="關閉視窗" onClick={onClose}><X/></button><h2>{title}</h2>{children}</section></div>;
}
export function OrderCard({order, count = 1, weight, showAnswer = true}: {order: Order; count?: number; weight?: number; showAnswer?: boolean}) {
  return <article className={`order-card ${weight !== undefined && weight > .065 ? 'weighted' : ''}`}><header><span className="order-avatar">{['🐻','🐰','🦊','🐼','🐨'][Number(order.id.replace(/\D/g,''))%5 || 0]}</span><div><strong>{order.name}</strong><small>訂單 {order.id}</small></div>{count>1 && <span className="count-tag">×{count}</span>}</header><div className="order-features">{features.map(f=><span key={f}>{featureInfo[f].icon} {order.features[f] ? featureInfo[f].yes : featureInfo[f].no}</span>)}</div>{weight!==undefined && <div className="weight-bar"><span style={{width:`${Math.min(100,weight*500)}%`}}/><small>關注籌碼 {(weight*100).toFixed(1)}</small></div>}{showAnswer && <footer className={order.label ? 'yes-label' : ''}>{order.label ? '🍪 有加點心' : '🥤 只買飲料'}</footer>}</article>;
}
export function TreeView({node, compact = false, order}: {node: TreeNode; compact?: boolean; order?: Order}) {
  if (!node.feature) return <div className={`tree-leaf ${node.prediction ? 'yes' : ''}`}>{node.prediction ? '🍪 加點心' : '🥤 不加點'}{!compact && <small>{node.count} 筆訂單 · {node.yesCount} 筆加點心</small>}</div>;
  return <div className={`tree-diagram ${compact?'compact':''}`}><div className="tree-question">{featureInfo[node.feature].icon} {featureInfo[node.feature].question}</div><div className="tree-branches">{(['left','right'] as const).map((side,i)=><div className={`tree-branch ${order && Number(order.features[node.feature!]) === i ? 'path-active' : ''}`} key={side}><span className="branch-label">{i ? '是' : '否'}</span>{node[side] && <TreeView node={node[side]!} compact={compact} order={order && Number(order.features[node.feature!]) === i ? order : undefined}/>}</div>)}</div></div>;
}
export function Done({title = '規則已交給店長！', children}: {title?:string; children?:React.ReactNode}) { return <div className="done-banner"><span><Check size={20}/></span><div><strong>{title}</strong><p>{children ?? '你的小樹已經準備好。等老師揭曉，一起看看！'}</p></div></div>; }
export function SoundToggle() {
  const [enabled,setEnabled]=useState(false);
  return <button className="sound-toggle" aria-label={enabled?'關閉音效':'開啟音效'} aria-pressed={enabled} onClick={()=>{ const value=!enabled;setEnabled(value);localStorage.setItem('forest-tea:sound',String(value));if(value) playChime(); }}>{enabled?<Volume2 size={18}/>:<VolumeX size={18}/>}</button>;
}
export function playChime() {
  if(typeof window==='undefined'||localStorage.getItem('forest-tea:sound')!=='true') return;
  const ctx = new AudioContext();
  [523,659,784].forEach((frequency,i)=>{const oscillator=ctx.createOscillator(); const gain=ctx.createGain(); oscillator.connect(gain);gain.connect(ctx.destination);oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.045,ctx.currentTime+i*.09);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+i*.09+.22);oscillator.start(ctx.currentTime+i*.09);oscillator.stop(ctx.currentTime+i*.09+.23);});
  setTimeout(()=>ctx.close(),600);
}
