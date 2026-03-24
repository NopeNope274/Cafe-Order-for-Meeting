import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  db, archiveCol, presetsCol, menuHistoryCol,
  doc, onSnapshot, setDoc, deleteDoc, query, orderBy,
} from "./firebase.js";

// ── 상수 및 헬퍼 ──────────────────────────────────────────────────────────────
const APP_PASSWORD = import.meta.env.VITE_APP_PASSWORD;
const LS_AUTH = "oc_auth";
const LS_ROWS = "oc_rows";

const saveRows = (rows) => { try { localStorage.setItem(LS_ROWS, JSON.stringify(rows)); } catch {} };
const loadRows = () => { try { const r = localStorage.getItem(LS_ROWS); return r ? JSON.parse(r) : []; } catch { return []; } };

let _id = Date.now();
const uid = () => String(++_id);

const PALETTE = ["#6c63ff","#48c6ef","#f0a050","#ff6090","#50e0a0","#f0d050","#c070ff","#60c0ff"];
const col = (i) => PALETTE[i % PALETTE.length];
const isTouch = () => window.matchMedia("(hover: none) and (pointer: coarse)").matches;

const getSummary = (rows) => {
  const map = {};
  rows.forEach(r => {
    if (!r.active) return;
    const m = r.menu?.trim();
    if (!m || m === "없음") return;
    map[m] = (map[m] || 0) + 1;
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
};

// ── 커스텀 훅: Firebase 구독 ──────────────────────────────────────────────────
function useFireCol(col, orderField = "order") {
  const [docs,  setDocs]  = useState([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const q = query(col, orderBy(orderField, "asc"));
    const unsub = onSnapshot(q,
      snap => { setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setReady(true); },
      ()   => setReady(true)
    );
    return unsub;
  }, []);
  return [docs, ready];
}

function useFireColNoOrder(col) {
  const [docs,  setDocs]  = useState([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const unsub = onSnapshot(col,
      snap => { setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setReady(true); },
      err  => { console.error("🔥 구독 에러:", err.code, err.message); setReady(true); }
    );
    return unsub;
  }, []);
  return [docs, ready];
}

const saveMenuHistory = (menu) => {
  const m = menu?.trim();
  if (!m || m === "없음") return;
  const key = m.replace(/[\s\/\\\.#\[\]*?]/g, "_").slice(0, 100);
  setDoc(doc(db, "menuHistory", key), { name: m, order: m }, { merge: true });
};

// ── MenuInput — 16px 줌 방지 + 실시간 필터 + 지우기 X ────────────────────────
function MenuInput({ value, onChange, options, onDeleteHistory, placeholder, rowStyle }) {
  const [local, setLocal] = useState(value);
  const [open,  setOpen]  = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => { setLocal(value); }, [value]);

  useEffect(() => {
    const close = e => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, []);

  // ㄸ만 쳐도 딸기바나나 나오게 실시간 필터링
  const filteredOptions = useMemo(() => {
    const v = local.trim().toLowerCase();
    if (!v) return options;
    return options.filter(o => o.toLowerCase().includes(v));
  }, [local, options]);

  const commit = (v) => {
    const trimmed = v.trim();
    onChange(trimmed);
    if (trimmed) saveMenuHistory(trimmed);
    setOpen(false);
  };

  const pick = v => { setLocal(v); commit(v); };

  const handleKeyDown = e => { if (e.key === "Enter") { commit(local); e.target.blur(); } };
  const handleConfirm = e => { e.preventDefault(); e.stopPropagation(); commit(local); };
  const toggleDrop = e => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o); };

  // 모바일 확대 방지 위해 16px 고정 (CSS에서 scale로 크기만 조절)
  const baseInputStyle = {
    ...rowStyle,
    fontSize: "16px", // 줌 방지 마법의 숫자
    paddingRight: "24px", // X 버튼 공간
  };

  return (
    <div ref={wrapRef} style={{ display: "flex", alignItems: "center", flex: 1, gap: 2, position: "relative" }}>
      <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center" }}>
        <input
          value={local}
          onChange={e => { setLocal(e.target.value); setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={baseInputStyle}
        />
        {/* 지우기 X 버튼 */}
        {local && (
          <span 
            onMouseDown={e => { e.preventDefault(); setLocal(""); onChange(""); }}
            style={{ position: "absolute", right: 6, color: "#606080", cursor: "pointer", fontSize: 14 }}>✕</span>
        )}
      </div>

      <button onMouseDown={handleConfirm} onTouchEnd={handleConfirm} style={{ flexShrink: 0, background: "none", border: "none", color: local.trim() ? "#48c6ef" : "#2a2a4a", fontSize: 16, cursor: "pointer", padding: "2px 4px" }}>✓</button>
      <button onClick={toggleDrop} style={{ flexShrink: 0, background: "none", border: "none", color: open ? "#6c63ff" : "#3a3a6a", fontSize: 12, cursor: "pointer", padding: "2px 4px", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s" }}>▼</button>

      {open && (
        <div style={{ position: "absolute", top: "100%", right: 0, minWidth: "200px", background: "#13132a", border: "1px solid #3d3d6a", borderRadius: 12, zIndex: 9999, maxHeight: 200, overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.8)" }}>
          {filteredOptions.length === 0 ? (
            <div style={{ padding: 12, fontSize: 12, color: "#606080" }}>검색 결과 없음</div>
          ) : (
            filteredOptions.map((o, i) => (
              <div key={i} style={{ padding: "10px 14px", fontSize: 14, color: "#c8c8e8", borderBottom: "1px solid #2d2d4a33", display: "flex", alignItems: "center" }}
                   onMouseDown={e => { e.preventDefault(); pick(o); }}>
                <span style={{ flex: 1 }}>{o}</span>
                <span onMouseDown={e => { e.preventDefault(); e.stopPropagation(); const docId = o.replace(/[\s\/\\\.#\[\]*?]/g, "_").slice(0, 100); onDeleteHistory?.(docId); }}
                      style={{ color: "#ff5060", fontSize: 12, padding: "4px" }}>✕</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── SwipeRow — 🔄 아이콘 PC 노출 및 버그 수정 ─────────────────────────────
function SwipeRow({ row, idx, onUpdate, onDelete, onDragStart, onDragEnter, onDragEnd, isDragging, isOver, menuOptions, onDeleteHistory }) {
  const touch = useRef(isTouch());
  const [offsetX, setOffsetX] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [swiping, setSwiping] = useState(false);
  const [showSub, setShowSub] = useState(!!row.substitute);
  const startX = useRef(null);

  const onTouchStart = e => { startX.current = e.touches[0].clientX; setSwiping(false); };
  const onTouchMove = e => {
    if (startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    if (Math.abs(dx) > 6) setSwiping(true);
    setOffsetX(Math.min(0, Math.max(-100, dx + (revealed ? -76 : 0))));
  };
  const onTouchEnd = () => {
    if (offsetX < -80) { onDelete(row.id); }
    else if (offsetX < -40) { setOffsetX(-76); setRevealed(true); }
    else { setOffsetX(0); setRevealed(false); }
    setSwiping(false); startX.current = null;
  };

  return (
    <div style={{ position: "relative", marginBottom: 8, userSelect: "none" }}>
      <div 
        onTouchStart={touch.current ? onTouchStart : undefined}
        onTouchMove={touch.current ? onTouchMove : undefined}
        onTouchEnd={touch.current ? onTouchEnd : undefined}
        style={{
          display: "grid",
          gridTemplateColumns: "24px 38px 1.2fr 1.5fr 32px 24px", // PC/Mobile 공통 그리드 조정
          gap: 6, alignItems: "center", padding: "12px", background: row.active ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)",
          borderRadius: showSub ? "12px 12px 0 0" : "12px", border: `1px solid ${isOver ? "#6c63ff" : "transparent"}`,
          transform: `translateX(${offsetX}px)`, transition: swiping ? "none" : "transform .2s ease"
        }}>
        <div style={{ cursor: "grab", color: "#3a3a6a" }}>☰</div>
        <label className="toggle-wrap">
          <input type="checkbox" checked={row.active} onChange={e => onUpdate(row.id, { active: e.target.checked })} />
          <span className="toggle-slider" />
        </label>
        <input value={row.name} onChange={e => onUpdate(row.id, { name: e.target.value })} style={{ background: "transparent", border: "none", color: "#fff", fontSize: "16px", width: "100%" }} />
        <MenuInput value={row.menu} onChange={v => onUpdate(row.id, { menu: v })} options={menuOptions} onDeleteHistory={onDeleteHistory} rowStyle={{ background: "transparent", border: "none", color: "#a0a0cc" }} />
        <button onClick={() => setShowSub(s => !s)} style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", opacity: showSub ? 1 : 0.4 }}>🔄</button>
        <button onClick={() => onDelete(row.id)} style={{ background: "none", border: "none", color: "#ff6080", fontSize: 20, cursor: "pointer" }}>×</button>
      </div>

      {showSub && (
        <div style={{ display: "grid", gridTemplateColumns: "24px 38px 1.2fr 1.5fr 32px 24px", gap: 6, padding: "8px 12px", background: "rgba(72,198,239,0.05)", borderRadius: "0 0 12px 12px", border: "1px solid rgba(72,198,239,0.2)", borderTop: "none" }}>
          <div /><div style={{ textAlign: "center", color: "#48c6ef" }}>↪</div>
          <div style={{ fontSize: 12, color: "#48c6ef" }}>대체음료</div>
          <MenuInput value={row.substitute || ""} onChange={v => onUpdate(row.id, { substitute: v })} options={menuOptions} onDeleteHistory={onDeleteHistory} rowStyle={{ background: "transparent", border: "none", color: "#70c8d8" }} />
          <div /><div />
        </div>
      )}
    </div>
  );
}

// ── 나머지 컴포넌트 (PasswordGate, PresetModal 등 요약) ──────────────────────
// (여기에 PasswordGate, PresetModal, BarChart, HBar 등 기존 코드가 들어갑니다. 공간상 핵심 App 컴포넌트로 바로 갑니다.)

function PasswordGate({ onUnlock }) {
  const [pw, setPw] = useState("");
  const tryUnlock = () => { if (pw === APP_PASSWORD) { localStorage.setItem(LS_AUTH, "ok"); onUnlock(); } else { alert("틀렸어 요셉아!"); } };
  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0d0d1a" }}>
      <input type="password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && tryUnlock()} placeholder="비번" style={{ padding: 12, borderRadius: 8 }} />
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(() => localStorage.getItem(LS_AUTH) === "ok");
  const [rows, setRows] = useState(loadRows);
  useEffect(() => saveRows(rows), [rows]);

  const [archive, archiveReady] = useFireCol(archiveCol, "order");
  const [presets, presetsReady] = useFireCol(presetsCol, "order");
  const [menuHistory, menuHistoryReady] = useFireColNoOrder(menuHistoryCol);
  const [view, setView] = useState("order");

  const menuOptions = useMemo(() => menuHistory.map(h => h.name).filter(Boolean).sort((a,b) => a.localeCompare(b, "ko")), [menuHistory]);

  const updateRow = useCallback((id, patch) => setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r)), []);
  const addRow = () => setRows(prev => [...prev, { id: uid(), name: "", menu: "", substitute: "", active: true }]);
  const deleteRow = id => setRows(prev => prev.filter(r => r.id !== id));

  const confirmOrder = async () => {
    const active = rows.filter(r => r.active && r.menu?.trim());
    if (!active.length) return;
    if (!window.confirm("확정할까?")) return;
    const id = uid();
    await setDoc(doc(db, "archive", id), { id, date: new Date().toISOString().slice(0,10), orders: active.map(r => ({ name: r.name, menu: r.menu, substitute: r.substitute || "" })), order: Date.now() });
    active.forEach(r => saveMenuHistory(r.menu));
    alert("저장 완료!");
  };

  if (!authed) return <PasswordGate onUnlock={() => setAuthed(true)} />;
  if (!archiveReady || !menuHistoryReady) return <div style={{ color: "#fff", padding: 20 }}>로딩중...</div>;

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d1a", color: "#e0e0f0", padding: "20px" }}>
      <style>{`
        .toggle-wrap{position:relative;width:38px;height:20px} .toggle-wrap input{opacity:0;width:0;height:0}
        .toggle-slider{position:absolute;inset:0;background:#2d2d4a;border-radius:20px;cursor:pointer}
        .toggle-slider::after{content:'';position:absolute;left:2px;top:2px;width:16px;height:16px;background:#fff;border-radius:50%;transition:0.2s}
        .toggle-wrap input:checked+.toggle-slider{background:#6c63ff}
        .toggle-wrap input:checked+.toggle-slider::after{transform:translateX(18px)}
      `}</style>
      
      <header style={{ marginBottom: 20 }}>
        <h1>메뉴 취합 시스템 ☕</h1>
        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <button onClick={() => setView("order")} style={{ padding: 10, background: view === "order" ? "#6c63ff" : "#222", color: "#fff", border: "none", borderRadius: 8 }}>입력</button>
          <button onClick={() => setView("stats")} style={{ padding: 10, background: view === "stats" ? "#6c63ff" : "#222", color: "#fff", border: "none", borderRadius: 8 }}>통계</button>
        </div>
      </header>

      {view === "order" && (
        <div>
          {rows.map((row, idx) => (
            <SwipeRow key={row.id} row={row} idx={idx} onUpdate={updateRow} onDelete={deleteRow} menuOptions={menuOptions} onDeleteHistory={id => deleteDoc(doc(db, "menuHistory", id))} />
          ))}
          <button onClick={addRow} style={{ width: "100%", padding: 12, background: "#2d2d4a", border: "1px dashed #6c63ff", borderRadius: 12, color: "#fff", marginTop: 10 }}>+ 추가</button>
          <button onClick={confirmOrder} style={{ width: "100%", padding: 15, background: "#f0a050", borderRadius: 12, border: "none", color: "#fff", fontWeight: "bold", marginTop: 20 }}>✅ 주문 확정</button>
        </div>
      )}

      {/* 통계 뷰 등 나머지 UI 로직... */}
    </div>
  );
}
