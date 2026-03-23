import { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ── env / storage ────────────────────────────────────────────────────────────
const APP_PASSWORD = import.meta.env.VITE_APP_PASSWORD;
const LS_ROWS    = "ocv3_rows";
const LS_AUTH    = "ocv3_auth";
const LS_ARCHIVE = "ocv3_archive";

const store  = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const load   = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; } };

let _id = Date.now();
const uid = () => String(++_id);

// ── data helpers ─────────────────────────────────────────────────────────────
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

// ── COLORS ───────────────────────────────────────────────────────────────────
const PALETTE = ["#6c63ff","#48c6ef","#f0a050","#ff6090","#50e0a0","#f0d050","#c070ff","#60c0ff"];
const col = (i) => PALETTE[i % PALETTE.length];

// ── AutoInput ────────────────────────────────────────────────────────────────
function AutoInput({ value, onChange, options, placeholder, style }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value);
  const ref = useRef(null);
  useEffect(() => setQ(value), [value]);
  const filtered = q.trim() ? options.filter(o => o.toLowerCase().includes(q.toLowerCase())) : options;
  const pick = v => { setQ(v); onChange(v); setOpen(false); };
  useEffect(() => {
    const h = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} style={{ position:"relative", flex:1 }}>
      <input value={q} onChange={e => { setQ(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} placeholder={placeholder} style={style} />
      {open && filtered.length > 0 && (
        <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, background:"#1a1a2e", border:"1px solid #2d2d4a", borderRadius:10, zIndex:999, maxHeight:180, overflowY:"auto", boxShadow:"0 8px 32px rgba(0,0,0,0.5)" }}>
          {filtered.map((o, i) => (
            <div key={i} onMouseDown={() => pick(o)}
              style={{ padding:"9px 14px", fontSize:13, color:"#c8c8e8", cursor:"pointer", borderBottom:"1px solid #2d2d4a22" }}
              onMouseEnter={e => e.currentTarget.style.background="#2d2d4a"}
              onMouseLeave={e => e.currentTarget.style.background="transparent"}>{o}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── PasswordGate ─────────────────────────────────────────────────────────────
function PasswordGate({ onUnlock }) {
  const [pw, setPw] = useState(""); const [shake, setShake] = useState(false);
  const [show, setShow] = useState(false); const [wrong, setWrong] = useState(false);
  const tryUnlock = () => {
    if (pw === APP_PASSWORD) { localStorage.setItem(LS_AUTH, "ok"); onUnlock(); }
    else { setShake(true); setWrong(true); setPw(""); setTimeout(() => setShake(false), 500); }
  };
  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"linear-gradient(135deg,#0d0d1a,#12122a,#0d1a2a)", padding:24 }}>
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
        *{box-sizing:border-box;margin:0;padding:0;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif}
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-10px)}40%{transform:translateX(10px)}60%{transform:translateX(-8px)}80%{transform:translateX(8px)}}
        .gate{animation:fadeUp .4s ease} .shake{animation:shake .45s ease!important}
        .ubtn{transition:all .15s;cursor:pointer;border:none} .ubtn:hover{filter:brightness(1.15);transform:translateY(-1px)} .ubtn:active{transform:translateY(0)}
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
            style={{ width:"100%", padding:"14px 48px 14px 16px", background:"rgba(255,255,255,0.06)", border:`1px solid ${wrong?"rgba(255,96,128,0.5)":"rgba(108,99,255,0.25)"}`, borderRadius:12, fontSize:15, color:"#fff", outline:"none", letterSpacing:"2px", fontFamily:"inherit" }} />
          <button onClick={()=>setShow(s=>!s)} style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#5050a0", cursor:"pointer", fontSize:16 }}>{show?"🙈":"👁️"}</button>
        </div>
        <div style={{ height:20, marginBottom:8, textAlign:"center" }}>{wrong&&<p style={{ fontSize:12, color:"#ff6080" }}>비밀번호가 틀렸어요</p>}</div>
        <button className="ubtn" onClick={tryUnlock} style={{ width:"100%", padding:"14px", borderRadius:12, background:"linear-gradient(135deg,#6c63ff,#4a9eff)", color:"#fff", fontSize:15, fontWeight:700, fontFamily:"inherit" }}>입장하기</button>
      </div>
    </div>
  );
}

