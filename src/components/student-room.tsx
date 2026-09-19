'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, Clock3, Eye, LockKeyhole, Send, Sparkles, Star, Trophy, Wifi } from 'lucide-react';
import { useRoom } from '@/lib/client';
import { buildTree } from '@/lib/engine';
import { avatars, featureInfo, features, phaseName, questionsFor, stagesFor } from '@/lib/presentation';
import type { Feature, Method, Order, RoomAction, RoomView, TreeChoices } from '@/lib/types';
import { SimpleTreeMission } from './simple-tree-mission';
import { Brand, Done, ErrorNotice, Loading, Modal, OrderCard, playChime, SoundToggle, TreeView } from './shared';

type Act = (action: RoomAction) => Promise<boolean>;

export default function StudentRoom({ code }: { code: string }) {
  const { room, error, busy, act, ready, authenticated } = useRoom(code, 'student');
  const [help, setHelp] = useState(false);
  if (ready && !authenticated) return <main className="join-page"><div className="join-card"><img src="/art/cup-mascot.svg" width={110} alt="奶茶店長"/><h1>先領一件圍裙吧</h1><p>加入小店，就能保留你的闖關進度。</p><Link className="button primary full" href={`/join?room=${code}`}>加入 {code}<ArrowRight size={18}/></Link></div></main>;
  if (!room) return <><Loading/><ErrorNotice message={error}/></>;
  if (!room.me) return <main className="join-page"><ErrorNotice message={error || '找不到你的店長身分，請從原本加入的瀏覽器開啟。'}/><Link className="button secondary" href={`/join?room=${code}`}>回加入頁</Link></main>;
  const player = room.me;
  const level = Object.keys(player.trees).length + Object.keys(player.proposals).length + (player.answers ? 1 : 0);
  const stages = stagesFor(room.duration);
  const maxLevel = room.duration === 'short' ? 3 : 7;
  const stage = stages.find(s => s.phase === room.phase);
  return <main className="student-app"><header className="student-topbar"><Brand small/><SoundToggle/><button className="icon-button" aria-label="查看玩法提示" onClick={()=>setHelp(true)}><BookOpen size={19}/></button></header>
    <div className="player-bar"><span className="player-avatar">{avatars[player.avatar % avatars.length]}</span><div><strong>{player.name}<small>見習店長</small></strong><div className="xp-track"><span style={{width:`${level/maxLevel*100}%`}}/></div></div><span className="xp-count"><Star size={15} fill="currentColor"/> {level} / {maxLevel}</span></div>
    <div className="mobile-stage-track">{stages.map((s,i)=><div key={s.phase} className={`${room.phase === s.phase ? 'active' : ''} ${player.trees[s.phase as Method] || (s.phase==='boosting' && Object.keys(player.proposals).length>0) ? 'complete' : ''}`}><span>{s.icon}</span><small>{s.name}</small></div>)}</div>
    <ErrorNotice message={error}/>
    <div className="role-reminder"><strong>你是店長</strong><span>預測客人會不會加點心</span></div><div className="connection-line"><span><Wifi size={12}/> {error ? '連線重試中' : `小店 ${code}`}</span><StudentTimer room={room}/></div>
    {stage && <div className="student-stage-heading"><span className="eyebrow">MISSION {stages.indexOf(stage)+1} · {stage.english}</span><h1>{stage.name}</h1><p>{stage.subtitle}</p></div>}
    <div className="student-content" key={`${room.phase}-${room.round}`}>
      {room.phase==='waiting' && <Waiting room={room}/>}
      {['tree','bagging','forest'].includes(room.phase) && (room.duration==='short' ? <SimpleTreeMission room={room} busy={busy} act={act}/> : <TreeMission room={room} busy={busy} act={act}/>)}
      {room.phase==='boosting' && <BoostMission room={room} busy={busy} act={act}/>}
      {room.phase==='final' && <FinalMission room={room}/>}
      {room.phase==='reflection' && <Reflection room={room} busy={busy} act={act}/>}
      {room.phase==='ended' && <Graduation room={room}/>}
    </div>
    <footer className="student-footer">🌿 每一個小判斷，都能讓森林長大一點。</footer>
    {help && <Modal title="店長的小抄" onClose={()=>setHelp(false)}><div className="help-list">{stages.map(s=><div key={s.phase}><span>{s.icon}</span><div><strong>{s.name}</strong><p>{s.note}</p></div></div>)}</div><p className="tiny-note">所有訂單都是教學模擬資料。課堂結果不代表真實消費行為。</p></Modal>}
  </main>;
}

