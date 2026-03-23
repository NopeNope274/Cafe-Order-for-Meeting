import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  db, rowsCol, archiveCol, presetsCol,
  doc, onSnapshot, setDoc, deleteDoc, serverTimestamp,
} from "./firebase.js";
import { query, orderBy } from "firebase/firestore";

// ── auth (LocalStorage만 — 비번은 기기별로 OK) ───────────────────────────────
const APP_PASSWORD = import.meta.env.VITE_APP_PASSWORD;
const LS_AUTH = "ocv3_auth";

let _id = Date.now();
const uid = () => String(++_id);

const menuList = (rows) => {
  const seen = new Set(), out = [];
  rows.forEach(r => { const m = r.menu?.trim(); if (m && m !== "없음" && !seen.has(m)) { seen.add(m); out.push(m); } });
  return out.sort((a, b) => a.localeCompare(b, "ko"));
};
const summary = (rows) => {
  const map = {};
  rows.forEach(r => { if (!r.active) return; const m = r.menu?.trim(); if (!m || m === "없음") return; map[m] = (map[m] || 0) + 1; });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
};

const PALETTE = ["#6c63ff","#48c6ef","#f0a050","#ff6090","#50e0a0","#f0d050","#c070ff","#60c0ff"];
const col = (i) => PALETTE[i % PALETTE.length];

// ── useFireCollection — Firestore 컬렉션 실시간 구독 ─────────────────────────
function useFireCollection(colRef, orderField = "order") {
  const [docs, setDocs] = useState([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const q = query(colRef, orderBy(orderField, "asc"));
    const unsub = onSnapshot(q, snap => {
      setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setReady(true);
    }, () => setReady(true));
    return unsub;
  }, []);
  return [docs, ready];
}

// ── useFireOnce — Firestore 컬렉션 1회만 읽기 (rows용) ───────────────────────
function useFireOnce(colRef, orderField = "order") {
  const [docs, setDocs] = useState([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const q = query(colRef, orderBy(orderField, "asc"));
    // 최초 1회만 구독 후 바로 해제
    const unsub = onSnapshot(q, snap => {
      setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setReady(true);
      unsub(); // 구독 해제 — 이후 로컬에서만 관리
    }, () => setReady(true));
    return () => {};
  }, []);
  return [docs, ready, setDocs];
}