// ── Bar Chart (pure SVG) ─────────────────────────────────────────────────────
function BarChart({ data, labelKey, valueKey, color = "#6c63ff", height = 180 }) {
  if (!data.length) return <div style={{ textAlign:"center", padding:40, color:"#404060", fontSize:13 }}>데이터가 없어요</div>;
  const max = Math.max(...data.map(d => d[valueKey]), 1);
  const bw = Math.max(24, Math.min(56, Math.floor(320 / data.length) - 8));
  return (
    <div style={{ overflowX:"auto", paddingBottom:4 }}>
      <div style={{ display:"flex", alignItems:"flex-end", gap:6, minWidth: data.length * (bw + 6), padding:"0 4px" }}>
        {data.map((d, i) => {
          const pct = d[valueKey] / max;
          const barH = Math.max(4, Math.round(pct * height));
          return (
            <div key={i} style={{ display:"flex", flexDirection:"column", alignItems:"center", flex:1, minWidth:bw }}>
              <div style={{ fontSize:11, color:"#a09aff", fontWeight:700, marginBottom:3 }}>{d[valueKey]}</div>
              <div style={{ width:"100%", height:barH, borderRadius:"6px 6px 2px 2px", background:`linear-gradient(180deg, ${color}cc, ${color}66)`, transition:"height 0.4s ease", position:"relative", overflow:"hidden" }}>
                <div style={{ position:"absolute", inset:0, background:"linear-gradient(180deg,rgba(255,255,255,0.15),transparent)", borderRadius:"6px 6px 0 0" }} />
              </div>
              <div style={{ fontSize:10, color:"#5060a0", marginTop:4, textAlign:"center", lineHeight:1.3, maxWidth:bw, wordBreak:"keep-all" }}>{d[labelKey]}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Horizontal Bar ────────────────────────────────────────────────────────────
function HBar({ label, value, max, color, rank }) {
  const pct = max ? (value / max) * 100 : 0;
  return (
    <div style={{ marginBottom:8 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
        <span style={{ fontSize:13, color:"#c8c8e8", display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ fontSize:10, color: rank===0?"#f0d050":rank===1?"#b0b0c0":rank===2?"#c08050":"#404060", fontWeight:800, minWidth:16 }}>#{rank+1}</span>
          {label}
        </span>
        <span style={{ fontSize:13, fontWeight:700, color }}>{value}회</span>
      </div>
      <div style={{ height:8, background:"rgba(255,255,255,0.05)", borderRadius:4, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${color},${color}88)`, borderRadius:4, transition:"width 0.5s ease" }} />
      </div>
    </div>
  );
}

// ── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [authed,  setAuthed]  = useState(() => localStorage.getItem(LS_AUTH) === "ok");
  const [rows,    setRows]    = useState(() => load(LS_ROWS, []));
  const [archive, setArchive] = useState(() => load(LS_ARCHIVE, []));
  const [view,    setView]    = useState("order");   // order | summary | stats
  const [toast,   setToast]   = useState(null);
  const [statMode, setStatMode] = useState("monthly");  // monthly | yearly | person
  const [statYear, setStatYear] = useState(() => new Date().getFullYear());
  const [selPerson, setSelPerson] = useState(null);
  const toastRef = useRef(null);

  useEffect(() => store(LS_ROWS, rows),       [rows]);
  useEffect(() => store(LS_ARCHIVE, archive), [archive]);

  const showToast = msg => { setToast(msg); clearTimeout(toastRef.current); toastRef.current = setTimeout(() => setToast(null), 2400); };
  const logout    = () => { localStorage.removeItem(LS_AUTH); setAuthed(false); };

  const opts         = menuList(rows);
  const summ         = summary(rows);
  const activeCount  = rows.filter(r => r.active).length;
  const totalOrdered = rows.filter(r => r.active && r.menu?.trim() && r.menu !== "없음").length;

  const updateRow = useCallback((id, patch) => setRows(prev => prev.map(r => r.id===id ? {...r,...patch} : r)), []);
  const addRow    = () => setRows(prev => [...prev, { id:uid(), name:"", menu:"", active:true }]);
  const deleteRow = id => { setRows(prev => prev.filter(r => r.id !== id)); showToast("삭제됐어요"); };
  const resetRows = () => { if (window.confirm("현재 주문을 초기화할까요?\n(아카이브 기록은 유지됩니다)")) { setRows([]); showToast("초기화 완료!"); }};

  // ── 주문 확정 & 아카이빙 ──────────────────────────────────────────────────
  const confirmOrder = () => {
    const active = rows.filter(r => r.active && r.menu?.trim() && r.menu !== "없음");
    if (!active.length) { showToast("확정할 주문이 없어요 😅"); return; }
    if (!window.confirm(`총 ${active.length}건을 오늘 날짜로 확정할까요?`)) return;

    const now = new Date();
    const entry = {
      id:    uid(),
      date:  now.toISOString().slice(0, 10),
      year:  now.getFullYear(),
      month: now.getMonth() + 1,
      orders: active.map(r => ({ name: r.name, menu: r.menu.trim() })),
    };
    setArchive(prev => [entry, ...prev]);
    showToast(`✅ ${active.length}건 아카이브에 저장됐어요!`);
  };

  const copyText = () => {
    const lines = ["📋 주문 요약", `총 ${activeCount}명 참여 / ${totalOrdered}명 주문`, ""];
    summ.forEach(([m, c]) => lines.push(`${m}  ×${c}`));
    navigator.clipboard.writeText(lines.join("\n")).then(() => showToast("클립보드에 복사됐어요! 📋"));
  };

  // ── 통계 계산 ─────────────────────────────────────────────────────────────
  const years = useMemo(() => [...new Set(archive.map(e => e.year))].sort((a,b)=>b-a), [archive]);

  const monthlyData = useMemo(() => {
    const map = {};
    archive.filter(e => e.year === statYear).forEach(e => {
      map[e.month] = (map[e.month] || 0) + e.orders.length;
    });
    return Array.from({length:12}, (_, i) => ({ label:`${i+1}월`, value: map[i+1] || 0 }));
  }, [archive, statYear]);

  const yearlyData = useMemo(() => {
    const map = {};
    archive.forEach(e => { map[e.year] = (map[e.year] || 0) + e.orders.length; });
    return Object.entries(map).sort((a,b)=>a[0]-b[0]).map(([y,v]) => ({ label:`${y}년`, value:v }));
  }, [archive]);

  const allMenuStats = useMemo(() => {
    const map = {};
    archive.forEach(e => e.orders.forEach(o => { map[o.menu] = (map[o.menu]||0)+1; }));
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,10);
  }, [archive]);

  const persons = useMemo(() => [...new Set(archive.flatMap(e => e.orders.map(o => o.name)))].sort((a,b)=>a.localeCompare(b,"ko")), [archive]);

  const personStats = useMemo(() => {
    if (!selPerson) return [];
    const map = {};
    archive.forEach(e => e.orders.filter(o => o.name === selPerson).forEach(o => { map[o.menu] = (map[o.menu]||0)+1; }));
    return Object.entries(map).sort((a,b)=>b[1]-a[1]);
  }, [archive, selPerson]);

  const personMonthly = useMemo(() => {
    if (!selPerson) return [];
    const map = {};
    archive.forEach(e => {
      if (e.year !== statYear) return;
      const cnt = e.orders.filter(o => o.name === selPerson).length;
      if (cnt) map[e.month] = (map[e.month]||0) + cnt;
    });
    return Array.from({length:12}, (_,i) => ({ label:`${i+1}월`, value: map[i+1]||0 }));
  }, [archive, selPerson, statYear]);

  if (!authed) return <PasswordGate onUnlock={() => setAuthed(true)} />;

  const TABS = [["order","📝 입력"],["summary","📊 요약"],["stats","📈 통계"]];

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0d0d1a 0%,#12122a 50%,#0d1a2a 100%)", fontFamily:"'Pretendard','Apple SD Gothic Neo',sans-serif", color:"#e0e0f0" }}>
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px;height:4px} ::-webkit-scrollbar-thumb{background:#3d3d6a;border-radius:4px}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes toastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
        .row-card:hover .del-btn{opacity:1!important}
        .toggle-wrap{position:relative;width:38px;height:22px;flex-shrink:0}
        .toggle-wrap input{opacity:0;width:0;height:0}
        .toggle-slider{position:absolute;inset:0;border-radius:22px;cursor:pointer;background:#2d2d4a;transition:all .2s}
        .toggle-slider::after{content:'';position:absolute;left:3px;top:3px;width:16px;height:16px;border-radius:50%;background:#555577;transition:all .2s}
        .toggle-wrap input:checked+.toggle-slider{background:linear-gradient(135deg,#6c63ff,#48c6ef)}
        .toggle-wrap input:checked+.toggle-slider::after{transform:translateX(16px);background:#fff}
        input{outline:none} button{cursor:pointer}
        .abtn{transition:all .15s} .abtn:hover{filter:brightness(1.15);transform:translateY(-1px)} .abtn:active{transform:translateY(0)}
        .tbtn{transition:all .18s}
        .chip{transition:all .15s} .chip:hover{filter:brightness(1.2)}
      `}</style>

      {/* 배경 글로우 */}
      <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:0, overflow:"hidden" }}>
        <div style={{ position:"absolute", top:-120, right:-80, width:400, height:400, borderRadius:"50%", background:"radial-gradient(circle,rgba(108,99,255,0.08),transparent 70%)" }} />
        <div style={{ position:"absolute", bottom:-100, left:-60, width:350, height:350, borderRadius:"50%", background:"radial-gradient(circle,rgba(72,198,239,0.06),transparent 70%)" }} />
      </div>

      {/* 토스트 */}
      {toast && <div style={{ position:"fixed", top:20, right:20, zIndex:9999, background:"#2d2d4a", border:"1px solid #6c63ff44", borderRadius:12, padding:"10px 18px", fontSize:13, color:"#c8c8ff", boxShadow:"0 4px 24px rgba(0,0,0,0.4)", animation:"toastIn .25s ease" }}>{toast}</div>}

      <div style={{ maxWidth:640, margin:"0 auto", padding:"0 16px 100px", position:"relative", zIndex:1 }}>

        {/* 헤더 */}
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

          {/* 탭 */}
          <div style={{ display:"flex", gap:4, marginTop:16, background:"rgba(255,255,255,0.04)", borderRadius:12, padding:4 }}>
            {TABS.map(([k,l])=>(
              <button key={k} className="tbtn" onClick={()=>setView(k)} style={{ flex:1, padding:"9px 4px", borderRadius:9, border:"none", fontSize:12, fontWeight:700, fontFamily:"inherit", background:view===k?"linear-gradient(135deg,#6c63ff,#4a9eff)":"transparent", color:view===k?"#fff":"#7070a0", boxShadow:view===k?"0 2px 12px rgba(108,99,255,0.3)":"none" }}>{l}</button>
            ))}
          </div>
        </header>

        {/* ══ 주문 입력 ══════════════════════════════════════════════════════ */}
        {view === "order" && (
          <div style={{ animation:"fadeIn .3s ease" }}>
            {rows.length > 0 && (
              <div style={{ display:"grid", gridTemplateColumns:"38px 1fr 1fr 28px", gap:8, padding:"0 4px 8px", fontSize:10, letterSpacing:"1px", textTransform:"uppercase", color:"#5050a0" }}>
                <div>ON</div><div>이름</div><div>메뉴</div><div></div>
              </div>
            )}
            {rows.length === 0
              ? <div style={{ textAlign:"center", padding:"50px 20px", color:"#303050", lineHeight:2 }}>
                  <div style={{ fontSize:36, marginBottom:12 }}>📋</div>
                  <div style={{ fontSize:14 }}>아직 참여자가 없어요</div>
                  <div style={{ fontSize:12, color:"#252540" }}>아래 버튼으로 추가해보세요</div>
                </div>
              : <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {rows.map((row, idx) => (
                    <div key={row.id} className="row-card" style={{ display:"grid", gridTemplateColumns:"38px 1fr 1fr 28px", gap:8, alignItems:"center", background:row.active?"rgba(255,255,255,0.04)":"rgba(255,255,255,0.015)", border:row.active?"1px solid rgba(108,99,255,0.15)":"1px solid rgba(255,255,255,0.04)", borderRadius:12, padding:"10px 12px", opacity:row.active?1:0.45, transition:"opacity .2s" }}>
                      <label className="toggle-wrap"><input type="checkbox" checked={row.active} onChange={e=>updateRow(row.id,{active:e.target.checked})}/><span className="toggle-slider"/></label>
                      <input value={row.name} onChange={e=>updateRow(row.id,{name:e.target.value})} placeholder={`이름 ${idx+1}`}
                        style={{ background:"transparent", border:"none", fontSize:14, fontWeight:600, color:row.active?"#e0e0ff":"#606080", fontFamily:"inherit", width:"100%", textDecoration:row.active?"none":"line-through" }}/>
                      <AutoInput value={row.menu} onChange={v=>updateRow(row.id,{menu:v})} options={opts} placeholder="메뉴 입력 또는 선택"
                        style={{ background:"transparent", border:"none", fontSize:13, color:row.active?"#a0a0cc":"#505070", fontFamily:"inherit", width:"100%", textDecoration:row.active?"none":"line-through" }}/>
                      <button className="del-btn" onClick={()=>deleteRow(row.id)} style={{ opacity:0, background:"none", border:"none", color:"#ff6080", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center", transition:"opacity .15s" }}>×</button>
                    </div>
                  ))}
                </div>
            }

            <button className="abtn" onClick={addRow} style={{ width:"100%", marginTop:10, padding:"12px", background:"rgba(108,99,255,0.08)", border:"1.5px dashed rgba(108,99,255,0.3)", borderRadius:12, color:"#6c63ff", fontSize:14, fontWeight:700, fontFamily:"inherit" }}>
              + 참여자 추가
            </button>

            <div style={{ display:"flex", gap:8, marginTop:10 }}>
              <button className="abtn" onClick={resetRows} style={{ flex:1, padding:"11px", borderRadius:10, border:"1px solid rgba(255,80,80,0.2)", background:"rgba(255,80,80,0.06)", color:"#ff8090", fontSize:12, fontWeight:600, fontFamily:"inherit" }}>↺ 초기화</button>
              <button className="abtn" onClick={()=>setView("summary")} style={{ flex:2, padding:"11px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#6c63ff,#4a9eff)", color:"#fff", fontSize:12, fontWeight:700, fontFamily:"inherit", boxShadow:"0 4px 16px rgba(108,99,255,0.3)" }}>📊 요약 보기 →</button>
            </div>

            {/* 주문 확정 버튼 */}
            <button className="abtn" onClick={confirmOrder} style={{ width:"100%", marginTop:8, padding:"15px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#f0a050,#e07030)", color:"#fff", fontSize:15, fontWeight:800, fontFamily:"inherit", boxShadow:"0 4px 20px rgba(240,140,60,0.35)", letterSpacing:"0.3px" }}>
              ✅ 주문 확정 & 아카이브 저장
            </button>
          </div>
        )}

        {/* ══ 요약 ══════════════════════════════════════════════════════════ */}
        {view === "summary" && (
          <div style={{ animation:"fadeIn .3s ease" }}>
            <div style={{ background:"linear-gradient(135deg,rgba(108,99,255,0.12),rgba(72,198,239,0.08))", border:"1px solid rgba(108,99,255,0.2)", borderRadius:16, padding:"16px 20px", marginBottom:14 }}>
              <div style={{ fontSize:11, color:"#7070b0", marginBottom:10 }}>현재 주문 현황</div>
              <div style={{ display:"flex", gap:20 }}>
                {[["전체",rows.length,"#808099"],["참여",activeCount,"#a09aff"],["주문",totalOrdered,"#48c6ef"],["패스",activeCount-totalOrdered,"#f0a050"],["제외",rows.length-activeCount,"#606080"]].map(([l,v,c])=>(
                  <div key={l}><div style={{ fontSize:20, fontWeight:800, color:c }}>{v}</div><div style={{ fontSize:10, color:"#5050a0" }}>{l}</div></div>
                ))}
              </div>
            </div>
            <div style={{ fontSize:10, letterSpacing:"1.5px", textTransform:"uppercase", color:"#5050a0", marginBottom:10 }}>메뉴별 집계 (활성 주문)</div>
            {summ.length === 0
              ? <div style={{ textAlign:"center", padding:"32px", color:"#404060", fontSize:13 }}>아직 주문이 없어요</div>
              : <div style={{ display:"flex", flexDirection:"column", gap:7, marginBottom:14 }}>
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
            <button className="abtn" onClick={copyText} style={{ width:"100%", padding:"14px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#6c63ff,#48c6ef)", color:"#fff", fontSize:14, fontWeight:700, fontFamily:"inherit", boxShadow:"0 4px 20px rgba(108,99,255,0.3)", marginBottom:8 }}>
              📋 요약 텍스트 복사
            </button>
            <button className="abtn" onClick={confirmOrder} style={{ width:"100%", padding:"14px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#f0a050,#e07030)", color:"#fff", fontSize:14, fontWeight:700, fontFamily:"inherit", boxShadow:"0 4px 20px rgba(240,140,60,0.3)" }}>
              ✅ 주문 확정 & 아카이브 저장
            </button>

            {/* 개인별 목록 */}
            <div style={{ fontSize:10, letterSpacing:"1.5px", textTransform:"uppercase", color:"#5050a0", margin:"18px 0 8px" }}>개인별 목록</div>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {rows.map(r=>(
                <div key={r.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 14px", borderRadius:10, background:r.active?"rgba(255,255,255,0.03)":"transparent", opacity:r.active?1:0.35 }}>
                  <span style={{ fontSize:13, fontWeight:600, color:"#c0c0e0", textDecoration:r.active?"none":"line-through", minWidth:72 }}>{r.name||"—"}</span>
                  <span style={{ fontSize:12, color:r.menu&&r.menu!=="없음"?"#8080cc":"#404060", textAlign:"right", maxWidth:"60%" }}>{r.menu||"—"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ 통계 ══════════════════════════════════════════════════════════ */}
        {view === "stats" && (
          <div style={{ animation:"fadeIn .3s ease" }}>

            {archive.length === 0 ? (
              <div style={{ textAlign:"center", padding:"60px 20px", color:"#404060", lineHeight:2 }}>
                <div style={{ fontSize:48, marginBottom:16 }}>📭</div>
                <div style={{ fontSize:15, color:"#5050a0" }}>아직 아카이브 데이터가 없어요</div>
                <div style={{ fontSize:12, color:"#353550" }}>주문 확정 버튼을 눌러 기록을 쌓아보세요!</div>
              </div>
            ) : (
              <>
                {/* 서브탭 */}
                <div style={{ display:"flex", gap:6, marginBottom:20 }}>
                  {[["monthly","📅 월별"],["yearly","📆 연별"],["person","🧑 사람별"]].map(([k,l])=>(
                    <button key={k} className="chip" onClick={()=>setStatMode(k)} style={{ padding:"7px 14px", borderRadius:20, border:"none", fontSize:12, fontWeight:700, fontFamily:"inherit", background:statMode===k?"linear-gradient(135deg,#6c63ff,#4a9eff)":"rgba(255,255,255,0.06)", color:statMode===k?"#fff":"#6060a0", boxShadow:statMode===k?"0 2px 12px rgba(108,99,255,0.3)":"none" }}>{l}</button>
                  ))}
                </div>

                {/* 연도 선택 (월별/사람별 공통) */}
                {(statMode === "monthly" || statMode === "person") && years.length > 0 && (
                  <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
                    {years.map(y=>(
                      <button key={y} className="chip" onClick={()=>setStatYear(y)} style={{ padding:"5px 14px", borderRadius:16, border:"none", fontSize:12, fontWeight:600, fontFamily:"inherit", background:statYear===y?"rgba(108,99,255,0.25)":"rgba(255,255,255,0.05)", color:statYear===y?"#a09aff":"#5060a0" }}>{y}년</button>
                    ))}
                  </div>
                )}

                {/* 월별 */}
                {statMode === "monthly" && (
                  <div>
                    <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:16, padding:"20px 16px", marginBottom:16 }}>
                      <div style={{ fontSize:11, color:"#5060a0", letterSpacing:"1px", marginBottom:16 }}>{statYear}년 월별 주문 건수</div>
                      <BarChart data={monthlyData} labelKey="label" valueKey="value" color="#6c63ff" />
                    </div>
                    {/* 해당 연도 메뉴 TOP */}
                    <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:16, padding:"20px 16px" }}>
                      <div style={{ fontSize:11, color:"#5060a0", letterSpacing:"1px", marginBottom:14 }}>{statYear}년 인기 메뉴 TOP 10</div>
                      {(() => {
                        const map = {};
                        archive.filter(e=>e.year===statYear).forEach(e=>e.orders.forEach(o=>{map[o.menu]=(map[o.menu]||0)+1;}));
                        const list = Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,10);
                        const max = list[0]?.[1] || 1;
                        return list.length === 0
                          ? <div style={{ textAlign:"center", padding:20, color:"#404060", fontSize:13 }}>데이터가 없어요</div>
                          : list.map(([menu,cnt],i)=><HBar key={menu} label={menu} value={cnt} max={max} color={col(i)} rank={i}/>);
                      })()}
                    </div>
                  </div>
                )}

                {/* 연별 */}
                {statMode === "yearly" && (
                  <div>
                    <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:16, padding:"20px 16px", marginBottom:16 }}>
                      <div style={{ fontSize:11, color:"#5060a0", letterSpacing:"1px", marginBottom:16 }}>연별 총 주문 건수</div>
                      <BarChart data={yearlyData} labelKey="label" valueKey="value" color="#48c6ef" />
                    </div>
                    <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:16, padding:"20px 16px" }}>
                      <div style={{ fontSize:11, color:"#5060a0", letterSpacing:"1px", marginBottom:14 }}>전체 기간 인기 메뉴 TOP 10</div>
                      {allMenuStats.length === 0
                        ? <div style={{ textAlign:"center", padding:20, color:"#404060", fontSize:13 }}>데이터가 없어요</div>
                        : allMenuStats.map(([menu,cnt],i)=><HBar key={menu} label={menu} value={cnt} max={allMenuStats[0][1]} color={col(i)} rank={i}/>)
                      }
                    </div>
                  </div>
                )}

                {/* 사람별 */}
                {statMode === "person" && (
                  <div>
                    {/* 사람 선택 */}
                    <div style={{ marginBottom:16 }}>
                      <div style={{ fontSize:11, color:"#5060a0", letterSpacing:"1px", marginBottom:10 }}>멤버 선택</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                        {persons.map((p,i)=>(
                          <button key={p} className="chip" onClick={()=>setSelPerson(p===selPerson?null:p)} style={{ padding:"6px 14px", borderRadius:20, border:"none", fontSize:13, fontWeight:600, fontFamily:"inherit", background:selPerson===p?col(i)+"44":"rgba(255,255,255,0.06)", color:selPerson===p?col(i):"#6060a0", boxShadow:selPerson===p?`0 2px 12px ${col(i)}44`:"none" }}>{p}</button>
                        ))}
                      </div>
                    </div>

                    {selPerson ? (
                      <>
                        <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:16, padding:"20px 16px", marginBottom:14 }}>
                          <div style={{ fontSize:11, color:"#5060a0", letterSpacing:"1px", marginBottom:16 }}>{selPerson} — {statYear}년 월별 주문</div>
                          <BarChart data={personMonthly} labelKey="label" valueKey="value" color="#f0a050" />
                        </div>
                        <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:16, padding:"20px 16px" }}>
                          <div style={{ fontSize:11, color:"#5060a0", letterSpacing:"1px", marginBottom:14 }}>{selPerson}의 최애 메뉴 (전체 기간)</div>
                          {personStats.length === 0
                            ? <div style={{ textAlign:"center", padding:20, color:"#404060", fontSize:13 }}>주문 기록이 없어요</div>
                            : personStats.map(([menu,cnt],i)=><HBar key={menu} label={menu} value={cnt} max={personStats[0][1]} color={col(i)} rank={i}/>)
                          }
                        </div>
                      </>
                    ) : (
                      <div style={{ textAlign:"center", padding:"40px 20px", color:"#404060", fontSize:13 }}>
                        위에서 멤버를 선택해보세요 👆
                      </div>
                    )}
                  </div>
                )}

                {/* 아카이브 로그 */}
                <div style={{ marginTop:24 }}>
                  <div style={{ fontSize:11, color:"#5060a0", letterSpacing:"1px", marginBottom:10 }}>아카이브 기록</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {archive.slice(0,20).map(entry=>(
                      <div key={entry.id} style={{ background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.05)", borderRadius:12, padding:"12px 16px" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                          <span style={{ fontSize:12, color:"#6c63ff", fontWeight:700 }}>{entry.date}</span>
                          <span style={{ fontSize:11, color:"#5060a0" }}>{entry.orders.length}건</span>
                        </div>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                          {entry.orders.map((o,i)=>(
                            <span key={i} style={{ fontSize:11, padding:"3px 9px", borderRadius:10, background:"rgba(108,99,255,0.1)", color:"#8080cc" }}>
                              {o.name} — {o.menu}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                    {archive.length > 20 && <div style={{ textAlign:"center", fontSize:12, color:"#404060" }}>외 {archive.length-20}건 더</div>}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