function StudentTimer({room}:{room:RoomView}) {
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const [offset,setOffset]=useState(0);
  useEffect(()=>setOffset(room.serverTime-Date.now()),[room.serverTime]);
  const remaining=Math.max(0,Math.ceil((room.endsAt ? room.endsAt-now-offset : room.remainingMs)/1000));
  if(room.phase==='waiting'||room.phase==='ended') return <span>{room.players.length} 位夥伴已加入</span>;
  return <span><Clock3 size={12}/>{String(Math.floor(remaining/60)).padStart(2,'0')}:{String(remaining%60).padStart(2,'0')}{!room.endsAt ? ' · 暫停' : ''}</span>;
}

function Waiting({room}:{room:RoomView}) {return <section className="waiting-mission"><span className="eyebrow">YOUR APRON IS READY</span><h1>圍裙穿好了！</h1><p>小店準備開張，等老師開始冒險。</p><div className="waiting-scene"><img src="/art/hero-shop.svg" alt="等待開張的森林小店"/><div className="waiting-bubble">看紀錄 → 選問題 → 一起猜 🌳</div></div><div className="mission-brief"><span>📮</span><div><strong>今天的任務</strong><p>你不是來點餐的客人。<br/>看舊紀錄、選一個問題，猜客人會不會加點心。</p></div></div><div className="waiting-friends">{room.players.slice(0,8).map(p=><span key={p.id} title={p.name}>{avatars[p.avatar%6]}</span>)}<small>{room.players.length} 位店長已就位</small></div></section>;}