// ── AutoInput ─────────────────────────────────────────────────────────────────
function AutoInput({ value, onChange, options, placeholder, style }) {
  const [open, setOpen]     = useState(false);
  const [q, setQ]           = useState(value);
  const [dropPos, setDropPos] = useState({ top:0, left:0, width:0 });
  const composing  = useRef(false);
  const localRef   = useRef(value);
  const inputRef   = useRef(null);
  const wrapRef    = useRef(null);

  // Firebase 외부 업데이트 수신 (조합 중엔 무시)
  useEffect(() => {
    if (!composing.current) { setQ(value); localRef.current = value; }
  }, [value]);

  // 드롭다운 위치 계산
  const updatePos = () => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setDropPos({ top: r.bottom + 4, left: r.left, width: Math.max(180, r.width) });
  };

  // 바깥 클릭 시 닫기
  useEffect(() => {
    const h = e => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // q 기준으로 options 필터 — 항상 최신 q 반영
  const filtered = useMemo(() => {
    if (!q.trim()) return options;
    return options.filter(o => o.toLowerCase().includes(q.toLowerCase()));
  }, [q, options]);

  const pick = v => { setQ(v); localRef.current = v; onChange(v); setOpen(false); };

  const handleChange = e => {
    const v = e.target.value;
    setQ(v);
    localRef.current = v;
    updatePos();
    setOpen(true);
    if (!composing.current) onChange(v);
  };

  const handleCompositionStart = () => { composing.current = true; };

  const handleCompositionEnd = e => {
    composing.current = false;
    const v = e.target.value;
    setQ(v);
    localRef.current = v;
    updatePos();
    setOpen(true);
    setTimeout(() => onChange(v), 0);
  };

  return (
    <div ref={wrapRef} style={{ position:"relative", flex:1 }}>
      <input ref={inputRef} value={q}
        onChange={handleChange}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onFocus={() => { updatePos(); setOpen(true); }}
        onBlur={() => { setTimeout(() => setOpen(false), 150); if (!composing.current) onChange(localRef.current); }}
        placeholder={placeholder} style={style} />
      {open && filtered.length > 0 && (
        <div style={{ position:"fixed", top:dropPos.top, left:dropPos.left, width:dropPos.width,
          background:"#1a1a2e", border:"1px solid #3d3d6a", borderRadius:10, zIndex:99999,
          maxHeight:200, overflowY:"auto", boxShadow:"0 8px 32px rgba(0,0,0,0.7)" }}>
          {filtered.map((o, i) => (
            <div key={i}
              onMouseDown={e => { e.preventDefault(); pick(o); }}
              style={{ padding:"10px 14px", fontSize:13, color:"#c8c8e8", cursor:"pointer", borderBottom:"1px solid #2d2d4a44" }}
              onMouseEnter={e => e.currentTarget.style.background="#2d2d4a"}
              onMouseLeave={e => e.currentTarget.style.background="transparent"}>{o}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ImeInput — 한글 조합 완료 후에만 Firebase 저장 ───────────────────────────
function ImeInput({ value, onCommit, placeholder, style }) {
  const [local, setLocal] = useState(value);
  const composing = useRef(false);
  const localRef = useRef(value);
  useEffect(() => { if (!composing.current) { setLocal(value); localRef.current = value; } }, [value]);
  return (
    <input
      value={local}
      onChange={e => { setLocal(e.target.value); localRef.current = e.target.value; if (!composing.current) onCommit(e.target.value); }}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={() => { composing.current = false; setTimeout(() => onCommit(localRef.current), 0); }}
      onBlur={() => { if (!composing.current) onCommit(localRef.current); }}
      placeholder={placeholder}
      style={style}
    />
  );
}
const isTouchDevice = () => window.matchMedia("(hover: none) and (pointer: coarse)").matches;

// ── SwipeRow ──────────────────────────────────────────────────────────────────
function SwipeRow({ row, idx, onUpdate, onDelete, onDragStart, onDragEnter, onDragEnd, isDragging, isOver, menuOptions }) {
  const startXRef = useRef(null); const startYRef = useRef(null);
  const swipedRef = useRef(false); const isTouch = useRef(isTouchDevice());
  const [offsetX, setOffsetX] = useState(0); const [revealed, setRevealed] = useState(false);
  const [swiping, setSwiping] = useState(false); const [hovered, setHovered] = useState(false);
  const THRESHOLD = 72;

  const onTouchStart = e => { startXRef.current=e.touches[0].clientX; startYRef.current=e.touches[0].clientY; swipedRef.current=false; setSwiping(false); };
  const onTouchMove  = e => {
    if (startXRef.current===null) return;
    const dx=e.touches[0].clientX-startXRef.current, dy=e.touches[0].clientY-startYRef.current;
    if (!swipedRef.current&&Math.abs(dy)>Math.abs(dx)) return;
    if (Math.abs(dx)>6){swipedRef.current=true;setSwiping(true);}
    if (!swipedRef.current) return;
    setOffsetX(Math.min(0,Math.max(-THRESHOLD-20,dx+(revealed?-THRESHOLD:0))));
  };
  const onTouchEnd = () => {
    if (!swipedRef.current) return;
    if (offsetX < -(THRESHOLD + 10)) {
      // 끝까지 스와이프 → 즉시 삭제
      onDelete(row.id);
    } else if (offsetX < -THRESHOLD / 2) {
      // 반 이상 스와이프 → 삭제 버튼 노출
      setOffsetX(-THRESHOLD); setRevealed(true);
    } else {
      // 조금만 스와이프 → 원위치
      setOffsetX(0); setRevealed(false);
    }
    setSwiping(false); startXRef.current=null;
  };
  const closeSwipe = () => {setOffsetX(0);setRevealed(false);};
  const dragHandleProps = {
    onPointerDown: e=>{e.currentTarget.parentElement.parentElement.setAttribute("draggable","true");},
    onPointerUp:   e=>{e.currentTarget.parentElement.parentElement.setAttribute("draggable","false");},
  };

  const borderCol = isOver?"rgba(108,99,255,0.6)":row.active?"rgba(108,99,255,0.15)":"rgba(255,255,255,0.04)";

  return (
    <div draggable={false}
      onDragStart={e=>{e.dataTransfer.effectAllowed="move";onDragStart(idx);}}
      onDragEnter={()=>onDragEnter(idx)} onDragEnd={onDragEnd} onDragOver={e=>e.preventDefault()}
      onMouseEnter={()=>{if(!isTouch.current)setHovered(true);}}
      onMouseLeave={()=>{if(!isTouch.current)setHovered(false);}}
      style={{ position:"relative", overflow:"hidden", borderRadius:12, marginBottom:6, userSelect:"none", opacity:isDragging?0.35:1, transition:"opacity .15s" }}>
      {/* 모바일 삭제 배경 — overflow:hidden 안에 있어야 카드 뒤에 숨겨짐 */}
      {isTouch.current&&(
        <div style={{
          position:"absolute", right:0, top:0, bottom:0, width:THRESHOLD,
          background:"linear-gradient(90deg,transparent,rgba(255,60,80,0.9))",
          display:"flex", alignItems:"center", justifyContent:"center",
          borderRadius:"0 12px 12px 0",
          opacity: revealed ? 1 : 0,
          transition:"opacity .2s",
          pointerEvents: revealed ? "auto" : "none",
        }}>
          <button
            onTouchEnd={e=>{e.stopPropagation();e.preventDefault();onDelete(row.id);}}
            onClick={e=>{e.stopPropagation();onDelete(row.id);}}
            style={{ background:"none", border:"none", color:"#fff", fontSize:13, fontWeight:700, fontFamily:"inherit", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:2, padding:"8px 12px" }}>
            <span style={{ fontSize:20 }}>🗑</span><span style={{ fontSize:10 }}>삭제</span>
          </button>
        </div>
      )}
      <div onTouchStart={isTouch.current?onTouchStart:undefined} onTouchMove={isTouch.current?onTouchMove:undefined}
        onTouchEnd={isTouch.current?onTouchEnd:undefined} onClick={revealed?closeSwipe:undefined}
        style={{ display:"grid", gridTemplateColumns:isTouch.current?"22px 38px 1fr 1fr":"22px 38px 1fr 1fr 28px",
          gap:8, alignItems:"center",
          background:isOver?"rgba(108,99,255,0.1)":row.active?"rgba(255,255,255,0.04)":"rgba(255,255,255,0.015)",
          border:`1px solid ${borderCol}`, borderRadius:12, padding:"10px 12px",
          opacity:row.active?1:0.5, transform:`translateX(${offsetX}px)`,
          transition:swiping?"none":"transform .25s ease, border-color .15s", willChange:"transform",
          position:"relative", zIndex:1,
        }}>
        <div {...dragHandleProps} style={{ display:"flex", flexDirection:"column", gap:3, alignItems:"center", justifyContent:"center", cursor:"grab", padding:"4px 2px", touchAction:"none" }}>
          {[0,1,2].map(i=><div key={i} style={{ width:14, height:2, borderRadius:2, background:"#3a3a6a" }}/>)}
        </div>
        <label className="toggle-wrap" style={{ touchAction:"none" }}>
          <input type="checkbox" checked={row.active} onChange={e=>onUpdate(row.id,{active:e.target.checked})}/>
          <span className="toggle-slider"/>
        </label>
        <ImeInput value={row.name} onCommit={v=>onUpdate(row.id,{name:v})} placeholder={`이름 ${idx+1}`}
          style={{ background:"transparent", border:"none", fontSize:14, fontWeight:600, color:row.active?"#e0e0ff":"#606080", fontFamily:"inherit", width:"100%", textDecoration:row.active?"none":"line-through", outline:"none" }}/>
        <AutoInput value={row.menu} onChange={v=>onUpdate(row.id,{menu:v})} options={menuOptions} placeholder="메뉴 입력/선택"
          style={{ background:"transparent", border:"none", fontSize:13, color:row.active?"#a0a0cc":"#505070", fontFamily:"inherit", width:"100%", textDecoration:row.active?"none":"line-through", outline:"none" }}/>
        {!isTouch.current&&(
          <button onClick={()=>onDelete(row.id)} style={{ opacity:hovered?1:0, background:"none", border:"none", color:"#ff6080", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center", transition:"opacity .15s", padding:0 }}>×</button>
        )}
      </div>
    </div>
  );
}

// ── PasswordGate ──────────────────────────────────────────────────────────────
function PasswordGate({ onUnlock }) {
  const [pw,setPw]=useState(""); const [shake,setShake]=useState(false);
  const [show,setShow]=useState(false); const [wrong,setWrong]=useState(false);
  const tryUnlock=()=>{
    if(pw===APP_PASSWORD){localStorage.setItem(LS_AUTH,"ok");onUnlock();}
    else{setShake(true);setWrong(true);setPw("");setTimeout(()=>setShake(false),500);}
  };
  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"linear-gradient(135deg,#0d0d1a,#12122a,#0d1a2a)", padding:24 }}>
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
        *{box-sizing:border-box;margin:0;padding:0;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif}
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-10px)}40%{transform:translateX(10px)}60%{transform:translateX(-8px)}80%{transform:translateX(8px)}}
        .gate{animation:fadeUp .4s ease} .shake{animation:shake .45s ease!important}
        .ubtn{transition:all .15s;cursor:pointer;border:none} .ubtn:hover{filter:brightness(1.15);transform:translateY(-1px)}
      `}</style>
      <div className={`gate${shake?" shake":""}`} style={{ width:"100%", maxWidth:360, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(108,99,255,0.2)", borderRadius:24, padding:"40px 32px", boxShadow:"0 24px 64px rgba(0,0,0,0.4)" }}>
        <div style={{ width:56, height:56, borderRadius:16, margin:"0 auto 24px", background:"linear-gradient(135deg,rgba(108,99,255,0.2),rgba(72,198,239,0.15))", border:"1px solid rgba(108,99,255,0.3)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:24 }}>🔐</div>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ fontSize:11, letterSpacing:"2px", textTransform:"uppercase", color:"#6c63ff", fontWeight:700, marginBottom:8 }}>LIVE ORDER BOARD</div>
          <h1 style={{ fontSize:20, fontWeight:800, color:"#fff", marginBottom:6 }}>메뉴 취합 시스템</h1>
          <p style={{ fontSize:13, color:"#5050a0" }}>접근 코드를 입력해주세요</p>
        </div>
        <div style={{ position:"relative", marginBottom:8 }}>
          <input type={show?"text":"password"} value={pw} onChange={e=>{setPw(e.target.value);setWrong(false);}}
            onKeyDown={e=>e.key==="Enter"&&tryUnlock()} placeholder="비밀번호" autoFocus
            style={{ width:"100%", padding:"14px 48px 14px 16px", background:"rgba(255,255,255,0.06)", border:`1px solid ${wrong?"rgba(255,96,128,0.5)":"rgba(108,99,255,0.25)"}`, borderRadius:12, fontSize:15, color:"#fff", outline:"none", letterSpacing:"2px", fontFamily:"inherit" }}/>
          <button onClick={()=>setShow(s=>!s)} style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#5050a0", cursor:"pointer", fontSize:16 }}>{show?"🙈":"👁️"}</button>
        </div>
        <div style={{ height:20, marginBottom:8, textAlign:"center" }}>{wrong&&<p style={{ fontSize:12, color:"#ff6080" }}>비밀번호가 틀렸어요</p>}</div>
        <button className="ubtn" onClick={tryUnlock} style={{ width:"100%", padding:"14px", borderRadius:12, background:"linear-gradient(135deg,#6c63ff,#4a9eff)", color:"#fff", fontSize:15, fontWeight:700, fontFamily:"inherit" }}>입장하기</button>
      </div>
    </div>
  );
}

// ── Preset Modal ──────────────────────────────────────────────────────────────
function PresetModal({ presets, currentRows, onSave, onLoad, onDelete, onClose }) {
  const [mode,setMode]=useState("load"); const [newName,setNewName]=useState(""); const [confirm,setConfirm]=useState(null);
  const handleSave=()=>{ const name=newName.trim(); if(!name||!currentRows.length)return; onSave(name); setNewName(""); setMode("load"); };
  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{ position:"fixed", inset:0, background:"rgba(5,5,20,0.75)", zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"center", backdropFilter:"blur(4px)" }}>
      <div style={{ width:"100%", maxWidth:640, background:"linear-gradient(160deg,#12122a,#0d1a2a)", borderRadius:"20px 20px 0 0", padding:"24px 20px 44px", maxHeight:"80vh", overflowY:"auto", boxShadow:"0 -8px 40px rgba(0,0,0,0.5)", animation:"slideUp .3s ease" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <h2 style={{ fontSize:17, fontWeight:800, color:"#fff" }}>👥 멤버 프리셋</h2>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#5050a0", fontSize:22, cursor:"pointer" }}>×</button>
        </div>
        <div style={{ display:"flex", gap:4, background:"rgba(255,255,255,0.04)", borderRadius:10, padding:3, marginBottom:20 }}>
          {[["load","📂 불러오기"],["save","💾 현재 상태 저장"]].map(([k,l])=>(
            <button key={k} onClick={()=>setMode(k)} style={{ flex:1, padding:"8px", borderRadius:8, border:"none", fontSize:12, fontWeight:700, fontFamily:"inherit", background:mode===k?"linear-gradient(135deg,#6c63ff,#4a9eff)":"transparent", color:mode===k?"#fff":"#6060a0", cursor:"pointer" }}>{l}</button>
          ))}
        </div>
        {mode==="save"&&(
          <div>
            <p style={{ fontSize:12, color:"#5060a0", marginBottom:12 }}>현재 멤버 {currentRows.length}명의 이름과 참여 상태를 저장해요.<br/><span style={{ color:"#404060" }}>메뉴 내용은 저장되지 않아요.</span></p>
            <div style={{ background:"rgba(255,255,255,0.03)", borderRadius:12, padding:"12px 14px", marginBottom:14 }}>
              {currentRows.length===0?<div style={{ fontSize:12, color:"#404060", textAlign:"center" }}>현재 멤버가 없어요.</div>
                :currentRows.map(r=>(<div key={r.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize:12, color:r.active?"#6c63ff":"#404060" }}>{r.active?"●":"○"}</span>
                  <span style={{ fontSize:13, color:r.active?"#c8c8e8":"#606080", textDecoration:r.active?"none":"line-through" }}>{r.name||"(이름 없음)"}</span>
                  <span style={{ fontSize:11, color:"#404060", marginLeft:"auto" }}>{r.active?"참여":"제외"}</span>
                </div>))
              }
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSave()} placeholder="프리셋 이름 (예: 아침팀, 점심팀)"
                style={{ flex:1, padding:"12px 14px", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(108,99,255,0.25)", borderRadius:10, fontSize:13, color:"#fff", outline:"none", fontFamily:"inherit" }}/>
              <button onClick={handleSave} style={{ padding:"12px 18px", borderRadius:10, border:"none", background:newName.trim()&&currentRows.length>0?"linear-gradient(135deg,#6c63ff,#4a9eff)":"rgba(255,255,255,0.06)", color:newName.trim()&&currentRows.length>0?"#fff":"#404060", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>저장</button>
            </div>
          </div>
        )}
        {mode==="load"&&(
          presets.length===0
            ?<div style={{ textAlign:"center", padding:"40px 20px", color:"#404060" }}><div style={{ fontSize:32, marginBottom:12 }}>📭</div><div style={{ fontSize:13 }}>저장된 프리셋이 없어요</div></div>
            :presets.map(p=>(
              <div key={p.id} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(108,99,255,0.15)", borderRadius:14, padding:"14px 16px", marginBottom:8 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color:"#e0e0ff" }}>{p.name}</div>
                    <div style={{ fontSize:11, color:"#404060", marginTop:2 }}>{p.members?.filter(m=>m.active).length}명 참여 · {p.savedAt}</div>
                  </div>
                  {confirm===p.id
                    ?<div style={{ display:"flex", gap:6 }}>
                      <button onClick={()=>setConfirm(null)} style={{ padding:"5px 10px", borderRadius:8, border:"1px solid rgba(255,255,255,0.1)", background:"transparent", color:"#808099", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>취소</button>
                      <button onClick={()=>{onDelete(p.id);setConfirm(null);}} style={{ padding:"5px 10px", borderRadius:8, border:"none", background:"rgba(255,80,80,0.2)", color:"#ff8090", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>삭제</button>
                    </div>
                    :<button onClick={()=>setConfirm(p.id)} style={{ background:"none", border:"none", color:"#404060", fontSize:18, cursor:"pointer" }}>🗑</button>
                  }
                </div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:12 }}>
                  {p.members?.map((m,i)=>(<span key={i} style={{ fontSize:11, padding:"3px 10px", borderRadius:10, background:m.active?"rgba(108,99,255,0.15)":"rgba(255,255,255,0.04)", color:m.active?"#a09aff":"#505070", textDecoration:m.active?"none":"line-through" }}>{m.name}</span>))}
                </div>
                <button onClick={()=>{onLoad(p);onClose();}} style={{ width:"100%", padding:"10px", borderRadius:10, border:"none", background:"linear-gradient(135deg,rgba(108,99,255,0.3),rgba(72,198,239,0.2))", color:"#a09aff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>📂 이 프리셋으로 불러오기</button>
              </div>
            ))
        )}
      </div>
    </div>
  );
}

// ── Charts ────────────────────────────────────────────────────────────────────
function BarChart({ data, labelKey, valueKey, color="#6c63ff", height=180 }) {
  if (!data.length) return <div style={{ textAlign:"center", padding:40, color:"#404060", fontSize:13 }}>데이터가 없어요</div>;
  const max=Math.max(...data.map(d=>d[valueKey]),1);
  const bw=Math.max(24,Math.min(56,Math.floor(320/data.length)-8));
  return (
    <div style={{ overflowX:"auto", paddingBottom:4 }}>
      <div style={{ display:"flex", alignItems:"flex-end", gap:6, minWidth:data.length*(bw+6), padding:"0 4px" }}>
        {data.map((d,i)=>{
          const barH=Math.max(4,Math.round((d[valueKey]/max)*height));
          return (
            <div key={i} style={{ display:"flex", flexDirection:"column", alignItems:"center", flex:1, minWidth:bw }}>
              <div style={{ fontSize:11, color:"#a09aff", fontWeight:700, marginBottom:3 }}>{d[valueKey]}</div>
              <div style={{ width:"100%", height:barH, borderRadius:"6px 6px 2px 2px", background:`linear-gradient(180deg,${color}cc,${color}66)`, position:"relative", overflow:"hidden" }}>
                <div style={{ position:"absolute", inset:0, background:"linear-gradient(180deg,rgba(255,255,255,0.15),transparent)" }}/>
              </div>
              <div style={{ fontSize:10, color:"#5060a0", marginTop:4, textAlign:"center", lineHeight:1.3, maxWidth:bw, wordBreak:"keep-all" }}>{d[labelKey]}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function HBar({ label, value, max, color, rank }) {
  return (
    <div style={{ marginBottom:8 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
        <span style={{ fontSize:13, color:"#c8c8e8", display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ fontSize:10, color:rank===0?"#f0d050":rank===1?"#b0b0c0":rank===2?"#c08050":"#404060", fontWeight:800, minWidth:16 }}>#{rank+1}</span>{label}
        </span>
        <span style={{ fontSize:13, fontWeight:700, color }}>{value}회</span>
      </div>
      <div style={{ height:8, background:"rgba(255,255,255,0.05)", borderRadius:4, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${max?(value/max)*100:0}%`, background:`linear-gradient(90deg,${color},${color}88)`, borderRadius:4, transition:"width .5s ease" }}/>
      </div>
    </div>
  );
}

// ── Loading screen ────────────────────────────────────────────────────────────
function Loading() {
  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"linear-gradient(135deg,#0d0d1a,#12122a,#0d1a2a)", gap:16 }}>
      <div style={{ fontSize:36 }}>☕</div>
      <div style={{ fontSize:13, color:"#5050a0" }}>데이터 불러오는 중...</div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [authed, setAuthed] = useState(() => localStorage.getItem(LS_AUTH) === "ok");

  // rows: 최초 1회만 로드 후 로컬 관리 (실시간 동기화 없음)
  const [rows,    rowsReady,    setRows]    = useFireOnce(rowsCol,    "order");
  // archive, presets: 실시간 구독
  const [archive, archiveReady]             = useFireCollection(archiveCol, "order");
  const [presets, presetsReady]             = useFireCollection(presetsCol, "order");

  const [view,       setView]       = useState("order");
  const [toast,      setToast]      = useState(null);
  const [showPreset, setShowPreset] = useState(false);
  const [statMode,   setStatMode]   = useState("monthly");
  const [statYear,   setStatYear]   = useState(() => new Date().getFullYear());
  const [selPerson,  setSelPerson]  = useState(null);

  // drag
  const dragIdx = useRef(null); const overIdx = useRef(null);
  const [draggingIdx, setDraggingIdx] = useState(null);
  const [overIndex,   setOverIndex]   = useState(null);

  const toastRef = useRef(null);
  const showToast = msg => { setToast(msg); clearTimeout(toastRef.current); toastRef.current=setTimeout(()=>setToast(null),2400); };
  const logout    = () => { localStorage.removeItem(LS_AUTH); setAuthed(false); };

  // 자동완성: 아카이브에 저장된 모든 메뉴 + 현재 rows 메뉴 합산
  const opts = useMemo(() => {
    const seen = new Set();
    const out = [];
    // 아카이브 메뉴 (과거 주문 이력)
    archive.forEach(e => e.orders?.forEach(o => {
      const m = o.menu?.trim();
      if (m && !seen.has(m)) { seen.add(m); out.push(m); }
    }));
    // 현재 rows 메뉴 (지금 입력 중인 것도 포함)
    rows.forEach(r => {
      const m = r.menu?.trim();
      if (m && m !== "없음" && !seen.has(m)) { seen.add(m); out.push(m); }
    });
    return out.sort((a, b) => a.localeCompare(b, "ko"));
  }, [archive, rows]);
  const summ        = summary(rows);
  const activeCount = rows.filter(r=>r.active).length;
  const totalOrdered= rows.filter(r=>r.active&&r.menu?.trim()&&r.menu!=="없음").length;

  // ── rows CRUD — 로컬 state만 (Firebase 저장은 확정/프리셋 시에만) ─────────
  const updateRow = useCallback((id, patch) => {
    setRows(prev => prev.map(r => r.id===id ? {...r,...patch} : r));
  }, [setRows]);

  const addRow = () => {
    setRows(prev => [...prev, { id:uid(), name:"", menu:"", active:true, order:Date.now() }]);
  };

  const deleteRow = id => {
    setRows(prev => prev.filter(r => r.id !== id));
    showToast("삭제됐어요 🗑");
  };

  const resetRows = () => {
    if (!window.confirm("현재 주문을 초기화할까요?\n(프리셋·아카이브는 유지됩니다)")) return;
    setRows([]);
    showToast("초기화 완료!");
  };

  // ── 드래그 정렬 — 로컬만 ────────────────────────────────────────────────
  const handleDragStart = useCallback(idx => { dragIdx.current=idx; setDraggingIdx(idx); }, []);
  const handleDragEnter = useCallback(idx => { overIdx.current=idx; setOverIndex(idx); }, []);
  const handleDragEnd   = useCallback(() => {
    const from=dragIdx.current, to=overIdx.current;
    if (from!==null&&to!==null&&from!==to) {
      setRows(prev => {
        const next=[...prev];
        const [moved]=next.splice(from,1);
        next.splice(to,0,moved);
        return next;
      });
    }
    dragIdx.current=null; overIdx.current=null;
    setDraggingIdx(null); setOverIndex(null);
  }, [setRows]);

  // ── 프리셋 ───────────────────────────────────────────────────────────────
  const savePreset = async name => {
    const id = uid();
    await setDoc(doc(db,"presets",id), { id, name, savedAt:new Date().toISOString().slice(0,10), members:rows.map(r=>({name:r.name,active:r.active})), order:Date.now() });
    showToast(`💾 '${name}' 프리셋 저장 완료!`);
  };

  const loadPreset = preset => {
    setRows(preset.members.map((m,i) => ({ id:uid(), name:m.name, menu:"", active:m.active, order:i })));
    showToast(`📂 '${preset.name}' 불러왔어요!`);
  };

  const deletePreset = async id => {
    await deleteDoc(doc(db,"presets",id));
    showToast("프리셋 삭제됐어요");
  };

  // ── 주문 확정 ─────────────────────────────────────────────────────────────
  const confirmOrder = async () => {
    const active=rows.filter(r=>r.active&&r.menu?.trim()&&r.menu!=="없음");
    if (!active.length){showToast("확정할 주문이 없어요 😅");return;}
    if (!window.confirm(`총 ${active.length}건을 오늘 날짜로 확정할까요?`))return;
    const now=new Date();
    const id=uid();
    await setDoc(doc(db,"archive",id), {
      id, date:now.toISOString().slice(0,10),
      year:now.getFullYear(), month:now.getMonth()+1,
      orders:active.map(r=>({name:r.name,menu:r.menu.trim()})),
      order: Date.now(),
    });
    showToast(`✅ ${active.length}건 저장됐어요!`);
  };

  const copyText = () => {
    const lines=["📋 주문 요약",`총 ${activeCount}명 참여 / ${totalOrdered}명 주문`,""];
    summ.forEach(([m,c])=>lines.push(`${m}  ×${c}`));
    navigator.clipboard.writeText(lines.join("\n")).then(()=>showToast("클립보드에 복사됐어요! 📋"));
  };

  // ── 통계 ─────────────────────────────────────────────────────────────────
  const years=useMemo(()=>[...new Set(archive.map(e=>e.year))].sort((a,b)=>b-a),[archive]);
  const monthlyData=useMemo(()=>{const map={};archive.filter(e=>e.year===statYear).forEach(e=>{map[e.month]=(map[e.month]||0)+e.orders.length;});return Array.from({length:12},(_,i)=>({label:`${i+1}월`,value:map[i+1]||0}));},[archive,statYear]);
  const yearlyData=useMemo(()=>{const map={};archive.forEach(e=>{map[e.year]=(map[e.year]||0)+e.orders.length;});return Object.entries(map).sort((a,b)=>a[0]-b[0]).map(([y,v])=>({label:`${y}년`,value:v}));},[archive]);
  const allMenuStats=useMemo(()=>{const map={};archive.forEach(e=>e.orders.forEach(o=>{map[o.menu]=(map[o.menu]||0)+1;}));return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,10);},[archive]);
  const persons=useMemo(()=>[...new Set(archive.flatMap(e=>e.orders.map(o=>o.name)))].sort((a,b)=>a.localeCompare(b,"ko")),[archive]);
  const personStats=useMemo(()=>{if(!selPerson)return[];const map={};archive.forEach(e=>e.orders.filter(o=>o.name===selPerson).forEach(o=>{map[o.menu]=(map[o.menu]||0)+1;}));return Object.entries(map).sort((a,b)=>b[1]-a[1]);},[archive,selPerson]);
  const personMonthly=useMemo(()=>{if(!selPerson)return[];const map={};archive.forEach(e=>{if(e.year!==statYear)return;const cnt=e.orders.filter(o=>o.name===selPerson).length;if(cnt)map[e.month]=(map[e.month]||0)+cnt;});return Array.from({length:12},(_,i)=>({label:`${i+1}월`,value:map[i+1]||0}));},[archive,selPerson,statYear]);

  if (!authed) return <PasswordGate onUnlock={()=>setAuthed(true)}/>;
  if (!rowsReady||!archiveReady||!presetsReady) return <Loading/>;

  const TABS=[["order","📝 입력"],["summary","📊 요약"],["stats","📈 통계"]];

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0d0d1a 0%,#12122a 50%,#0d1a2a 100%)", fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif", color:"#e0e0f0" }}>
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px;height:4px} ::-webkit-scrollbar-thumb{background:#3d3d6a;border-radius:4px}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
        @keyframes toastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
        .toggle-wrap{position:relative;width:38px;height:22px;flex-shrink:0}
        .toggle-wrap input{opacity:0;width:0;height:0}
        .toggle-slider{position:absolute;inset:0;border-radius:22px;cursor:pointer;background:#2d2d4a;transition:all .2s}
        .toggle-slider::after{content:'';position:absolute;left:3px;top:3px;width:16px;height:16px;border-radius:50%;background:#555577;transition:all .2s}
        .toggle-wrap input:checked+.toggle-slider{background:linear-gradient(135deg,#6c63ff,#48c6ef)}
        .toggle-wrap input:checked+.toggle-slider::after{transform:translateX(16px);background:#fff}
        input{outline:none} button{cursor:pointer}
        .abtn{transition:all .15s} .abtn:hover{filter:brightness(1.15);transform:translateY(-1px)} .abtn:active{transform:translateY(0)}
        .tbtn{transition:all .18s} .chip{transition:all .15s} .chip:hover{filter:brightness(1.2)}
      `}</style>

      <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:0, overflow:"hidden" }}>
        <div style={{ position:"absolute", top:-120, right:-80, width:400, height:400, borderRadius:"50%", background:"radial-gradient(circle,rgba(108,99,255,0.08),transparent 70%)" }}/>
        <div style={{ position:"absolute", bottom:-100, left:-60, width:350, height:350, borderRadius:"50%", background:"radial-gradient(circle,rgba(72,198,239,0.06),transparent 70%)" }}/>
      </div>

      {toast&&<div style={{ position:"fixed", top:20, right:20, zIndex:9999, background:"#2d2d4a", border:"1px solid #6c63ff44", borderRadius:12, padding:"10px 18px", fontSize:13, color:"#c8c8ff", boxShadow:"0 4px 24px rgba(0,0,0,0.4)", animation:"toastIn .25s ease" }}>{toast}</div>}
      {showPreset&&<PresetModal presets={presets} currentRows={rows} onSave={savePreset} onLoad={loadPreset} onDelete={deletePreset} onClose={()=>setShowPreset(false)}/>}

      <div style={{ maxWidth:640, margin:"0 auto", padding:"0 16px 100px", position:"relative", zIndex:1 }}>
        <header style={{ padding:"28px 0 16px" }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
            <div>
              <div style={{ fontSize:11, letterSpacing:"2px", textTransform:"uppercase", color:"#6c63ff", fontWeight:700, marginBottom:4 }}>LIVE ORDER BOARD</div>
              <h1 style={{ fontSize:24, fontWeight:800, color:"#fff", letterSpacing:"-0.5px" }}>메뉴 취합 시스템</h1>
            </div>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
              <div style={{ display:"flex", gap:6 }}>
                {[[activeCount,"참여","#a09aff","rgba(108,99,255,0.12)","rgba(108,99,255,0.2)"],[totalOrdered,"주문","#48c6ef","rgba(72,198,239,0.1)","rgba(72,198,239,0.18)"],[archive.length,"기록","#f0a050","rgba(240,160,80,0.1)","rgba(240,160,80,0.18)"]].map(([v,l,c,bg,b])=>(
                  <div key={l} style={{ textAlign:"center", background:bg, border:`1px solid ${b}`, borderRadius:10, padding:"6px 12px" }}>
                    <div style={{ fontSize:18, fontWeight:800, color:c }}>{v}</div>
                    <div style={{ fontSize:9, color:"#7070a0" }}>{l}</div>
                  </div>
                ))}
              </div>
              <button onClick={logout} style={{ background:"none", border:"none", color:"#303050", fontSize:11, fontFamily:"inherit" }}>🔓 로그아웃</button>
            </div>
          </div>
          <div style={{ display:"flex", gap:4, marginTop:16, background:"rgba(255,255,255,0.04)", borderRadius:12, padding:4 }}>
            {TABS.map(([k,l])=>(
              <button key={k} className="tbtn" onClick={()=>setView(k)} style={{ flex:1, padding:"9px 4px", borderRadius:9, border:"none", fontSize:12, fontWeight:700, fontFamily:"inherit", background:view===k?"linear-gradient(135deg,#6c63ff,#4a9eff)":"transparent", color:view===k?"#fff":"#7070a0", boxShadow:view===k?"0 2px 12px rgba(108,99,255,0.3)":"none" }}>{l}</button>
            ))}
          </div>
        </header>

        {/* ══ 주문 입력 ══ */}
        {view==="order"&&(
          <div style={{ animation:"fadeIn .3s ease" }}>
            <div style={{ display:"flex", gap:8, marginBottom:16, alignItems:"center" }}>
              <button className="abtn" onClick={()=>setShowPreset(true)}
                style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 14px", borderRadius:10, border:"1px solid rgba(108,99,255,0.25)", background:"rgba(108,99,255,0.08)", color:"#8080cc", fontSize:12, fontWeight:700, fontFamily:"inherit", flexShrink:0 }}>
                👥 프리셋{presets.length>0&&<span style={{ background:"rgba(108,99,255,0.3)", color:"#a09aff", borderRadius:10, padding:"1px 7px", fontSize:10 }}>{presets.length}</span>}
              </button>
              {presets.length>0&&(
                <div style={{ display:"flex", gap:5, overflowX:"auto", flex:1 }}>
                  {presets.slice(0,3).map(p=>(
                    <button key={p.id} className="chip" onClick={()=>loadPreset(p)} style={{ flexShrink:0, padding:"7px 12px", borderRadius:10, border:"1px solid rgba(255,255,255,0.08)", background:"rgba(255,255,255,0.04)", color:"#7070a0", fontSize:11, fontWeight:600, fontFamily:"inherit", whiteSpace:"nowrap" }}>↩ {p.name}</button>
                  ))}
                </div>
              )}
            </div>
            {rows.length>0&&(
              <div style={{ display:"grid", gridTemplateColumns:"22px 38px 1fr 1fr", gap:8, padding:"0 12px 8px", fontSize:10, letterSpacing:"1px", textTransform:"uppercase", color:"#5050a0" }}>
                <div/><div>ON</div><div>이름</div><div>메뉴</div>
              </div>
            )}
            {rows.length>1&&<div style={{ fontSize:11, color:"#3a3a6a", textAlign:"center", marginBottom:8 }}>☰ 길게 눌러 드래그 정렬 &nbsp;|&nbsp; ← 스와이프해서 삭제</div>}
            {rows.length===0
              ?<div style={{ textAlign:"center", padding:"40px 20px", color:"#303050", lineHeight:2 }}>
                <div style={{ fontSize:36, marginBottom:12 }}>📋</div>
                <div style={{ fontSize:14 }}>아직 참여자가 없어요</div>
                <div style={{ fontSize:12, color:"#252540" }}>프리셋을 불러오거나 직접 추가해보세요</div>
              </div>
              :<div>
                {rows.map((row,idx)=>(
                  <SwipeRow key={row.id} row={row} idx={idx} onUpdate={updateRow} onDelete={deleteRow}
                    onDragStart={handleDragStart} onDragEnter={handleDragEnter} onDragEnd={handleDragEnd}
                    isDragging={draggingIdx===idx} isOver={overIndex===idx&&draggingIdx!==idx} menuOptions={opts}/>
                ))}
              </div>
            }
            <button className="abtn" onClick={addRow} style={{ width:"100%", marginTop:4, padding:"12px", background:"rgba(108,99,255,0.08)", border:"1.5px dashed rgba(108,99,255,0.3)", borderRadius:12, color:"#6c63ff", fontSize:14, fontWeight:700, fontFamily:"inherit" }}>+ 참여자 추가</button>
            <div style={{ display:"flex", gap:8, marginTop:10 }}>
              <button className="abtn" onClick={resetRows} style={{ flex:1, padding:"11px", borderRadius:10, border:"1px solid rgba(255,80,80,0.2)", background:"rgba(255,80,80,0.06)", color:"#ff8090", fontSize:12, fontWeight:600, fontFamily:"inherit" }}>↺ 초기화</button>
              <button className="abtn" onClick={()=>setView("summary")} style={{ flex:2, padding:"11px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#6c63ff,#4a9eff)", color:"#fff", fontSize:12, fontWeight:700, fontFamily:"inherit", boxShadow:"0 4px 16px rgba(108,99,255,0.3)" }}>📊 요약 보기 →</button>
            </div>
            <button className="abtn" onClick={confirmOrder} style={{ width:"100%", marginTop:8, padding:"15px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#f0a050,#e07030)", color:"#fff", fontSize:15, fontWeight:800, fontFamily:"inherit", boxShadow:"0 4px 20px rgba(240,140,60,0.35)" }}>✅ 주문 확정 & 아카이브 저장</button>
          </div>
        )}

        {/* ══ 요약 ══ */}
        {view==="summary"&&(
          <div style={{ animation:"fadeIn .3s ease" }}>
            <div style={{ background:"linear-gradient(135deg,rgba(108,99,255,0.12),rgba(72,198,239,0.08))", border:"1px solid rgba(108,99,255,0.2)", borderRadius:16, padding:"16px 20px", marginBottom:14 }}>
              <div style={{ fontSize:11, color:"#7070b0", marginBottom:10 }}>현재 주문 현황</div>
              <div style={{ display:"flex", gap:20 }}>
                {[["전체",rows.length,"#808099"],["참여",activeCount,"#a09aff"],["주문",totalOrdered,"#48c6ef"],["패스",activeCount-totalOrdered,"#f0a050"],["제외",rows.length-activeCount,"#606080"]].map(([l,v,c])=>(
                  <div key={l}><div style={{ fontSize:20, fontWeight:800, color:c }}>{v}</div><div style={{ fontSize:10, color:"#5050a0" }}>{l}</div></div>
                ))}
              </div>
            </div>
            <div style={{ fontSize:10, letterSpacing:"1.5px", textTransform:"uppercase", color:"#5050a0", marginBottom:10 }}>메뉴별 집계</div>
            {summ.length===0?<div style={{ textAlign:"center", padding:"32px", color:"#404060", fontSize:13 }}>아직 주문이 없어요</div>
              :<div style={{ display:"flex", flexDirection:"column", gap:7, marginBottom:14 }}>
                {summ.map(([menu,cnt],i)=>(
                  <div key={menu} style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:12, padding:"11px 16px", position:"relative", overflow:"hidden" }}>
                    <div style={{ position:"absolute", left:0, top:0, bottom:0, width:`${Math.round((cnt/summ[0][1])*100)}%`, background:i===0?"linear-gradient(90deg,rgba(108,99,255,0.15),transparent)":"linear-gradient(90deg,rgba(255,255,255,0.03),transparent)" }}/>
                    <div style={{ position:"relative", display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ fontSize:11, fontWeight:800, color:i===0?"#6c63ff":"#404060", width:20, textAlign:"center" }}>#{i+1}</div>
                      <div style={{ flex:1, fontSize:13, fontWeight:600, color:"#c8c8e8" }}>{menu}</div>
                      <div style={{ fontSize:18, fontWeight:800, color:i===0?"#a09aff":"#6060a0" }}>{cnt}</div>
                      <div style={{ fontSize:11, color:"#404060", width:28 }}>명</div>
                    </div>
                  </div>
                ))}
              </div>
            }
            <button className="abtn" onClick={copyText} style={{ width:"100%", padding:"14px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#6c63ff,#48c6ef)", color:"#fff", fontSize:14, fontWeight:700, fontFamily:"inherit", boxShadow:"0 4px 20px rgba(108,99,255,0.3)", marginBottom:8 }}>📋 요약 텍스트 복사</button>
            <button className="abtn" onClick={confirmOrder} style={{ width:"100%", padding:"14px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#f0a050,#e07030)", color:"#fff", fontSize:14, fontWeight:700, fontFamily:"inherit", boxShadow:"0 4px 20px rgba(240,140,60,0.3)" }}>✅ 주문 확정 & 아카이브 저장</button>
            <div style={{ fontSize:10, letterSpacing:"1.5px", textTransform:"uppercase", color:"#5050a0", margin:"18px 0 8px" }}>개인별 목록</div>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {rows.map(r=>(<div key={r.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 14px", borderRadius:10, background:r.active?"rgba(255,255,255,0.03)":"transparent", opacity:r.active?1:0.35 }}>
                <span style={{ fontSize:13, fontWeight:600, color:"#c0c0e0", textDecoration:r.active?"none":"line-through", minWidth:72 }}>{r.name||"—"}</span>
                <span style={{ fontSize:12, color:r.menu&&r.menu!=="없음"?"#8080cc":"#404060", textAlign:"right", maxWidth:"60%" }}>{r.menu||"—"}</span>
              </div>))}
            </div>
          </div>
        )}

        {/* ══ 통계 ══ */}
        {view==="stats"&&(
          <div style={{ animation:"fadeIn .3s ease" }}>
            {archive.length===0
              ?<div style={{ textAlign:"center", padding:"60px 20px", color:"#404060", lineHeight:2 }}>
                <div style={{ fontSize:48, marginBottom:16 }}>📭</div>
                <div style={{ fontSize:15, color:"#5050a0" }}>아직 아카이브 데이터가 없어요</div>
                <div style={{ fontSize:12, color:"#353550" }}>주문 확정 버튼을 눌러 기록을 쌓아보세요!</div>
              </div>
              :<>
                <div style={{ display:"flex", gap:6, marginBottom:20 }}>
                  {[["monthly","📅 월별"],["yearly","📆 연별"],["person","🧑 사람별"],["log","📋 기록"]].map(([k,l])=>(
                    <button key={k} className="chip" onClick={()=>setStatMode(k)} style={{ padding:"7px 10px", borderRadius:20, border:"none", fontSize:11, fontWeight:700, fontFamily:"inherit", background:statMode===k?"linear-gradient(135deg,#6c63ff,#4a9eff)":"rgba(255,255,255,0.06)", color:statMode===k?"#fff":"#6060a0", boxShadow:statMode===k?"0 2px 12px rgba(108,99,255,0.3)":"none" }}>{l}</button>
                  ))}
                </div>
                {(statMode==="monthly"||statMode==="person")&&years.length>0&&(
                  <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
                    {years.map(y=>(<button key={y} className="chip" onClick={()=>setStatYear(y)} style={{ padding:"5px 14px", borderRadius:16, border:"none", fontSize:12, fontWeight:600, fontFamily:"inherit", background:statYear===y?"rgba(108,99,255,0.25)":"rgba(255,255,255,0.05)", color:statYear===y?"#a09aff":"#5060a0" }}>{y}년</button>))}
                  </div>
                )}
                {statMode==="monthly"&&(
                  <div>
                    <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:16, padding:"20px 16px", marginBottom:16 }}>
                      <div style={{ fontSize:11, color:"#5060a0", letterSpacing:"1px", marginBottom:16 }}>{statYear}년 월별 주문 건수</div>
                      <BarChart data={monthlyData} labelKey="label" valueKey="value" color="#6c63ff"/>
                    </div>
                    <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:16, padding:"20px 16px" }}>
                      <div style={{ fontSize:11, color:"#5060a0", letterSpacing:"1px", marginBottom:14 }}>{statYear}년 인기 메뉴 TOP 10</div>
                      {(()=>{const map={};archive.filter(e=>e.year===statYear).forEach(e=>e.orders.forEach(o=>{map[o.menu]=(map[o.menu]||0)+1;}));const list=Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,10);const mx=list[0]?.[1]||1;return list.length===0?<div style={{ textAlign:"center", padding:20, color:"#404060", fontSize:13 }}>데이터가 없어요</div>:list.map(([menu,cnt],i)=><HBar key={menu} label={menu} value={cnt} max={mx} color={col(i)} rank={i}/>);})()}
                    </div>
                  </div>
                )}
                {statMode==="yearly"&&(
                  <div>
                    <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:16, padding:"20px 16px", marginBottom:16 }}>
                      <div style={{ fontSize:11, color:"#5060a0", letterSpacing:"1px", marginBottom:16 }}>연별 총 주문 건수</div>
                      <BarChart data={yearlyData} labelKey="label" valueKey="value" color="#48c6ef"/>
                    </div>
                    <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:16, padding:"20px 16px" }}>
                      <div style={{ fontSize:11, color:"#5060a0", letterSpacing:"1px", marginBottom:14 }}>전체 기간 인기 메뉴 TOP 10</div>
                      {allMenuStats.length===0?<div style={{ textAlign:"center", padding:20, color:"#404060", fontSize:13 }}>데이터가 없어요</div>:allMenuStats.map(([menu,cnt],i)=><HBar key={menu} label={menu} value={cnt} max={allMenuStats[0][1]} color={col(i)} rank={i}/>)}
                    </div>
                  </div>
                )}
                {statMode==="person"&&(
                  <div>
                    <div style={{ marginBottom:16 }}>
                      <div style={{ fontSize:11, color:"#5060a0", letterSpacing:"1px", marginBottom:10 }}>멤버 선택</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                        {persons.map((p,i)=>(<button key={p} className="chip" onClick={()=>setSelPerson(p===selPerson?null:p)} style={{ padding:"6px 14px", borderRadius:20, border:"none", fontSize:13, fontWeight:600, fontFamily:"inherit", background:selPerson===p?col(i)+"44":"rgba(255,255,255,0.06)", color:selPerson===p?col(i):"#6060a0", boxShadow:selPerson===p?`0 2px 12px ${col(i)}44`:"none" }}>{p}</button>))}
                      </div>
                    </div>
                    {selPerson
                      ?<>
                        <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:16, padding:"20px 16px", marginBottom:14 }}>
                          <div style={{ fontSize:11, color:"#5060a0", letterSpacing:"1px", marginBottom:16 }}>{selPerson} — {statYear}년 월별 주문</div>
                          <BarChart data={personMonthly} labelKey="label" valueKey="value" color="#f0a050"/>
                        </div>
                        <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:16, padding:"20px 16px" }}>
                          <div style={{ fontSize:11, color:"#5060a0", letterSpacing:"1px", marginBottom:14 }}>{selPerson}의 최애 메뉴 (전체 기간)</div>
                          {personStats.length===0?<div style={{ textAlign:"center", padding:20, color:"#404060", fontSize:13 }}>주문 기록이 없어요</div>:personStats.map(([menu,cnt],i)=><HBar key={menu} label={menu} value={cnt} max={personStats[0][1]} color={col(i)} rank={i}/>)}
                        </div>
                      </>
                      :<div style={{ textAlign:"center", padding:"40px 20px", color:"#404060", fontSize:13 }}>위에서 멤버를 선택해보세요 👆</div>
                    }
                  </div>
                )}
                {/* ── 아카이브 기록 탭 (독립) ── */}
                {statMode==="log"&&(
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {[...archive].sort((a,b)=>b.order-a.order).map(entry=>(
                      <div key={entry.id} style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:12, padding:"14px 16px" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                          <span style={{ fontSize:13, color:"#6c63ff", fontWeight:700 }}>{entry.date}</span>
                          <span style={{ fontSize:11, color:"#5060a0", background:"rgba(108,99,255,0.1)", padding:"2px 8px", borderRadius:8 }}>{entry.orders.length}건</span>
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                          {entry.orders.map((o,i)=>(
                            <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}>
                              <span style={{ color:"#8080a0", minWidth:60 }}>{o.name}</span>
                              <span style={{ color:"#c8c8e8", textAlign:"right" }}>{o.menu}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            }
          </div>
        )}
      </div>
    </div>
  );
}
