"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

type ParcelStatus = "pending" | "picked";
type Parcel = { id:string; owner:string; name:string; tracking:string; pickupCode:string; location:string; note:string; status:ParcelStatus; createdAt:string; pickedAt:string|null };
type Draft = Pick<Parcel,"owner"|"name"|"tracking"|"pickupCode"|"location"|"note">;
type HistoryGroup = "today"|"yesterday"|"earlier";
interface BeforeInstallPromptEvent extends Event { prompt:()=>Promise<void>; userChoice:Promise<{outcome:"accepted"|"dismissed"}> }

const STORAGE_KEY = "parcel-pickup-list-v1";
const emptyDraft:Draft = { owner:"",name:"",tracking:"",pickupCode:"",location:"",note:"" };
const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const formatDateTime = (value:string|null) => value ? new Intl.DateTimeFormat("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(value)) : "";

function groupFor(value:string|null):HistoryGroup {
  if (!value) return "earlier";
  const target=new Date(value),now=new Date();
  const start=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
  const targetStart=new Date(target.getFullYear(),target.getMonth(),target.getDate()).getTime();
  if (targetStart===start) return "today";
  if (targetStart===start-86_400_000) return "yesterday";
  return "earlier";
}

function isParcel(value:unknown):value is Parcel {
  if (!value||typeof value!=="object") return false;
  const item=value as Partial<Parcel>;
  return typeof item.id==="string"&&typeof item.owner==="string"&&typeof item.name==="string"&&typeof item.tracking==="string"&&(item.status==="pending"||item.status==="picked")&&typeof item.createdAt==="string";
}

export default function Home() {
  const [parcels,setParcels]=useState<Parcel[]>([]);
  const [ready,setReady]=useState(false);
  const [query,setQuery]=useState("");
  const [ownerFilter,setOwnerFilter]=useState("all");
  const [pickedOpen,setPickedOpen]=useState(false);
  const [sheet,setSheet]=useState<"form"|"settings"|null>(null);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [draft,setDraft]=useState<Draft>(emptyDraft);
  const [actionId,setActionId]=useState<string|null>(null);
  const [toast,setToast]=useState<{message:string;undoId?:string}|null>(null);
  const [installPrompt,setInstallPrompt]=useState<BeforeInstallPromptEvent|null>(null);

  useEffect(()=>{
    try {
      const stored=localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed=JSON.parse(stored) as unknown;
        if (Array.isArray(parsed)) setParcels(parsed.filter(isParcel).map((item)=>({pickupCode:"",location:"",note:"",pickedAt:null,...item})));
      }
    } catch { setToast({message:"本机记录读取失败，可以尝试导入备份"}); }
    finally { setReady(true); }
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(()=>undefined);
    const handleInstall=(event:Event)=>{ event.preventDefault(); setInstallPrompt(event as BeforeInstallPromptEvent); };
    window.addEventListener("beforeinstallprompt",handleInstall);
    return ()=>window.removeEventListener("beforeinstallprompt",handleInstall);
  },[]);
  useEffect(()=>{ if (ready) localStorage.setItem(STORAGE_KEY,JSON.stringify(parcels)); },[parcels,ready]);
  useEffect(()=>{ if (!toast) return; const timer=window.setTimeout(()=>setToast(null),5000); return()=>window.clearTimeout(timer); },[toast]);
  useEffect(()=>{ document.body.classList.toggle("sheet-open",sheet!==null); return()=>document.body.classList.remove("sheet-open"); },[sheet]);

  const pending=useMemo(()=>parcels.filter((item)=>item.status==="pending").sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),[parcels]);
  const picked=useMemo(()=>parcels.filter((item)=>item.status==="picked").sort((a,b)=>(b.pickedAt??"").localeCompare(a.pickedAt??"")),[parcels]);
  const owners=useMemo(()=>Array.from(new Set(parcels.map((item)=>item.owner))).sort((a,b)=>a.localeCompare(b)),[parcels]);
  const matches=(item:Parcel)=>{ const needle=query.trim().toLowerCase(); return (!needle||[item.owner,item.name,item.tracking,item.pickupCode,item.location,item.note].some((value)=>value.toLowerCase().includes(needle)))&&(ownerFilter==="all"||item.owner===ownerFilter); };
  const filteredPending=pending.filter(matches),filteredPicked=picked.filter(matches);
  const groupedPicked:Record<HistoryGroup,Parcel[]>={today:filteredPicked.filter((item)=>groupFor(item.pickedAt)==="today"),yesterday:filteredPicked.filter((item)=>groupFor(item.pickedAt)==="yesterday"),earlier:filteredPicked.filter((item)=>groupFor(item.pickedAt)==="earlier")};
  const showToast=(message:string,undoId?:string)=>setToast({message,undoId});
  const openNew=()=>{ setDraft(emptyDraft); setEditingId(null); setSheet("form"); };
  const openEdit=(item:Parcel)=>{ const {owner,name,tracking,pickupCode,location,note}=item; setDraft({owner,name,tracking,pickupCode,location,note}); setEditingId(item.id); setActionId(null); setSheet("form"); };

  const saveParcel=(event:FormEvent)=>{
    event.preventDefault();
    const normalized:Draft={owner:draft.owner.trim().toUpperCase(),name:draft.name.trim(),tracking:draft.tracking.replace(/\s+/g,"").trim(),pickupCode:draft.pickupCode.trim(),location:draft.location.trim(),note:draft.note.trim()};
    if (!normalized.owner||!normalized.name||!normalized.tracking) return;
    const duplicate=parcels.find((item)=>item.id!==editingId&&item.tracking.toLowerCase()===normalized.tracking.toLowerCase());
    if (duplicate&&!window.confirm(`单号 ${normalized.tracking} 已经存在，仍然保存吗？`)) return;
    if (editingId) { setParcels((current)=>current.map((item)=>item.id===editingId?{...item,...normalized}:item)); showToast("快递信息已更新"); }
    else { setParcels((current)=>[{id:newId(),...normalized,status:"pending",createdAt:new Date().toISOString(),pickedAt:null},...current]); showToast("已加入待拿清单"); }
    setSheet(null); setDraft(emptyDraft); setEditingId(null);
  };
  const markPicked=(id:string)=>{ setParcels((current)=>current.map((item)=>item.id===id?{...item,status:"picked",pickedAt:new Date().toISOString()}:item)); showToast("已标记为拿到",id); };
  const undoPicked=(id:string)=>{ setParcels((current)=>current.map((item)=>item.id===id?{...item,status:"pending",pickedAt:null}:item)); setToast({message:"已恢复到待拿清单"}); };
  const deleteParcel=(item:Parcel)=>{ if (!window.confirm(`确定删除“${item.name}”吗？删除后无法恢复。`)) return; setParcels((current)=>current.filter((parcel)=>parcel.id!==item.id)); setActionId(null); showToast("已删除记录"); };
  const copyTracking=async(item:Parcel)=>{ try { await navigator.clipboard.writeText(item.tracking); showToast("快递单号已复制"); } catch { showToast("复制失败，请长按单号复制"); } };
  const clearHistoryGroup=(group:HistoryGroup,items:Parcel[])=>{ if (!items.length||!window.confirm(`确定删除这组的 ${items.length} 条已拿记录吗？`)) return; const ids=new Set(items.map((item)=>item.id)); setParcels((current)=>current.filter((item)=>!ids.has(item.id))); showToast("历史记录已清理"); };

  const exportBackup=()=>{ const payload=JSON.stringify({version:1,exportedAt:new Date().toISOString(),parcels},null,2); const url=URL.createObjectURL(new Blob([payload],{type:"application/json"})); const link=document.createElement("a"); link.href=url; link.download=`拿快递备份-${new Date().toISOString().slice(0,10)}.json`; link.click(); URL.revokeObjectURL(url); showToast("备份已导出"); };
  const importBackup=async(event:ChangeEvent<HTMLInputElement>)=>{ const file=event.target.files?.[0]; event.target.value=""; if (!file) return; try { const parsed=JSON.parse(await file.text()) as {parcels?:unknown}|unknown[]; const values=Array.isArray(parsed)?parsed:parsed.parcels; if (!Array.isArray(values)||!values.every(isParcel)) throw new Error("invalid"); if (!window.confirm(`将用备份中的 ${values.length} 条记录替换本机现有数据，继续吗？`)) return; setParcels(values.map((item)=>({pickupCode:"",location:"",note:"",pickedAt:null,...item}))); setSheet(null); showToast("备份已恢复"); } catch { showToast("备份文件无法识别，请选择由本网页导出的文件"); } };
  const installApp=async()=>{ if (!installPrompt) return; await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); };

  return <main className="app-shell">
    <header className="topbar"><div><p className="eyebrow">我的取件清单</p><h1>拿快递</h1></div><button className="round-button" onClick={()=>setSheet("settings")} aria-label="打开设置">•••</button></header>
    <section className="summary" aria-label="快递数量统计"><div><strong>{pending.length}</strong><span>件待拿</span></div><div className="summary-divider"/><div><strong>{picked.length}</strong><span>件已拿</span></div><p>{pending.length?`还剩 ${pending.length} 件，拿完就可以回去啦`:"都拿完了，今天很利落 ✓"}</p></section>
    <div className="search-row"><label className="search-box"><span aria-hidden="true">⌕</span><input value={query} onChange={(event)=>setQuery(event.target.value)} aria-label="搜索快递" placeholder="搜人员、物品或快递单号"/></label><select className="filter-button" value={ownerFilter} onChange={(event)=>setOwnerFilter(event.target.value)} aria-label="按人员筛选"><option value="all">全部人员</option>{owners.map((owner)=><option value={owner} key={owner}>{owner}</option>)}</select></div>
    <section className="list-section"><div className="section-heading"><h2>待拿</h2><span>{filteredPending.length} 件</span></div>
      {!ready?<div className="empty-card"><strong>正在读取本机清单…</strong></div>:filteredPending.length?<div className="parcel-list">{filteredPending.map((item)=><article className="parcel-card" key={item.id}>
        <div className="card-top"><span className="owner-badge">{item.owner.slice(0,3)}</span><div className="parcel-main"><h3>{item.name}</h3><div className="tracking-line"><code>{item.tracking}</code><button onClick={()=>copyTracking(item)} aria-label={`复制${item.name}的快递单号`}>复制</button></div></div><button className="more-button" onClick={()=>setActionId(actionId===item.id?null:item.id)} aria-expanded={actionId===item.id} aria-label={`打开${item.name}的操作`}>•••</button></div>
        {(item.pickupCode||item.location||item.note)&&<div className="parcel-extras">{item.pickupCode&&<span>取件码 <b>{item.pickupCode}</b></span>}{item.location&&<span>位置 {item.location}</span>}{item.note&&<span>{item.note}</span>}</div>}
        {actionId===item.id&&<div className="action-row"><button onClick={()=>openEdit(item)}>编辑</button><button className="danger-text" onClick={()=>deleteParcel(item)}>删除</button></div>}<button className="picked-button" onClick={()=>markPicked(item.id)}>✓&nbsp; 确认已拿</button></article>)}</div>:<div className="empty-card"><span>{query||ownerFilter!=="all"?"⌕":"✓"}</span><strong>{query||ownerFilter!=="all"?"没有找到相关快递":"待拿清单是空的"}</strong><p>{query||ownerFilter!=="all"?"试试更换关键词或人员":"点击下方按钮，记下第一件快递"}</p></div>}
    </section>
    <section className="history-section"><button className="picked-summary" onClick={()=>setPickedOpen((open)=>!open)} aria-expanded={pickedOpen}><span className="picked-check">✓</span><span><strong>已拿</strong><small>{picked.length?`共完成 ${picked.length} 件`:"还没有已拿记录"}</small></span><b className={pickedOpen?"chevron-open":""}>⌄</b></button>
      {pickedOpen&&<div className="history-groups">{(["today","yesterday","earlier"] as HistoryGroup[]).map((group)=>{ const items=groupedPicked[group]; if (!items.length) return null; const label=group==="today"?"今天":group==="yesterday"?"昨天":"更早"; return <div className="history-group" key={group}><div className="history-heading"><h3>{label}</h3><button onClick={()=>clearHistoryGroup(group,items)}>清理 {items.length} 条</button></div>{items.map((item)=><article className="parcel-card parcel-card-picked" key={item.id}><div className="card-top"><span className="owner-badge picked-owner">✓</span><div className="parcel-main"><h3>{item.name} <small>· {item.owner}</small></h3><div className="tracking-line"><code>{item.tracking}</code><button onClick={()=>copyTracking(item)}>复制</button></div><p className="picked-time">{formatDateTime(item.pickedAt)} 已拿</p></div></div><div className="history-actions"><button onClick={()=>undoPicked(item.id)}>撤销，放回待拿</button><button onClick={()=>openEdit(item)}>编辑</button><button className="danger-text" onClick={()=>deleteParcel(item)}>删除</button></div></article>)}</div>; })}{!filteredPicked.length&&<p className="history-empty">没有符合筛选条件的已拿记录。</p>}</div>}
    </section>
    <button className="add-button" onClick={openNew}>+　新增快递</button>
    {sheet&&<div className="scrim" onMouseDown={()=>setSheet(null)}><section className="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onMouseDown={(event)=>event.stopPropagation()}><div className="sheet-handle"/><div className="sheet-header"><div><p className="eyebrow">{sheet==="form"?"快递信息":"只保存在这台设备"}</p><h2 id="sheet-title">{sheet==="form"?(editingId?"编辑快递":"新增快递"):"设置与备份"}</h2></div><button className="close-button" onClick={()=>setSheet(null)} aria-label="关闭">×</button></div>
      {sheet==="form"?<form className="parcel-form" onSubmit={saveParcel}><div className="form-grid"><label><span>人员缩写 *</span><input autoFocus maxLength={6} value={draft.owner} onChange={(event)=>setDraft({...draft,owner:event.target.value})} placeholder="例如 M" required/></label><label><span>物品名称 *</span><input maxLength={40} value={draft.name} onChange={(event)=>setDraft({...draft,name:event.target.value})} placeholder="例如 防水盒" required/></label></div><label><span>快递单号 *</span><input className="mono-input" inputMode="text" maxLength={50} value={draft.tracking} onChange={(event)=>setDraft({...draft,tracking:event.target.value})} placeholder="输入数字或字母" required/></label><details><summary>＋ 更多信息（可选）</summary><div className="optional-fields"><div className="form-grid"><label><span>取件码</span><input maxLength={30} value={draft.pickupCode} onChange={(event)=>setDraft({...draft,pickupCode:event.target.value})} placeholder="例如 3-12-08"/></label><label><span>驿站 / 柜机</span><input maxLength={40} value={draft.location} onChange={(event)=>setDraft({...draft,location:event.target.value})} placeholder="例如 东门菜鸟"/></label></div><label><span>备注</span><textarea maxLength={120} value={draft.note} onChange={(event)=>setDraft({...draft,note:event.target.value})} placeholder="需要特别记住的事"/></label></div></details><div className="sheet-actions"><button type="button" className="secondary-button" onClick={()=>setSheet(null)}>取消</button><button type="submit" className="primary-button">{editingId?"保存修改":"加入待拿清单"}</button></div></form>:<div className="settings-content"><div className="privacy-note"><span>⌖</span><p><strong>你的快递数据不会上传</strong><small>更换手机或清理浏览器数据前，请先导出备份。</small></p></div>{installPrompt?<button className="settings-button" onClick={installApp}><span>▣</span><p><strong>添加到手机桌面</strong><small>像 App 一样打开，断网也能使用</small></p><b>›</b></button>:<div className="install-hint">安装方法：打开浏览器菜单，选择“添加到主屏幕”。</div>}<button className="settings-button" onClick={exportBackup}><span>↓</span><p><strong>导出备份</strong><small>保存 {parcels.length} 条记录到文件</small></p><b>›</b></button><label className="settings-button file-button"><span>↑</span><p><strong>导入备份</strong><small>用备份文件恢复记录</small></p><b>›</b><input type="file" accept="application/json,.json" onChange={importBackup}/></label><button className="settings-button danger-setting" onClick={()=>{ if (parcels.length&&window.confirm(`确定清空全部 ${parcels.length} 条记录吗？此操作无法恢复。`)) { setParcels([]); setSheet(null); showToast("全部本机记录已清空"); } }} disabled={!parcels.length}><span>×</span><p><strong>清空全部数据</strong><small>删除待拿和已拿记录</small></p></button></div>}
    </section></div>}
    {toast&&<div className="toast" role="status" aria-live="polite"><span>{toast.message}</span>{toast.undoId&&<button onClick={()=>undoPicked(toast.undoId!)}>撤销</button>}</div>}
  </main>;
}