function TreeMission({room,busy,act}:{room:RoomView;busy:boolean;act:Act}) {
  const method=room.phase as Method;
  const me=room.me!;
  const locked=me.trees[method];
  const [bagOpen,setBagOpen]=useState(false);
  const [drawn,setDrawn]=useState(method==='tree'||!!locked);
  const [step,setStep]=useState(0);
  const [choices,setChoices]=useState<Partial<TreeChoices>>({});
  const [showPractice,setShowPractice]=useState(false);
  const rows=useMemo(()=>method==='tree'?room.train:me.sampleIds.map(id=>room.train.find(o=>o.id===id)!).filter(Boolean),[method,room.train,me.sampleIds]);
  const groups=useMemo(()=>{const counts=new Map<string,{order:Order;count:number}>();for(const order of rows){const entry=counts.get(order.id);if(entry)entry.count++;else counts.set(order.id,{order,count:1});}return [...counts.values()];},[rows]);
  const draftKey=`forest-tea:draft:${room.code}:${method}:${me.id}`;
  useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem(draftKey)||'null');if(saved){setChoices(saved.choices||{});setStep(saved.step||0);setDrawn(true);}}catch{}},[draftKey]);
  function choose(slot:keyof TreeChoices,value:Feature|undefined){const next={...choices,[slot]:value};setChoices(next);localStorage.setItem(draftKey,JSON.stringify({choices:next,step}));playChime();}
  function nextStep(value:number){setStep(value);localStorage.setItem(draftKey,JSON.stringify({choices,step:value}));}
  const currentSlot=(['root','left','right'] as const)[Math.min(step,2)];
  const offered=method==='forest'?me.offers[currentSlot]:features;
  const currentRows=step===0||!choices.root?rows:rows.filter(o=>o.features[choices.root!] === (step===2));
  const cannotSplit=method==='forest'&&!offered.some(f=>currentRows.some(o=>o.features[f])&&currentRows.some(o=>!o.features[f]));
  const preview=choices.root?buildTree(rows,choices as TreeChoices,method==='forest'?me.offers:undefined):undefined;
  const selected = choices[currentSlot];
  async function submit(){if(choices.root&&await act({action:'tree',choices:choices as TreeChoices,revision:room.revision})){playChime();localStorage.removeItem(draftKey);}}
  return <>
    {method!=='tree'&&!drawn&&!locked ? <section className="draw-mission panel"><div className="bag-illustration">{method==='forest'?'🌳':'🧺'}<span>{rows.length}</span></div><h2>{method==='forest'?'同一袋訂單，新的看法':'抽一袋，你的練習訂單'}</h2><p>{method==='forest'?'這次每個分岔只能從兩個線索選。看看你會長出什麼樹。':'從大家共同的訂單中，抽出 8 次。抽完放回去，所以有些客人會再出現！'}</p><button className="button primary full" onClick={()=>{setDrawn(true);setBagOpen(true);playChime();}}>{method==='forest'?'打開我的線索袋':'抽我的訂單袋'}<Sparkles size={18}/></button></section> : <>
      <button className="order-bag-button" onClick={()=>setBagOpen(true)}><span>{method==='tree'?'📒':'🧺'}</span><div><strong>{method==='tree'?'翻翻過去的訂單':'我的訂單袋'}</strong><small>{rows.length} 筆紀錄{method!=='tree'?` · ${groups.length} 位不同客人`:''}</small></div><Eye size={19}/><ChevronRight size={17}/></button>
      {locked ? <><Done/><section className="panel your-tree"><span className="eyebrow">YOUR LITTLE TREE</span><h2>這是我的判斷方式</h2><TreeView node={locked} order={room.observation?.order}/><button className="button ghost full" onClick={()=>setShowPractice(!showPractice)}>{showPractice?'收起':'看看'}練習客人怎麼走 <ChevronRight size={16}/></button>{showPractice&&<PracticeWalk node={locked} order={rows[0]}/>}</section></> : room.open ? <section className="panel tree-builder"><div className="builder-step"><span>建立你的規則</span><div>{[0,1,2,3].map(i=><span key={i} className={step>=i?'active':''}/>)}</div><small>{step+1}/4</small></div>{step<3 ? <>
        <div className="builder-prompt"><span>{step===0?'🌱':'🌿'}</span><h2>{step===0?'先問哪個問題？':`回答「${step===1?'否':'是'}」的客人，再問什麼？`}</h2><p>{step===0?'選一個線索，把客人分成兩群。':`這一邊有 ${currentRows.length} 筆訂單，你也可以直接做出判斷。`}</p></div>
        {method==='forest' && <div className="random-offer"><Sparkles size={14}/> 這個分岔抽到了 {offered.length} 個線索</div>}
        {cannotSplit&&<p className="no-split-note">這兩個線索都分不開這群客人。這裡就長成一片葉子，依過去多數結果判斷。</p>}
        <div className="feature-options">{offered.map(f=><button key={f} disabled={cannotSplit} className={`feature-option ${selected===f?'selected':''}`} onClick={()=>choose(currentSlot,f)}><span>{featureInfo[f].icon}</span><div><strong>{featureInfo[f].question}</strong><small>{currentRows.filter(o=>o.features[f]).length} 筆是 · {currentRows.filter(o=>!o.features[f]).length} 筆否</small></div>{selected===f?<Check size={19}/>:<ChevronRight size={17}/>}</button>)}</div>
        {step>0&&<button className={`stop-branch ${selected===undefined?'selected':''}`} onClick={()=>choose(currentSlot,undefined)}>到這裡就好，依這一群過去多數結果判斷</button>}
        <div className="builder-actions">{step>0&&<button className="button ghost" onClick={()=>nextStep(step-1)} aria-label="上一步"><ChevronLeft/></button>}<button className="button primary" disabled={step===0&&!choices.root&&!cannotSplit} onClick={()=>{if(cannotSplit){const next={...choices,[currentSlot]:step===0?offered[0]:undefined};const nextIndex=step===0?3:step+1;setChoices(next);setStep(nextIndex);localStorage.setItem(draftKey,JSON.stringify({choices:next,step:nextIndex}));}else nextStep(step+1);}}>{step===2||cannotSplit&&step===0?'看看我的小樹':'下一步'}<ArrowRight size={18}/></button></div>
      </> : <><div className="builder-prompt"><span>🌳</span><h2>小樹長好了！</h2><p>新客人會沿著這些問題走，最後得到答案。</p></div>{preview&&<TreeView node={preview}/>}<div className="builder-actions"><button className="button ghost" onClick={()=>nextStep(0)}>修改</button><button className="button primary" disabled={busy} onClick={submit}><LockKeyhole size={17}/> 鎖定我的小樹</button></div><p className="tiny-note">鎖定後就不能改囉，讓規則自己接受挑戰。</p></> }</section> : <div className="panel"><h2>這一輪已收件</h2><p>先看看夥伴的小樹，下一個任務再一起加入。</p></div>}
    </>}
    {room.observation && <Observation room={room}/>}
    {bagOpen&&<Modal title={method==='tree'?'過去的訂單':'我的練習訂單袋'} onClose={()=>setBagOpen(false)}><p>{method==='tree'?'先看看客人的線索和過去的結果。':'× 次數代表重複抽到，會一起算進你的學習紀錄。'}</p><span className="pill">教學模擬資料 · {rows.length} 筆</span><div className="orders-grid">{groups.map(({order,count})=><OrderCard key={order.id} order={order} count={count}/>)}</div></Modal>}
  </>;
}

