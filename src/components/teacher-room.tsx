'use client';

import Link from 'next/link';
import QRCode from 'react-qr-code';
import { useEffect, useState } from 'react';
import { Clock3, Download, Maximize2, Pause, Play, QrCode, Users } from 'lucide-react';
import { useRoom } from '@/lib/client';
import { avatars, featureInfo, phaseName, questions, stages } from '@/lib/presentation';
import type { RoomAction, RoomView } from '@/lib/types';
import { Brand, ErrorNotice, Loading, Modal, OrderCard, TreeView } from './shared';

type Control = Extract<RoomAction, { action: 'advance' | 'close' | 'reveal' | 'pause' | 'resume' | 'addTime' | 'end' | 'demo' | 'reset' }>['action'];

function validOrigin(raw: string | null): string | undefined {
  if (!raw) return;
  try {
    const value = new URL(raw.trim());
    if (['http:', 'https:'].includes(value.protocol) && !value.username && !value.password) return value.origin;
  } catch { return; }
}

function downloadResults(room: RoomView, format: 'csv' | 'md') {
  const rows = room.results ?? [];
  const csv = (value: string | number) => {
    let text = String(value);
    if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const md = (value: string) => value.replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replace(/[\r\n]/g, ' ');
  const content = format === 'csv'
    ? '\uFEFF' + [['類別', '方法', '答對', '總題數', '模型數', ...(room.testOrders ?? []).map(o => `${o.id}（答案${o.label}）`)], ...rows.map(r => [r.name.startsWith('系統示範') ? '系統示範' : '課堂體驗', r.name, r.correct, r.total, r.modelCount, ...r.predictions])].map(row => row.map(csv).join(',')).join('\r\n')
    : `# 森林手搖店・課堂成果\n\n房間：${room.code}｜參與者：${room.players.length}（含 ${room.players.filter(p => p.demo).length} 位系統示範）\n\n教學模擬資料；本場結果不能代表演算法的一般效能。零模型列僅為預設預測，沒有訓練模型可供比較。\n\n| 類別 | 方法 | 答對／總題數 | 模型數 |\n| --- | --- | --- | --- |\n${rows.map(r => `| ${r.name.startsWith('系統示範') ? '系統示範' : '課堂體驗'} | ${md(r.name)} | ${r.correct}／${r.total} | ${r.modelCount} |`).join('\n')}\n\n## 封存題答案\n\n${(room.testOrders ?? []).map(o => `- ${md(o.id)}：${o.label ? '加點心' : '不加點心'}`).join('\n')}\n`;
  const url = URL.createObjectURL(new Blob([content], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = `forest-tea-${room.code}.${format}`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function TeacherRoom({ code, displayOnly = false }: { code: string; displayOnly?: boolean }) {
  const { room, error, busy, act, ready, authenticated } = useRoom(code, displayOnly ? 'display' : 'teacher');
  const [modal, setModal] = useState<'qr' | 'roster' | null>(null);
  const [confirm, setConfirm] = useState<Control | null>(null);
  const [origin, setOrigin] = useState('');
  const [address, setAddress] = useState('');
  const [urlError, setUrlError] = useState('');
  const [now, setNow] = useState(0);
  const [clockOffset, setClockOffset] = useState(0);
  const [resultTab, setResultTab] = useState<'class' | 'system'>('class');
  useEffect(() => {
    const key = `forest-tea:join-origin:${code}`;
    const stored = validOrigin(localStorage.getItem(key)) || validOrigin(localStorage.getItem('forest-tea:join-origin')) || window.location.origin;
    setOrigin(stored); setAddress(stored); setNow(Date.now());
    const synchronize = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || (event.key !== key && event.key !== 'forest-tea:join-origin')) return;
      const updated = validOrigin(localStorage.getItem(key)) || validOrigin(localStorage.getItem('forest-tea:join-origin')) || window.location.origin;
      setOrigin(updated); setAddress(updated);
    };
    window.addEventListener('storage', synchronize);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(timer); window.removeEventListener('storage', synchronize); };
  }, [code]);
  useEffect(() => { if (room) setClockOffset(Date.now() - room.serverTime); }, [room]);

  if (ready && !displayOnly && !authenticated) return <main className="teacher-shell"><Brand/><section className="panel"><h1>這個瀏覽器沒有教師憑證</h1><p>請回到建立房間時使用的瀏覽器，或重新建立一間小店。知道房間碼不會取得教師權限。</p><Link className="button primary" href="/teacher">建立新房間</Link></section></main>;
  if (!room) return <><ErrorNotice message={error}/><Loading/></>;
  if (!displayOnly && !room.teacher) return <main className="teacher-shell"><Brand/><section className="panel"><h1>無法確認教師身分</h1><p>請使用建立這個房間的瀏覽器開啟控制台。</p><Link href="/teacher" className="button primary">回到建立房間</Link></section></main>;

  const stage = stages.find(s => s.phase === room.phase);
  const collecting = ['tree', 'bagging', 'forest', 'boosting'].includes(room.phase);
  const remaining = Math.max(0, room.endsAt === null ? room.remainingMs : room.endsAt - (now - clockOffset));
  const seconds = Math.ceil(remaining / 1000);
  const timerText = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  const joinUrl = origin ? `${origin}/join?room=${encodeURIComponent(code)}` : '';
  const localOnly = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?=[:/]|$)/i.test(origin);
  const pending = room.players.length - room.submitted;
  const demoCount = room.players.filter(p => p.demo).length;
  const resultsVisible = room.revealed && ['final', 'reflection', 'ended'].includes(room.phase) && !!room.results;
  const resultRows = room.results?.filter(row => row.name.startsWith('系統示範') === (resultTab === 'system')) ?? [];
  const primaryAction: Control = room.phase === 'waiting' || room.phase === 'reflection' || room.revealed ? 'advance' : 'reveal';
  const primaryText = room.phase === 'waiting' ? '開始第一關' : room.phase === 'reflection' ? '完成課堂' : room.revealed ? (room.phase === 'boosting' && room.round < 2 && !room.boost?.perfect && !room.boost?.stopped ? '開始下一輪接力' : '前往下一階段') : room.phase === 'final' ? '揭曉封存題成績' : room.open ? '收件並揭曉' : '揭曉這一輪';
  const control = (action: Control) => {
    if (action === 'close' || action === 'end' || action === 'reset' || (action === 'reveal' && collecting && room.open)) setConfirm(action);
    else void act({ action });
  };
  const applyAddress = (event: React.FormEvent) => {
    event.preventDefault();
    const value = validOrigin(address);
    if (!value) { setUrlError('請填寫包含 http:// 或 https:// 的有效網站或區網網址，且不要包含帳號密碼。'); return; }
    setOrigin(value); setAddress(value); setUrlError('');
    localStorage.setItem(`forest-tea:join-origin:${code}`, value);
    localStorage.setItem('forest-tea:join-origin', value);
  };
  const roster = <div className="roster">{room.players.length ? room.players.map(p => <div className="avatar-chip" key={p.id}><span>{avatars[p.avatar % avatars.length]}</span><strong>{p.name}</strong>{p.demo && <small className="pill">系統示範</small>}<small>{room.phase === 'waiting' ? '已到店' : p.submitted ? '✓ 已提交' : '尚未提交'}</small></div>) : <p>店長們還在路上，掃描 QR 就能加入。</p>}</div>;
  const qr = <div className="qr-panel">{joinUrl && <QRCode value={joinUrl} size={280} title={`加入森林手搖店，房間 ${code}`} style={{ maxWidth: '100%', height: 'auto' }}/>}<strong>掃碼，加入這間小店</strong><p>或開啟加入頁，輸入房間碼 <b>{code}</b></p>{joinUrl && <a href={joinUrl} target="_blank" rel="noreferrer">{joinUrl}</a>}{localOnly && <p className="error-notice">目前網址只適用這台電腦，手機無法用 localhost 連線。請老師改填已部署網址，或同一 Wi-Fi 下可連線的電腦區網網址。</p>}{!displayOnly && <form onSubmit={applyAddress}><label htmlFor="join-address">學生可連線的網址</label><input id="join-address" type="url" value={address} onChange={e => setAddress(e.target.value)} placeholder="http://192.168.1.10:3100"/><button className="button secondary" type="submit">更新 QR 網址</button><ErrorNotice message={urlError}/><small>更新只改變這個瀏覽器的 QR 連結；請先用手機實測連線。</small></form>}</div>;

  return <main className={`teacher-shell ${displayOnly ? 'display-only' : ''}`}>
    <header className="teacher-header"><Brand small/><div><span className="pill">{displayOnly ? '課堂投影' : '教師控制台'}</span><button className="button ghost" onClick={() => setModal('qr')}><QrCode size={18}/> 房間 {code}</button><button className="button ghost" onClick={() => setModal('roster')}><Users size={18}/>{room.players.length} 位店長</button>{!displayOnly && <Link className="button secondary" href={`/display/${code}`} target="_blank"><Maximize2 size={16}/>開啟投影</Link>}</div></header>
    <nav className="stage-rail" aria-label="課堂進度"><span className={room.phase === 'waiting' ? 'active' : ''}>準備開店</span>{stages.map((s, i) => <span key={s.phase} className={room.phase === s.phase ? 'active' : ''} aria-current={room.phase === s.phase ? 'step' : undefined}>{s.icon} {i + 1}. {s.name}</span>)}<span className={['final', 'reflection', 'ended'].includes(room.phase) ? 'active' : ''}>🍪 新客人挑戰</span></nav>
    <ErrorNotice message={error ? `${error} 畫面可能仍是上次成功連線的狀態。` : ''}/>
    <div className="teacher-layout"><div className="teacher-main">
      <div className="teacher-stage-heading"><div><p className="eyebrow">{stage?.english ?? 'WELCOME TO FOREST TEA CLUB'}</p><h1>{stage?.icon} {phaseName(room.phase)}{room.phase === 'boosting' && <span className="pill">第 {room.round + 1}／3 輪</span>}</h1><p>{stage?.subtitle ?? (room.phase === 'waiting' ? '今天，讓每一個小小判斷，長成一座森林。' : room.phase === 'final' ? '所有模型都準備好了，一起迎接沒見過的新客人。' : '把今天學到的判斷方式，帶回日常生活。')}</p></div><div className="stat-card"><Clock3 size={18}/><strong role="timer" aria-label={`剩餘 ${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`}>{timerText}</strong><small>{room.phase === 'ended' ? '課堂已結束' : seconds === 0 ? '時間到，等待老師收件' : room.endsAt === null ? '倒數暫停' : '倒數只提醒，不自動收件'}</small></div></div>

      {room.phase === 'waiting' && <section className="panel lobby-grid"><div><p className="eyebrow">LET’S OPEN OUR LITTLE SHOP</p><h2>你的店長夥伴，<br/>正在集合中。</h2><p>拿起手機掃描 QR，選一個喜歡的暱稱和頭像。無須學號或電子郵件。</p><div className="stats-grid"><div className="stat-card"><strong>{room.players.length}</strong><span>位店長已到店</span></div><div className="stat-card"><strong>{room.duration === 'full' ? '40' : '25'}</strong><span>分鐘課堂流程</span></div></div>{demoCount > 0 && <p className="pill">其中 {demoCount} 位為系統示範身分</p>}{roster}</div>{qr}</section>}

      {collecting && <><section className="panel"><div className="stats-grid"><div className="stat-card"><span>{room.phase === 'boosting' ? '本輪提案' : '規則提交'}</span><strong>{room.submitted}／{room.players.length}</strong></div><div className="stat-card"><span>目前狀態</span><strong>{room.revealed ? '已揭曉' : room.open ? '收件中' : '已收件'}</strong><small>{room.open ? `還有 ${pending} 位尚未提交` : '提交已鎖定'}</small></div></div><div className="progress-track" role="progressbar" aria-label="本輪提交進度" aria-valuenow={room.submitted} aria-valuemin={0} aria-valuemax={Math.max(1, room.players.length)}><span style={{ width: `${room.players.length ? room.submitted / room.players.length * 100 : 0}%` }}/></div>{!room.revealed && <p>{room.phase === 'boosting' ? '每人提出一個簡單規則；系統依加權錯誤選出本輪模型，提案票數不決定模型。' : '請在手機上完成自己的判斷樹。鎖定後，新客人會沿著同一套規則走。'}</p>}{!room.submitted && !room.revealed && <p>目前還沒有提交，請等待店長們，或由老師加入明確標示的示範店長。</p>}</section>
        {room.observation && room.revealed && <section className="panel"><p className="eyebrow">LET THE TREES VOTE</p><h2>這位客人，會加點心嗎？</h2><div className="lobby-grid"><OrderCard order={room.observation.order}/><div><div className="stats-grid"><div className="stat-card"><strong>🍪 {room.observation.yes}</strong><span>棵樹猜加點心</span></div><div className="stat-card"><strong>🥤 {room.observation.no}</strong><span>棵樹猜不加點</span></div></div><p>{room.observation.yes === room.observation.no ? '這次平票，依預先約定採練習集多數；練習集也平手，採不加點。' : `合併預測：${room.observation.yes > room.observation.no ? '加點心' : '不加點心'}。`}</p><p>只計已提交的樹，未提交不算反對票。</p></div></div></section>}
        {!!room.showcase?.length && room.revealed && <section className="panel"><h2>讓不同的判斷，一起被看見</h2><p>展示前 {room.showcase.length} 棵已提交的樹；投票包含全部已提交模型。</p><div className="mini-tree-grid">{room.showcase.map((item, i) => <article className="tree-preview" key={`${item.name}-${i}`}><h3>{item.name}</h3><TreeView node={item.tree} compact order={room.observation?.order}/></article>)}</div></section>}
      </>}

      {room.phase === 'boosting' && room.boost && <><section className="panel"><h2>{room.revealed ? '本輪幫手，已經選出來了' : '四個簡單規則，誰最能照顧重點訂單？'}</h2>{room.revealed && <div className="stats-grid"><div className="stat-card"><span>本輪模型</span><strong>{room.boost.selected ? featureInfo[room.boost.selected.feature].label : '沒有有效弱模型'}</strong></div><div className="stat-card"><span>本輪加權錯誤</span><strong>{room.boost.epsilon?.toFixed(3) ?? '—'}</strong></div><div className="stat-card"><span>發言份量</span><strong>{room.boost.perfect ? '完美模型優先' : room.boost.alpha?.toFixed(3) ?? '—'}</strong></div></div>}{room.boost.perfect && <p>這輪沒有錯題，提前完成。直接使用完美弱模型，不計算無限權重。</p>}{room.boost.stopped && <p>沒有加權錯誤低於 0.5 的弱模型，停止新增模型。</p>}<div className="mini-tree-grid">{room.boost.candidates.map(candidate => <article key={candidate.id} className="tree-preview"><h3>{room.revealed && room.boost?.selected?.id === candidate.id ? '✓ ' : ''}{featureInfo[candidate.feature].label}</h3><TreeView node={candidate.tree} compact/>{(!displayOnly || room.revealed) && <p>加權錯誤：{candidate.error.toFixed(3)}</p>}{room.revealed && room.proposalCounts && <small>本輪提案：{room.proposalCounts[candidate.id] ?? 0} 人</small>}</article>)}</div><p>葉子採本輪權重多數決；同分依固定線索順序選擇。提案人數只呈現課堂參與，模型由最小加權錯誤選出。</p></section><section className="panel"><h2>關注籌碼：每一張訂單都還在</h2><p>{room.round === 0 ? '第一輪每張卡的權重相同，總和為 1。' : '上一輪錯題的相對權重增加；正確題也會繼續參與訓練。'} 顯示值四捨五入，計算保留完整精度。</p><details><summary>查看全部 {room.train.length} 張訂單與本輪權重</summary><div className="mini-tree-grid">{room.train.map((order, i) => <div key={order.id}><OrderCard order={order} weight={room.boost?.weights[i]}/>{room.round > 0 && room.boosts?.[room.round - 1] && <small>上輪訓練權重 {(room.boosts[room.round - 1].weights[i] * 100).toFixed(1)} → 本輪 {(room.boost!.weights[i] * 100).toFixed(1)}（總籌碼 100）</small>}</div>)}</div></details>{!!room.boosts?.length && <div className="mini-tree-grid">{room.boosts.map(round => <div className="stat-card" key={round.index}><span>第 {round.index + 1} 輪</span><strong>{round.selected ? featureInfo[round.selected.feature].label : '停止'}</strong><small>{round.perfect ? '完美模型優先' : `發言份量＝${round.alpha?.toFixed(3) ?? '—'}`}</small></div>)}</div>}</section></>}

      {room.phase === 'final' && !room.revealed && <section className="panel"><p className="eyebrow">SEALED ORDERS</p><h2>🔒 12 張新訂單，等待揭曉</h2><p>這些答案沒有參與抽樣、選規則或調整模型。所有方法都會接受同一份挑戰。</p><p>先猜猜看：分頭學習，或是循序補盲點，這次會有什麼不同？多個模型不保證更準。</p></section>}

      {resultsVisible && <section className="panel"><div className="teacher-stage-heading"><div><p className="eyebrow">TODAY’S LITTLE DISCOVERY</p><h2>新客人挑戰，成績揭曉</h2></div>{!displayOnly && <div><button className="button secondary" onClick={() => downloadResults(room, 'csv')}><Download size={16}/>CSV</button><button className="button ghost" onClick={() => downloadResults(room, 'md')}>Markdown</button></div>}</div><div className="teacher-controls" role="group" aria-label="成果類別"><button className={`button ${resultTab === 'class' ? 'primary' : 'secondary'}`} aria-pressed={resultTab === 'class'} onClick={() => setResultTab('class')}>課堂體驗</button><button className={`button ${resultTab === 'system' ? 'primary' : 'secondary'}`} aria-pressed={resultTab === 'system'} onClick={() => setResultTab('system')}>固定條件示範</button></div><p>{resultTab === 'class' ? '使用本場已鎖定的手作規則；單樹列取一位已提交店長作例子，並非全班平均。' : '系統自動選分裂、固定種子、最多深度 2；Bagging 與森林各 5 棵樹。這些分數獨立於學生的手作模型。'}</p><div className="results-list">{resultRows.map(row => <article className="result-row" key={row.name}><div><h3>{row.name}</h3><small>{row.modelCount} 個模型{row.modelCount === 0 ? ' · 未建立模型，僅為預設預測' : ''}</small></div><div><strong>{row.modelCount ? `${row.correct}／${row.total}` : '未參與'}</strong><small>{row.modelCount ? '張答對' : '不比較成績'}</small></div><div className="progress-track"><span style={{ width: `${row.modelCount && row.total ? row.correct / row.total * 100 : 0}%` }}/></div></article>)}</div><p>這是本場少量教學模擬題的結果，不能由此認定某種演算法普遍更好。</p><details><summary>查看封存訂單與答案</summary><div className="mini-tree-grid">{room.testOrders?.map(order => <OrderCard key={order.id} order={order}/>)}</div></details></section>}

      {['reflection', 'ended'].includes(room.phase) && <section className="panel"><p className="eyebrow">TAKE A LITTLE WISDOM HOME</p><h2>{room.phase === 'ended' ? '今天的小店，圓滿打烊' : '三個問題，把觀念帶回家'}</h2><p>{room.reflections?.answered ?? 0} 位店長已完成離店任務。</p>{questions.map((question, i) => <article key={question.text}><h3>{i + 1}. {question.text}</h3>{(room.phase === 'ended' || !displayOnly) && <><p>{question.options[question.answer]}。{question.explanation}</p><small>{room.reflections?.correct[i] ?? 0}／{room.reflections?.answered ?? 0} 人答對</small></>}</article>)}<p>一串問題是一棵樹；分頭學再合併是 Bagging；加入分岔線索抽樣形成森林；前後相接補問題是 Boosting。</p>{room.phase === 'ended' && !resultsVisible && <p>這堂課在最終揭曉前結束，尚無已揭露的封存題成果。</p>}</section>}
    </div>

    {!displayOnly && <aside className="teacher-sidebar"><section className="panel"><p className="eyebrow">TEACHER’S COUNTER</p><h2>店長控制台</h2><div className="teacher-controls">{room.phase !== 'ended' && <button className="button primary" disabled={busy || (collecting && !room.submitted)} onClick={() => control(primaryAction)}>{busy ? '處理中…' : primaryText}</button>}{collecting && room.open && <button className="button secondary" disabled={busy || !room.submitted} onClick={() => control('close')}>先收件，暫不揭曉</button>}{room.phase !== 'ended' && <><button className="button secondary" disabled={busy} onClick={() => control(room.endsAt === null ? 'resume' : 'pause')}>{room.endsAt === null ? <Play size={16}/> : <Pause size={16}/>} {room.endsAt === null ? '開始／繼續倒數' : '暫停倒數'}</button><button className="button ghost" disabled={busy} onClick={() => control('addTime')}>＋ 加 1 分鐘</button></>}</div><p>倒數不會自動收件。只有已提交的模型參與合併。</p></section><section className="panel"><p className="eyebrow">A NOTE FOR YOU</p><h3>這一站，帶大家發現什麼？</h3><p>{stage?.note ?? (room.phase === 'waiting' ? '先請一位學生用手機測試 QR。每個人是店長，提交的規則才是模型。題庫均為教學合成資料。' : room.phase === 'final' ? '先收集學生對結果的預期，再揭曉共同封存題。問：哪些模型可能一起犯錯？不要把本場名次當作演算法優劣定論。' : '請學生用自己的話說明平行投票與循序糾錯，留意是否誤把人氣票選當作 AdaBoost。')}</p></section><section className="panel"><h3>課堂工具</h3><div className="teacher-controls"><button className="button secondary" onClick={() => setModal('roster')}>查看提交名單</button><button className="button secondary" onClick={() => setModal('qr')}>放大加入 QR</button>{['waiting', 'tree', 'bagging', 'forest', 'boosting'].includes(room.phase) && <button className="button ghost" disabled={busy} onClick={() => control('demo')}>加入系統示範店長</button>}{room.phase !== 'ended' && <button className="button danger" disabled={busy} onClick={() => control('end')}>提前結束課堂</button>}<button className="button ghost" disabled={busy} onClick={() => control('reset')}>重開一間新店</button></div><small>{room.storage === 'local' ? '本機儲存模式' : 'Firebase 雲端儲存'} · {demoCount} 位系統示範</small></section></aside>}
    </div>
    {modal && <Modal title={modal === 'qr' ? `加入房間 ${code}` : '店長到店與提交名單'} onClose={() => setModal(null)}>{modal === 'qr' ? qr : roster}</Modal>}
    {confirm && !displayOnly && <Modal title={confirm === 'reset' ? '重開一間新店？' : confirm === 'end' ? '提前結束這堂課？' : '確定收件？'} onClose={() => setConfirm(null)}><p>{confirm === 'reset' ? '系統會建立新房間和新 QR，舊房間資料保留。請先匯出已揭露的成果。' : confirm === 'end' ? '學生將無法繼續提交。尚未揭曉的封存題不會自動公開。' : `還有 ${pending} 位店長未提交。收件後不能再修改本輪規則${confirm === 'reveal' ? '，並會立即揭曉結果' : ''}。`}</p><div className="teacher-controls"><button className="button secondary" disabled={busy} onClick={() => setConfirm(null)}>再等一下</button><button className={`button ${confirm === 'end' ? 'danger' : 'primary'}`} disabled={busy} onClick={async () => { if (await act({ action: confirm })) setConfirm(null); }}>{busy ? '處理中…' : '確定'}</button></div></Modal>}
  </main>;
}