function PracticeWalk({node,order}:{node:NonNullable<RoomView['me']>['trees']['tree'];order:Order}) {
  if(!node||!order)return null;
  const steps:string[]=[];let cursor=node;
  while(cursor.feature){const feature=cursor.feature;const value=order.features[feature];steps.push(`${featureInfo[feature].question} → ${value?'是':'否'}`);const child=value?cursor.right:cursor.left;if(!child)break;cursor=child;}
  return <div className="practice-walk"><strong>{order.name}走進店裡…</strong>{steps.map((s,i)=><p key={i}><span>{i+1}</span>{s}</p>)}<div className="practice-result">我的樹猜：{cursor.prediction?'🍪 會加點心':'🥤 不加點心'}</div><small>練習案例：用來看路徑，不計入最終挑戰。</small></div>;
}

function Observation({room}:{room:RoomView}) {const observation=room.observation!;const total=observation.yes+observation.no;return <section className="panel observation"><span className="eyebrow">LET'S SEE WHAT HAPPENED</span><h2>大家一起，猜得怎麼樣？</h2><OrderCard order={observation.order}/><div className="vote-meter"><span style={{width:`${total?observation.yes/total*100:0}%`}}/></div><div className="vote-labels"><strong>🍪 加點 {observation.yes} 票</strong><span>🥤 不加點 {observation.no} 票</span></div><p className="tiny-note">這張是中途觀察訂單，和最後挑戰不同。</p></section>;}

function BoostMission({room,busy,act}:{room:RoomView;busy:boolean;act:Act}) {
  const boost=room.boost!;
  const submitted=room.me!.proposals[String(room.round)];
  const [selected,setSelected]=useState(submitted||'');
  const [ordersOpen,setOrdersOpen]=useState(false);
  const [inspect,setInspect]=useState<string>();
  if(!boost)return <Loading/>;
  const sorted=room.train.map((order,i)=>({order,weight:boost.weights[i]})).sort((a,b)=>b.weight-a.weight);
  return <><div className="boost-rounds">{[0,1,2].map(i=><div className={i===room.round?'active':i<room.round?'complete':''} key={i}><span>{i<room.round?<Check size={16}/>:i+1}</span><small>{['先抓方向','照顧錯題','再補盲點'][i]}</small>{i<2&&<ArrowRight size={16}/>}</div>)}</div><div className="mission-brief"><span>⚡</span><div><strong>{room.round===0?'每位客人，一樣重要':'上一輪漏掉的客人，現在更重要'}</strong><p>{room.round===0?'選一條簡單的規則，當我們的第一個幫手。':'關注籌碼越多，這張訂單猜錯的代價越大。再找一個幫手吧。'}</p></div></div><button className="order-bag-button" onClick={()=>setOrdersOpen(true)}><span>🪙</span><div><strong>查看訂單與關注籌碼</strong><small>8 張都還在，只是重點不同了</small></div><Eye size={19}/></button>
    {submitted&&<Done title="你的接力提案已送出！">等老師揭曉，看看哪個規則能照顧這輪的重點。</Done>}
    <section className="panel boost-choices"><span className="eyebrow">CHOOSE YOUR NEXT HELPER</span><h2>{room.revealed?'這輪的幫手揭曉了':'你想推薦哪一個幫手？'}</h2><p>每個幫手只問一個問題。點開看看它的判斷。</p><div className="candidate-list">{boost.candidates.map(candidate=><div key={candidate.id} className={`candidate ${selected===candidate.id?'selected':''} ${room.revealed&&boost.selected?.id===candidate.id?'winner':''}`}><button className="candidate-main" disabled={!!submitted||!room.open} onClick={()=>{setSelected(candidate.id);playChime();}}><span className="candidate-icon">{featureInfo[candidate.feature].icon}</span><div><strong>{featureInfo[candidate.feature].question}</strong><small>{room.revealed?`加權錯誤 ${(candidate.error*100).toFixed(1)}%`:'一個問題，兩種判斷'}</small></div>{selected===candidate.id?<Check size={18}/>:null}</button><button className="candidate-detail" onClick={()=>setInspect(inspect===candidate.id?undefined:candidate.id)}>{inspect===candidate.id?'收起規則':'看看規則'}<ChevronRight size={15}/></button>{inspect===candidate.id&&<TreeView node={candidate.tree} compact/>}{room.revealed&&boost.selected?.id===candidate.id&&<div className="selected-helper"><Star size={14} fill="currentColor"/> 本輪加權錯誤最少，加入接力！</div>}</div>)}</div>{!submitted&&room.open&&<button className="button primary full" disabled={!selected||busy} onClick={async()=>{if(await act({action:'proposal',candidateId:selected,revision:room.revision}))playChime();}}><Send size={17}/> 送出我的接力提案</button>}
    {room.revealed&&<div className="boost-takeaway"><strong>{boost.perfect?'這位幫手把練習題全部答對了！':boost.stopped?'暫時沒有更好的幫手':'新幫手加入，前面的幫手也還在。'}</strong><p>{boost.perfect?'接力提前完成，接著用新客人考驗它。':boost.stopped?'這輪不加入模型。規則越多不代表一定會進步。':'系統依加權錯誤選幫手，不是依大家投票的人氣決定。'}</p></div>}</section>
    {room.boosts&&room.boosts.length>0&&<section className="panel"><h3>我們的接力隊伍</h3><div className="relay-team">{room.boosts.filter(b=>b.selected).map(b=><div key={b.index}><span>{featureInfo[b.selected!.feature].icon}</span><strong>第 {b.index+1} 棒</strong><small>{b.perfect?'完美幫手':`發言份量 ${b.alpha?.toFixed(2)}`}</small></div>)}</div></section>}
    {ordersOpen&&<Modal title="誰需要多一點關注？" onClose={()=>setOrdersOpen(false)}><p>籌碼是相對重要程度，總共 100。答對的訂單也還在。</p><div className="orders-grid">{sorted.map(({order,weight})=><OrderCard order={order} weight={weight} key={order.id}/>)}</div></Modal>}
  </>;
}

function FinalMission({room}:{room:RoomView}) {
  const [predicted,setPredicted]=useState('');
  return <section className="final-mission"><div className="final-art"><img src="/art/forest-badge.svg" alt="森林徽章"/></div><span className="eyebrow">THE FINAL CHALLENGE</span><h1>真正的新客人，來了！</h1><p>把練習本收起來。<br/>用 6 張沒看過的訂單，考驗大家的規則。</p>{!room.revealed?<div className="panel"><LockKeyhole size={28}/><h2>答案還在信封裡</h2><p>先猜猜，哪一種方式會表現最好？<br/>這只是你的預想，不計分。</p><div className="prediction-options">{(room.duration==='short'?['一棵樹','隨機森林']:['一棵樹','分頭投票','隨機森林','錯題接力']).map(name=><button className={`button ${predicted===name?'primary':'secondary'}`} key={name} onClick={()=>setPredicted(name)}>{name}</button>)}</div>{predicted&&<p className="tiny-note">你看好「{predicted}」，等老師打開信封！</p>}</div>:<><Done title="新客人的答案揭曉了！">看看規則面對沒看過的訂單，表現有什麼不同。</Done><div className="panel results-list">{room.results?.filter(r=>!r.name.includes('系統示範')).map((row,i)=><div className="result-row" key={row.name}><span className="result-icon">{['🌱','🧺','🌳','⚡'][i%4]}</span><div><strong>{row.name}</strong><div className="result-bar"><span style={{width:`${row.correct/row.total*100}%`}}/></div><small>{row.modelCount} 個模型</small></div><b>{row.correct}<small> / {row.total}</small></b></div>)}</div><div className="mission-brief"><span>💭</span><div><strong>這場結果，有讓你意外嗎？</strong><p>很多人一起想，也可能一起犯錯。這是本場體驗，不代表某種方法永遠最好。</p></div></div></>}</section>;
}

function Reflection({room,busy,act}:{room:RoomView;busy:boolean;act:Act}) {
  const questions=questionsFor(room.duration);
  const existing=room.me!.answers;
  const [answers,setAnswers]=useState<number[]>(existing||[-1,-1,-1]);
  return <section className="reflection-mission"><span className="eyebrow">ONE LAST LITTLE QUEST</span><h1>領取你的店長徽章</h1><p>三個小問題，把今天的冒險裝進口袋。</p>{existing&&<Done title={`答對 ${existing.filter((a,i)=>a===questions[i].answer).length} / 3 題！`}>每一個發現，都是今天的收穫。</Done>}{questions.map((q,i)=><div className="panel quiz-card" key={i}><span className="quiz-number">0{i+1}</span><h2>{q.text}</h2>{q.options.map((option,j)=><button className={`quiz-option ${answers[i]===j?'selected':''} ${existing&&q.answer===j?'correct':''}`} key={j} disabled={!!existing||busy||!room.open} onClick={()=>setAnswers(answers.map((a,k)=>k===i?j:a))}><span>{String.fromCharCode(65+j)}</span>{option}{existing&&q.answer===j&&<Check size={17}/>}</button>)}{existing&&<p className="quiz-explanation">🌱 {q.explanation}</p>}</div>)}{!existing&&<button className="button primary full large" disabled={answers.some(a=>a<0)||busy||!room.open} onClick={async()=>{if(await act({action:'answers',answers,revision:room.revision}))playChime();}}><Trophy size={19}/> 完成店長挑戰</button>}</section>;
}

function Graduation({room}:{room:RoomView}) {const questions=questionsFor(room.duration);const me=room.me!;return <section className="graduation"><div className="confetti" aria-hidden="true">✦　✧　✦　✧</div><img src="/art/forest-badge.svg" alt="森林店長徽章"/><span className="eyebrow">YOU MADE THE FOREST GROW</span><h1>辛苦了，{me.name}店長！</h1><p>你的小小判斷，<br/>今天長成了一整片森林。</p><div className="panel graduation-card"><Trophy size={28}/><h2>{me.answers?'森林店長 · 挑戰完成':'森林夥伴 · 今日參與'}</h2><p>{room.duration==='short'?<>一個問題，就能長出一棵小樹。<br/>每棵樹看不同紀錄、挑不同線索。<br/>讓它們一起投票，就是森林的想法。<br/>用新客人驗證，才知道猜得好不好。</>:<>一串問題，是一棵樹。<br/>分頭學再合併，是 Bagging。<br/>加入隨機線索，一起長成森林。<br/>一輪接一輪補問題，是 Boosting。</>}</p>{me.answers&&<span className="pill">概念挑戰 {me.answers.filter((a,i)=>a===questions[i].answer).length} / 3</span>}</div><Link href="/" className="button primary full">回到森林小店<ArrowRight size={18}/></Link></section>;}
