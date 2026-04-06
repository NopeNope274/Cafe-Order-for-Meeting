import { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ── 초성 추출 ──────────────────────────────────────────────────────────────────
const getChosung = (str) => {
  const cho = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
  let res = "";
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i) - 44032;
    if (code > -1 && code < 11172) res += cho[Math.floor(code / 588)];
    else res += str.charAt(i);
  }
  return res;
};

// ── 상수 & LocalStorage 헬퍼 ──────────────────────────────────────────────────
const APP_PASSWORD = import.meta.env.VITE_APP_PASSWORD;
const LS_AUTH = "oc_auth";
const LS_ROWS = "oc_rows";
const LS_PRESETS = "oc_presets";
const LS_MENU_HIST = "oc_menu_history";
const LS_ARCHIVE = "oc_archive";

const lsGet = (key, def) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; } };
const lsSet = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch { } };

const loadRows = () => lsGet(LS_ROWS, []);
const saveRows = (v) => lsSet(LS_ROWS, v);
const loadPresets = () => lsGet(LS_PRESETS, []);
const savePresets = (v) => lsSet(LS_PRESETS, v);
const loadMenuHist = () => lsGet(LS_MENU_HIST, []);
const saveMenuHist = (v) => lsSet(LS_MENU_HIST, v);
const loadArchive = () => lsGet(LS_ARCHIVE, []);
const saveArchive = (v) => lsSet(LS_ARCHIVE, v);

let _id = Date.now();
const uid = () => String(++_id);

const PALETTE = ["#6c63ff", "#48c6ef", "#f0a050", "#ff6090", "#50e0a0", "#f0d050", "#c070ff", "#60c0ff"];
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

// ── 메뉴 히스토리 저장 헬퍼 (로컬) ───────────────────────────────────────────
const addMenuHistory = (menu, current) => {
  const m = menu?.trim();
  if (!m || m === "없음") return current;
  if (current.includes(m)) return current;
  return [...current, m].sort((a, b) => a.localeCompare(b, "ko"));
};

// ── 내보내기/불러오기 헬퍼 ────────────────────────────────────────────────────
const exportJSON = (archive, presets, menuHistory) => {
  const data = {
    exportedAt: new Date().toISOString(),
    version: "3.0-local",
    archive,
    presets,
    menuHistory,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cafe-order-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

// ── 클립보드/파일 공유용 헬퍼 ────────────────────────────────────────────────
const copyToClipboard = (data, msg, onShowToast) => {
  const str = JSON.stringify(data);
  navigator.clipboard.writeText(str).then(() => onShowToast(msg || "클립보드에 복사 완료! 📋"));
};

const mergePresets = (current, incoming) => {
  const currentNames = new Set(current.map(p => p.name));
  const newItems = incoming.filter(p => !currentNames.has(p.name)).map(p => ({ ...p, id: String(Date.now() + Math.random()) }));
  return [...current, ...newItems].sort((a, b) => (a.order || 0) - (b.order || 0));
};

const mergeMenuHistory = (current, incoming) => {
  const merged = new Set([...current, ...incoming]);
  return [...merged].sort((a, b) => a.localeCompare(b, "ko"));
};

const driveUrlToDirectLink = (url) => {
  if (!url) return "";
  const reg = /\/file\/d\/([a-zA-Z0-9_-]{25,})|id=([a-zA-Z0-9_-]{25,})/;
  const match = url.match(reg);
  const id = match ? (match[1] || match[2]) : url;
  if (id && id.length >= 25) return `https://drive.google.com/uc?export=download&id=${id}`;
  return url; // 드라이브 형식이 아니면 일단 그대로 반환
};

const exportMD = (archive, presets, menuHistory) => {
  const lines = [];
  lines.push(`# ☕ 카페 메뉴 취합 시스템 백업`);
  lines.push(`\n> 내보낸 날짜: ${new Date().toLocaleString("ko-KR")}\n`);

  lines.push(`## 📋 메뉴 히스토리 (${menuHistory.length}개)`);
  menuHistory.forEach(m => lines.push(`- ${m}`));

  lines.push(`\n## 👥 프리셋 (${presets.length}개)`);
  presets.forEach(p => {
    lines.push(`\n### ${p.name} (${p.savedAt})`);
    p.members.forEach(m => lines.push(`- [${m.active ? "x" : " "}] ${m.name}`));
  });

  lines.push(`\n## 📦 아카이브 (${archive.length}건)`);
  [...archive].sort((a, b) => b.order - a.order).forEach(entry => {
    lines.push(`\n### ${entry.date} (${entry.orders.length}명)`);
    entry.orders.forEach(o => {
      lines.push(`- **${o.name}**: ${o.menu}${o.substitute ? ` → 대체: ${o.substitute}` : ""}`);
    });
  });

  const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cafe-order-backup-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
};

function MenuInput({ value, onChange, options, onDeleteHistory, placeholder, rowStyle }) {
  const [local, setLocal] = useState(value);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => { setLocal(value); }, [value]);

  const filteredOptions = useMemo(() => {
    const search = local.trim().toLowerCase();
    if (!search) return options;
    const sc = getChosung(search);
    return options.filter(o => { const t = o.toLowerCase(); return t.includes(search) || getChosung(t).includes(sc); });
  }, [local, options]);

  const commit = (v) => { onChange(v.trim()); setOpen(false); };
  const pick = (v) => { setLocal(v); onChange(v.trim()); setOpen(false); };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
        <div style={{ position: "relative", flex: 1, minWidth: 0, display: "flex", alignItems: "center" }}>
          <input
            value={local}
            onChange={e => { setLocal(e.target.value); setOpen(true); }}
            onKeyDown={e => { if (e.key === "Enter") { commit(local); e.target.blur(); } }}
            onFocus={() => setFocused(true)}
            onBlur={() => { setFocused(false); commit(local); }}
            placeholder={placeholder}
            style={{ ...rowStyle, fontSize: "16px", paddingRight: (focused && local) ? "22px" : "2px", minWidth: 0 }}
          />
          {focused && local && (
            <span
              onMouseDown={e => { e.preventDefault(); setLocal(""); onChange(""); }}
              onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); setLocal(""); onChange(""); }}
              style={{ position: "absolute", right: 2, color: "#8080a0", fontSize: 13, cursor: "pointer", padding: "4px", touchAction: "none", lineHeight: 1 }}>✕</span>
          )}
        </div>
        <button
          onMouseDown={e => { e.preventDefault(); setOpen(o => !o); }}
          onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o); }}
          style={{ flexShrink: 0, background: "none", border: "none", color: open ? "#6c63ff" : "#3a3a6a", fontSize: 11, cursor: "pointer", padding: "2px 4px", lineHeight: 1, touchAction: "none", transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▼</button>
      </div>

      {open && (
        <div
          onTouchStart={e => e.stopPropagation()}
          onTouchMove={e => e.stopPropagation()}
          onTouchEnd={e => e.stopPropagation()}
          style={{
            marginTop: 4, maxHeight: 200, overflowY: "auto",
            WebkitOverflowScrolling: "touch", background: "#0e0e22",
            border: "1px solid #2d2d5a", borderRadius: 10, zIndex: 10,
          }}>
          {filteredOptions.length === 0
            ? <div style={{ padding: "12px 14px", fontSize: 12, color: "#505070", textAlign: "center" }}>결과 없음</div>
            : filteredOptions.map((o, i) => {
              let touchStartY = 0;
              return (
                <div key={i}
                  style={{ display: "flex", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#1a1a38"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <span
                    onMouseDown={e => { e.preventDefault(); pick(o); }}
                    onTouchStart={e => { touchStartY = e.touches[0].clientY; }}
                    onTouchEnd={e => {
                      const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
                      if (dy > 8) return; // 스크롤이면 무시
                      e.preventDefault(); e.stopPropagation(); pick(o);
                    }}
                    style={{ flex: 1, padding: "13px 14px", fontSize: 14, color: "#c8c8e8", cursor: "pointer", userSelect: "none" }}>{o}</span>
                  <span
                    onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onDeleteHistory?.(o); }}
                    onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); onDeleteHistory?.(o); }}
                    style={{ padding: "13px 14px", color: "#ff5060", fontSize: 13, cursor: "pointer", opacity: 0.4, touchAction: "none" }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "1"}
                    onMouseLeave={e => e.currentTarget.style.opacity = "0.4"}>✕</span>
                </div>
              );
            })
          }
        </div>
      )}
    </div>
  );
}

function SwipeRow({ row, idx, onUpdate, onDelete, onDragStart, onDragEnter, onDragEnd, isDragging, isOver, menuOptions, onDeleteHistory, isMobile, onDragHandle }) {
  const touch = useRef(isMobile);
  const cardRef = useRef(null);
  const startX = useRef(null);
  const startY = useRef(null);
  const swiped = useRef(false);
  const dir = useRef(null); // "left" | "right"

  // stage: 0=기본 / "del1"=삭제버튼 노출 / "del2"=삭제직전 / "sub1"=대체버튼 노출 / "sub2"=대체입력 열림
  const [stage, setStage] = useState(0);
  const [offsetX, setOffsetX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [showSub, setShowSub] = useState(!!row.substitute);

  const DEL1 = 70;   // ← 1단계: 🗑 버튼 노출
  const DEL2 = 160;  // ← 2단계: 삭제
  const SUB1 = 70;   // → 1단계: 대체 버튼 노출
  const SUB2 = 160;  // → 2단계: 대체 입력 열림

  useEffect(() => { if (row.substitute) setShowSub(true); }, [row.substitute]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el || !touch.current) return;

    const onStart = (e) => {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      swiped.current = false;
      dir.current = null;
      setSwiping(false);
    };

    const onMove = (e) => {
      if (startX.current === null) return;
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;
      if (!swiped.current && Math.abs(dy) > Math.abs(dx)) return;
      if (Math.abs(dx) < 8) return;
      if (!dir.current) dir.current = dx < 0 ? "left" : "right";
      swiped.current = true;
      setSwiping(true);
      e.preventDefault();

      if (dir.current === "left") {
        const base = (stage === "del1") ? -DEL1 : 0;
        setOffsetX(Math.min(0, Math.max(-(DEL2 + 24), dx + base)));
      } else {
        const base = (stage === "sub1") ? SUB1 : 0;
        setOffsetX(Math.max(0, Math.min(SUB2 + 24, dx + base)));
      }
    };

    const onEnd = () => {
      if (!swiped.current) { setSwiping(false); return; }

      if (dir.current === "left") {
        if (stage === "sub1" || stage === "sub2") {
          // 대체 열려있을 때 ← 짧게 → 대체 닫기
          setOffsetX(0); setStage(0);
        } else if (offsetX < -(DEL2 * 0.7)) {
          onDelete(row.id);
        } else if (offsetX < -(DEL1 * 0.5)) {
          setOffsetX(-DEL1); setStage("del1");
        } else {
          setOffsetX(0); setStage(0);
        }
      } else {
        if (stage === "del1") {
          // 삭제 열려있을 때 → 짧게 → 삭제 닫기
          setOffsetX(0); setStage(0);
        } else if (offsetX > SUB2 * 0.7) {
          setOffsetX(0); setStage("sub2"); setShowSub(true);
        } else if (offsetX > SUB1 * 0.5) {
          setOffsetX(SUB1); setStage("sub1");
        } else {
          setOffsetX(0); setStage(0);
        }
      }

      setSwiping(false);
      startX.current = null;
      dir.current = null;
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [stage, offsetX, row.id, onDelete]);

  const resetSwipe = () => { setOffsetX(0); setStage(0); };

  const handleDragHandleTouch = (e) => {
    e.stopPropagation();
    onDragHandle?.(e, idx);
  };

  const dragProps = touch.current
    ? { onTouchStart: handleDragHandleTouch, style: { touchAction: "none" } }
    : {
      onPointerDown: e => e.currentTarget.closest("[data-row]").setAttribute("draggable", "true"),
      onPointerUp: e => e.currentTarget.closest("[data-row]").setAttribute("draggable", "false"),
    };

  const bc = isOver ? "rgba(108,99,255,0.6)" : row.active ? "rgba(108,99,255,0.15)" : "rgba(255,255,255,0.04)";
  const gridCols = touch.current ? "20px 34px 80px 1fr" : "20px 34px 90px 1fr 28px 24px";

  // 스와이프로 노출되는 버튼들 (배경 없음, 버튼만)
  const showDelBtn = touch.current && (stage === "del1" || (swiping && dir.current === "left" && offsetX < -DEL1 * 0.4));
  const showSubBtn = touch.current && (stage === "sub1" || (swiping && dir.current === "right" && offsetX > SUB1 * 0.4));

  return (
    <div
      data-row draggable={false}
      onDragStart={e => { e.dataTransfer.effectAllowed = "move"; onDragStart(idx); }}
      onDragEnter={() => onDragEnter(idx)}
      onDragEnd={onDragEnd}
      onDragOver={e => e.preventDefault()}
      onMouseEnter={() => { if (!touch.current) setHovered(true); }}
      onMouseLeave={() => { if (!touch.current) setHovered(false); }}
      style={{
        position: "relative", borderRadius: 12, marginBottom: 6, userSelect: "none",
        opacity: isDragging ? 0.4 : 1,
        transform: isDragging ? "scale(0.97)" : isOver ? "scale(1.01)" : "scale(1)",
        transition: "transform .15s ease, opacity .15s ease",
        boxShadow: isOver ? "0 0 0 2px rgba(108,99,255,0.5)" : "none",
      }}
    >
      {/* 삭제 버튼 (오른쪽 고정, 배경 없음) */}
      {showDelBtn && (
        <div style={{ position: "absolute", right: 0, top: 0, bottom: showSub ? "calc(100% - 46px)" : 0, width: DEL1, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1, borderRadius: "0 12px 12px 0" }}>
          <button
            onTouchEnd={e => { e.stopPropagation(); e.preventDefault(); onDelete(row.id); }}
            style={{ background: "none", border: "none", color: "#ff6080", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 1, padding: "6px 10px", touchAction: "none" }}>
            <span style={{ fontSize: 22 }}>🗑</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#ff6080" }}>삭제</span>
          </button>
        </div>
      )}

      {/* 대체 버튼 (왼쪽 고정, 배경 없음) */}
      {showSubBtn && (
        <div style={{ position: "absolute", left: 0, top: 0, bottom: showSub ? "calc(100% - 46px)" : 0, width: SUB1, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1, borderRadius: "12px 0 0 12px" }}>
          <button
            onTouchEnd={e => { e.stopPropagation(); e.preventDefault(); setOffsetX(0); setStage("sub2"); setShowSub(true); }}
            style={{ background: "none", border: "none", color: "#48c6ef", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 1, padding: "6px 10px", touchAction: "none" }}>
            <span style={{ fontSize: 22 }}>🔄</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#48c6ef" }}>대체</span>
          </button>
        </div>
      )}

      {/* 메인 카드 */}
      <div
        ref={cardRef}
        onClick={stage !== 0 ? resetSwipe : undefined}
        style={{
          display: "grid", gridTemplateColumns: gridCols,
          gap: 6, alignItems: "start",
          background: isOver ? "rgba(108,99,255,0.1)" : row.active ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.015)",
          border: `1px solid ${bc}`,
          borderRadius: showSub ? "12px 12px 0 0" : 12,
          padding: "10px 10px",
          opacity: row.active ? 1 : 0.5,
          transform: `translateX(${offsetX}px)`,
          transition: swiping ? "none" : "transform .25s ease, border-color .15s",
          position: "relative", zIndex: 2, overflow: "visible",
        }}>

        <div
          {...(touch.current ? dragProps : {})}
          onPointerDown={!touch.current ? dragProps.onPointerDown : undefined}
          onPointerUp={!touch.current ? dragProps.onPointerUp : undefined}
          style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center", cursor: "grab", padding: "6px 4px", paddingTop: 10, touchAction: "none" }}>
          {[0, 1, 2].map(i => <div key={i} style={{ width: 12, height: 2, borderRadius: 2, background: "#3a3a6a" }} />)}
        </div>

        <label className="toggle-wrap" style={{ touchAction: "none", marginTop: 2 }}>
          <input type="checkbox" checked={row.active} onChange={e => onUpdate(row.id, { active: e.target.checked })} />
          <span className="toggle-slider" />
        </label>

        <input
          value={row.name}
          onChange={e => onUpdate(row.id, { name: e.target.value })}
          placeholder={`이름 ${idx + 1}`}
          style={{ background: "transparent", border: "none", fontSize: "15px", fontWeight: 600, color: row.active ? "#e0e0ff" : "#606080", fontFamily: "inherit", width: "100%", textDecoration: row.active ? "none" : "line-through", outline: "none", minWidth: 0, paddingTop: 2 }}
        />

        <MenuInput
          value={row.menu}
          onChange={v => onUpdate(row.id, { menu: v })}
          options={menuOptions}
          onDeleteHistory={onDeleteHistory}
          placeholder="메뉴 입력/선택"
          rowStyle={{ background: "transparent", border: "none", fontSize: "15px", color: row.active ? "#a0a0cc" : "#505070", fontFamily: "inherit", width: "100%", textDecoration: row.active ? "none" : "line-through", outline: "none", minWidth: 0 }}
        />

        {!touch.current && (
          <button onClick={() => setShowSub(s => !s)} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 3px", fontSize: 13, opacity: showSub ? 1 : 0.3, color: showSub ? "#48c6ef" : "#606080" }}>🔄</button>
        )}
        {!touch.current && (
          <button onClick={() => onDelete(row.id)} style={{ opacity: hovered ? 1 : 0, background: "none", border: "none", color: "#ff6080", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", transition: "opacity .15s", padding: 0, cursor: "pointer" }}>×</button>
        )}
      </div>

      {/* 대체음료 입력창 */}
      {showSub && (
        <div
          onTouchStart={e => e.stopPropagation()}
          onTouchMove={e => e.stopPropagation()}
          onTouchEnd={e => e.stopPropagation()}
          style={{
            display: "grid",
            gridTemplateColumns: touch.current ? "auto 1fr 28px" : "20px 34px auto 1fr 28px 24px",
            gap: 6, alignItems: "center",
            background: "rgba(72,198,239,0.05)",
            border: "1px solid rgba(72,198,239,0.2)", borderTop: "none",
            borderRadius: "0 0 12px 12px",
            padding: "8px 10px",
            transform: `translateX(${offsetX}px)`,
            transition: swiping ? "none" : "transform .25s ease",
          }}>
          {touch.current ? (
            <>
              <div style={{ fontSize: 11, color: "#48c6ef", opacity: 0.8, whiteSpace: "nowrap", paddingLeft: 2 }}>↪ 대체</div>
              <MenuInput
                value={row.substitute || ""}
                onChange={v => onUpdate(row.id, { substitute: v })}
                options={menuOptions}
                onDeleteHistory={onDeleteHistory}
                placeholder="대체 메뉴"
                rowStyle={{ background: "transparent", border: "none", fontSize: "15px", color: "#70c8d8", fontFamily: "inherit", width: "100%", outline: "none", minWidth: 0 }}
              />
              <button
                onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); onUpdate(row.id, { substitute: "" }); setShowSub(false); setStage(0); setOffsetX(0); }}
                style={{ background: "none", border: "none", color: "#48c6ef", fontSize: 14, cursor: "pointer", opacity: 0.6, padding: "4px", touchAction: "none" }}>✕</button>
            </>
          ) : (
            <>
              <div /><div />
              <div style={{ fontSize: 11, color: "#48c6ef", opacity: 0.8 }}>↪ 대체</div>
              <MenuInput
                value={row.substitute || ""}
                onChange={v => onUpdate(row.id, { substitute: v })}
                options={menuOptions}
                onDeleteHistory={onDeleteHistory}
                placeholder="대체 메뉴"
                rowStyle={{ background: "transparent", border: "none", fontSize: "15px", color: "#70c8d8", fontFamily: "inherit", width: "100%", outline: "none", minWidth: 0 }}
              />
              <button
                onMouseDown={e => { e.preventDefault(); onUpdate(row.id, { substitute: "" }); setShowSub(false); }}
                style={{ background: "none", border: "none", color: "#48c6ef", fontSize: 14, cursor: "pointer", opacity: 0.5, padding: 0 }}
                onMouseEnter={e => e.currentTarget.style.opacity = "1"}
                onMouseLeave={e => e.currentTarget.style.opacity = "0.5"}>✕</button>
              <div />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── PasswordGate ──────────────────────────────────────────────────────────────
function PasswordGate({ onUnlock }) {
  const [pw, setPw] = useState(""); const [shake, setShake] = useState(false);
  const [show, setShow] = useState(false); const [wrong, setWrong] = useState(false);
  const tryUnlock = () => {
    if (pw === APP_PASSWORD) { localStorage.setItem(LS_AUTH, "ok"); onUnlock(); }
    else { setShake(true); setWrong(true); setPw(""); setTimeout(() => setShake(false), 500); }
  };
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#0d0d1a,#12122a,#0d1a2a)", padding: 24 }}>
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
        *{box-sizing:border-box;margin:0;padding:0;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif}
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-10px)}40%{transform:translateX(10px)}60%{transform:translateX(-8px)}80%{transform:translateX(8px)}}
        .gate{animation:fadeUp .4s ease} .shake{animation:shake .45s ease!important}
      `}</style>
      <div className={`gate${shake ? " shake" : ""}`} style={{ width: "100%", maxWidth: 360, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(108,99,255,0.2)", borderRadius: 24, padding: "40px 32px", boxShadow: "0 24px 64px rgba(0,0,0,0.4)" }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, margin: "0 auto 24px", background: "linear-gradient(135deg,rgba(108,99,255,0.2),rgba(72,198,239,0.15))", border: "1px solid rgba(108,99,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🔐</div>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 11, letterSpacing: "2px", textTransform: "uppercase", color: "#6c63ff", fontWeight: 700, marginBottom: 8 }}>LIVE ORDER BOARD</div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 6 }}>메뉴 취합 시스템</h1>
          <p style={{ fontSize: 13, color: "#5050a0" }}>접근 코드를 입력해주세요</p>
        </div>
        <div style={{ position: "relative", marginBottom: 8 }}>
          <input type={show ? "text" : "password"} value={pw} onChange={e => { setPw(e.target.value); setWrong(false); }} onKeyDown={e => e.key === "Enter" && tryUnlock()} placeholder="비밀번호" autoFocus
            style={{ width: "100%", padding: "14px 48px 14px 16px", background: "rgba(255,255,255,0.06)", border: `1px solid ${wrong ? "rgba(255,96,128,0.5)" : "rgba(108,99,255,0.25)"}`, borderRadius: 12, fontSize: 15, color: "#fff", outline: "none", letterSpacing: "2px", fontFamily: "inherit" }} />
          <button onClick={() => setShow(s => !s)} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#5050a0", cursor: "pointer", fontSize: 16 }}>{show ? "🙈" : "👁️"}</button>
        </div>
        <div style={{ height: 20, marginBottom: 8, textAlign: "center" }}>{wrong && <p style={{ fontSize: 12, color: "#ff6080" }}>비밀번호가 틀렸어요</p>}</div>
        <button onClick={tryUnlock} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#6c63ff,#4a9eff)", color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>입장하기</button>
      </div>
    </div>
  );
}

// ── PresetModal ───────────────────────────────────────────────────────────────
function PresetModal({ presets, currentRows, onSave, onLoad, onDelete, onClose }) {
  const [mode, setMode] = useState("load");
  const [newName, setNewName] = useState("");
  const [confirm, setConfirm] = useState(null);
  const handleSave = () => {
    const n = newName.trim();
    if (!n || !currentRows.length) return;
    onSave(n);
    setNewName("");
    setMode("load");
  };
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(5,5,20,0.75)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "100%", maxWidth: 640, background: "linear-gradient(160deg,#12122a,#0d1a2a)", borderRadius: "20px 20px 0 0", padding: "24px 20px 44px", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 -8px 40px rgba(0,0,0,0.5)", animation: "slideUp .3s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>👥 멤버 프리셋</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#5050a0", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 3, marginBottom: 20 }}>
          {[["load", "📂 불러오기"], ["save", "💾 저장"]].map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, fontFamily: "inherit", background: mode === k ? "linear-gradient(135deg,#6c63ff,#4a9eff)" : "transparent", color: mode === k ? "#fff" : "#6060a0", cursor: "pointer" }}>{l}</button>
          ))}
        </div>
        {mode === "save" && (
          <div>
            <p style={{ fontSize: 12, color: "#5060a0", marginBottom: 12 }}>멤버 {currentRows.length}명의 이름과 참여 상태를 저장해요.<br /><span style={{ color: "#8080cc" }}>입력된 메뉴도 함께 저장됩니다.</span></p>
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
              {currentRows.length === 0
                ? <div style={{ fontSize: 12, color: "#404060", textAlign: "center" }}>현재 멤버가 없어요.</div>
                : currentRows.map(r => (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ fontSize: 12, color: r.active ? "#6c63ff" : "#404060" }}>{r.active ? "●" : "○"}</span>
                    <span style={{ fontSize: 13, color: r.active ? "#c8c8e8" : "#606080", textDecoration: r.active ? "none" : "line-through" }}>{r.name || "(이름 없음)"}</span>
                    <span style={{ fontSize: 11, color: "#404060", marginLeft: "auto" }}>{r.active ? "참여" : "제외"}</span>
                  </div>
                ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSave()} placeholder="프리셋 이름 (예: 아침팀)"
                style={{ flex: 1, padding: "12px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(108,99,255,0.25)", borderRadius: 10, fontSize: 13, color: "#fff", outline: "none", fontFamily: "inherit" }} />
              <button onClick={handleSave} style={{ padding: "12px 18px", borderRadius: 10, border: "none", background: newName.trim() && currentRows.length > 0 ? "linear-gradient(135deg,#6c63ff,#4a9eff)" : "rgba(255,255,255,0.06)", color: newName.trim() && currentRows.length > 0 ? "#fff" : "#404060", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>저장</button>
            </div>
          </div>
        )}
        {mode === "load" && (
          presets.length === 0
            ? <div style={{ textAlign: "center", padding: "40px 20px", color: "#404060" }}><div style={{ fontSize: 32, marginBottom: 12 }}>📭</div><div style={{ fontSize: 13 }}>저장된 프리셋이 없어요</div></div>
            : presets.map(p => (
              <div key={p.id} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(108,99,255,0.15)", borderRadius: 14, padding: "14px 16px", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#e0e0ff" }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "#404060", marginTop: 2 }}>{p.members?.filter(m => m.active).length}명 참여 · {p.savedAt}</div>
                  </div>
                  {confirm === p.id
                    ? <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => setConfirm(null)} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#808099", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>취소</button>
                      <button onClick={() => { onDelete(p.id); setConfirm(null); }} style={{ padding: "5px 10px", borderRadius: 8, border: "none", background: "rgba(255,80,80,0.2)", color: "#ff8090", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>삭제</button>
                    </div>
                    : <button onClick={() => setConfirm(p.id)} style={{ background: "none", border: "none", color: "#404060", fontSize: 18, cursor: "pointer" }}>🗑</button>
                  }
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
                  {p.members?.map((m, i) => (<span key={i} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 10, background: m.active ? "rgba(108,99,255,0.15)" : "rgba(255,255,255,0.04)", color: m.active ? "#a09aff" : "#505070", textDecoration: m.active ? "none" : "line-through" }}>{m.name}</span>))}
                </div>
                <button onClick={() => { onLoad(p); onClose(); }} style={{ width: "100%", padding: "10px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,rgba(108,99,255,0.3),rgba(72,198,239,0.2))", color: "#a09aff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>📂 이 프리셋으로 불러오기</button>
              </div>
            ))
        )}
      </div>
    </div>
  );
}

// ── DataModal (내보내기/불러오는/동기화) ─────────────────────────────────────
function DataModal({ archive, presets, menuHistory, onImport, onClearMenuHistory, onClose, onSync, onCopy, syncUrls, onSaveSyncUrls }) {
  const [mode, setMode] = useState("export");
  const [status, setStatus] = useState("");
  const [showUrlSet, setShowUrlSet] = useState(false);
  const [tempUrls, setTempUrls] = useState(syncUrls || { presets: "", menu: "" });
  const [activeAction, setActiveAction] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => { setTempUrls(syncUrls); }, [syncUrls]);

  const handleCopyAction = (type) => {
    setActiveAction(`copy-${type}`);
    onCopy(type);
    setTimeout(() => setActiveAction(null), 1500);
  };

  const handleUrlSyncAction = async (type) => {
    const success = await onSync(type);
    if (success) {
      setActiveAction(type);
      setTimeout(() => setActiveAction(null), 1500);
    }
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.version?.includes("local") && !data.archive) {
          setStatus("❌ 올바른 백업 파일이 아니에요");
          return;
        }
        onImport(data);
        setStatus(`✅ 불러오기 완료! 아카이브 ${data.archive?.length || 0}건, 프리셋 ${data.presets?.length || 0}개, 메뉴 ${data.menuHistory?.length || 0}개`);
      } catch {
        setStatus("❌ 파일을 읽을 수 없어요. JSON 형식만 지원해요.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleClipboardSync = async (type) => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) { setStatus("❌ 클립보드가 비어있어요."); return; }
      const data = JSON.parse(text);
      const success = await onSync(type, data);
      if (success) {
        setStatus(`✅ ${type === "presets" ? "프리셋" : "메뉴 목록"} 동기화 완료!`);
        setActiveAction(`sync-${type}`);
        setTimeout(() => setActiveAction(null), 1500);
      } else {
        setStatus("❌ 데이터 형식이 올바르지 않아요.");
      }
    } catch {
      setStatus("❌ 클립보드에서 데이터를 읽을 수 없거나 형식이 틀려요.");
    }
  };

  const handleSaveUrls = () => {
    onSaveSyncUrls(tempUrls);
    setStatus("✅ 보안 URL 설정이 저장되었습니다.");
    setShowUrlSet(false);
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(5,5,20,0.75)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "100%", maxWidth: 640, background: "linear-gradient(160deg,#12122a,#0d1a2a)", borderRadius: "20px 20px 0 0", padding: "24px 20px 44px", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 -8px 40px rgba(0,0,0,0.5)", animation: "slideUp .3s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>💾 데이터 관리</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#5050a0", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 3, marginBottom: 20 }}>
          {[["export", "📤 내보내기"], ["import", "📥 불러오기"], ["sync", "👥 공유/동기화"]].map(([k, l]) => (
            <button key={k} onClick={() => { setMode(k); setStatus(""); }} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, fontFamily: "inherit", background: mode === k ? "linear-gradient(135deg,#6c63ff,#4a9eff)" : "transparent", color: mode === k ? "#fff" : "#6060a0", cursor: "pointer" }}>{l}</button>
          ))}
        </div>

        {mode === "export" && (
          <div>
            <p style={{ fontSize: 12, color: "#5060a0", marginBottom: 16, lineHeight: 1.7 }}>
              현재 저장된 데이터를 파일로 내보내요.<br />
              <span style={{ color: "#404060" }}>JSON은 완벽한 복원, MD는 사람이 읽기 쉬운 형식이에요.</span>
            </p>
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", gap: 20 }}>
              {[[archive.length, "아카이브", "#f0a050"], [presets.length, "프리셋", "#a09aff"], [menuHistory.length, "메뉴 목록", "#48c6ef"]].map(([v, l, c]) => (
                <div key={l} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: c }}>{v}</div>
                  <div style={{ fontSize: 10, color: "#5050a0" }}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => exportJSON(archive, presets, menuHistory)}
                style={{ flex: 1, padding: "13px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#6c63ff,#4a9eff)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                📄 JSON 내보내기
              </button>
              <button
                onClick={() => exportMD(archive, presets, menuHistory)}
                style={{ flex: 1, padding: "13px", borderRadius: 12, border: "1px solid rgba(108,99,255,0.3)", background: "rgba(108,99,255,0.08)", color: "#a09aff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                📝 MD 내보내기
              </button>
            </div>
            <button
              onClick={() => { if (window.confirm(`메뉴 히스토리 ${menuHistory.length}개를 모두 삭제할까요?`)) { onClearMenuHistory(); setStatus("✅ 메뉴 히스토리를 초기화했어요"); } }}
              style={{ width: "100%", marginTop: 10, padding: "11px", borderRadius: 12, border: "1px solid rgba(255,80,80,0.2)", background: "rgba(255,80,80,0.06)", color: "#ff8090", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              🗑 메뉴 히스토리 전체 삭제 ({menuHistory.length}개)
            </button>
          </div>
        )}

        {mode === "import" && (
          <div>
            <p style={{ fontSize: 12, color: "#5060a0", marginBottom: 16, lineHeight: 1.7 }}>
              JSON 백업 파일을 불러와요.<br />
              <span style={{ color: "#ff8090" }}>⚠️ 기존 데이터에 병합돼요. 중복 항목은 최신 것으로 덮어씌워져요.</span>
            </p>
            <button
              onClick={() => fileRef.current?.click()}
              style={{ width: "100%", padding: "16px", borderRadius: 12, border: "2px dashed rgba(108,99,255,0.3)", background: "rgba(108,99,255,0.06)", color: "#8080cc", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              📁 JSON 파일 선택
            </button>
            <input ref={fileRef} type="file" accept=".json" onChange={handleImportFile} style={{ display: "none" }} />
          </div>
        )}

        {mode === "sync" && (
          <div>
            <p style={{ fontSize: 11, color: "#5060a0", marginBottom: 16, lineHeight: 1.6 }}>
              JSON 데이터를 통해 팀원과 동기화하세요.<br />
              <span style={{ color: "#6c63ff" }}>URL 방식은 한 번 등록하면 버튼 하나로 업데이트됩니다.</span>
            </p>

            {/* 보안 URL 동기화 */}
            <div style={{ background: "rgba(108,99,255,0.08)", border: "1.5px solid rgba(108,99,255,0.3)", borderRadius: 14, padding: "16px 14px", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>🌐 보안 URL 원격 동기화</span>
                <button onClick={() => setShowUrlSet(!showUrlSet)} style={{ background: "none", border: "none", color: "#a09aff", fontSize: 11, fontWeight: 700, textDecoration: "underline", cursor: "pointer" }}>{showUrlSet ? "닫기" : "URL 설정하기"}</button>
              </div>

              {showUrlSet ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, animation: "fadeIn .2s ease" }}>
                  <div>
                    <label style={{ fontSize: 10, color: "#5060a0", display: "block", marginBottom: 4 }}>프리셋 JSON URL (구글 드라이브 등)</label>
                    <input value={tempUrls.presets} onChange={e => setTempUrls({ ...tempUrls, presets: e.target.value })} placeholder="https://drive.google.com/..." style={{ width: "100%", padding: "10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(108,99,255,0.2)", borderRadius: 10, fontSize: 12, color: "#fff", outline: "none" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: "#5060a0", display: "block", marginBottom: 4 }}>메뉴 목록 JSON URL</label>
                    <input value={tempUrls.menu} onChange={e => setTempUrls({ ...tempUrls, menu: e.target.value })} placeholder="https://drive.google.com/..." style={{ width: "100%", padding: "10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(108,99,255,0.2)", borderRadius: 10, fontSize: 12, color: "#fff", outline: "none" }} />
                  </div>
                  <button onClick={handleSaveUrls} style={{ width: "100%", padding: "10px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#6c63ff,#4a9eff)", color: "#fff", fontSize: 12, fontWeight: 700 }}>저장 완료</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => handleUrlSyncAction("presets-url")}
                    disabled={!syncUrls.presets}
                    style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", background: activeAction === "presets-url" ? "#80e0a0" : syncUrls.presets ? "linear-gradient(135deg,rgba(108,99,255,0.3),rgba(72,198,239,0.2))" : "rgba(255,255,255,0.05)", color: activeAction === "presets-url" ? "#000" : syncUrls.presets ? "#a09aff" : "#404060", fontSize: 12, fontWeight: 700, transition: "all 0.2s" }}>
                    {activeAction === "presets-url" ? "✅ 업데이트 됨" : "👥 프리셋 업데이트"}
                  </button>
                  <button
                    onClick={() => handleUrlSyncAction("menu-url")}
                    disabled={!syncUrls.menu}
                    style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", background: activeAction === "menu-url" ? "#80e0a0" : syncUrls.menu ? "linear-gradient(135deg,rgba(72,198,239,0.3),rgba(108,99,255,0.2))" : "rgba(255,255,255,0.05)", color: activeAction === "menu-url" ? "#000" : syncUrls.menu ? "#48c6ef" : "#404060", fontSize: 12, fontWeight: 700, transition: "all 0.2s" }}>
                    {activeAction === "menu-url" ? "✅ 업데이트 됨" : "☕ 메뉴 업데이트"}
                  </button>
                </div>
              )}
            </div>

            <div style={{ padding: "0 4px", display: "flex", flexDirection: "column", gap: 12 }}>
              {/* 클립보드 방식 */}
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: "#5060a0", marginBottom: 4 }}>👥 프리셋 클립보드</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => handleCopyAction("presets")} style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", background: activeAction === 'copy-presets' ? "#80e0a0" : "rgba(255,255,255,0.04)", color: activeAction === 'copy-presets' ? "#000" : "#8080a0", fontSize: 11, fontWeight: activeAction === 'copy-presets' ? 700 : 400, transition: "all 0.2s" }}>{activeAction === 'copy-presets' ? "✅ 완료" : "복사"}</button>
                    <button onClick={() => handleClipboardSync("presets")} style={{ flex: 1.5, padding: "9px", borderRadius: 8, border: "none", background: activeAction === 'sync-presets' ? "#80e0a0" : "rgba(108,99,255,0.15)", color: activeAction === 'sync-presets' ? "#000" : "#a09aff", fontSize: 11, fontWeight: 700, transition: "all 0.2s" }}>{activeAction === 'sync-presets' ? "✅ 완료" : "동기화"}</button>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: "#5060a0", marginBottom: 4 }}>☕ 메뉴 클립보드</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => handleCopyAction("menu")} style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", background: activeAction === 'copy-menu' ? "#80e0a0" : "rgba(255,255,255,0.04)", color: activeAction === 'copy-menu' ? "#000" : "#8080a0", fontSize: 11, fontWeight: activeAction === 'copy-menu' ? 700 : 400, transition: "all 0.2s" }}>{activeAction === 'copy-menu' ? "✅ 완료" : "복사"}</button>
                    <button onClick={() => handleClipboardSync("menu")} style={{ flex: 1.5, padding: "9px", borderRadius: 8, border: "none", background: activeAction === 'sync-menu' ? "#80e0a0" : "rgba(72,198,239,0.15)", color: activeAction === 'sync-menu' ? "#000" : "#48c6ef", fontSize: 11, fontWeight: 700, transition: "all 0.2s" }}>{activeAction === 'sync-menu' ? "✅ 완료" : "동기화"}</button>
                  </div>
                </div>
              </div>

              {/* 로컬 파일 동기화 */}
              <button
                onClick={() => onSync("local")}
                style={{ width: "100%", padding: "11px", borderRadius: 10, border: "1px dashed rgba(240,160,80,0.3)", background: "rgba(240,160,80,0.04)", color: "#f0a050", fontSize: 11, fontWeight: 700 }}>
                🔄 로컬 파일 동기화 (/public/sync/*.json)
              </button>
            </div>
          </div>
        )}

        {status && (
          <div style={{ marginTop: 14, padding: "12px 16px", borderRadius: 10, background: status.startsWith("✅") ? "rgba(80,224,160,0.1)" : "rgba(255,80,80,0.1)", border: `1px solid ${status.startsWith("✅") ? "rgba(80,224,160,0.3)" : "rgba(255,80,80,0.3)"}`, fontSize: 13, color: status.startsWith("✅") ? "#80e0a0" : "#ff8090", animation: "fadeIn .2s ease" }}>
            {status}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Charts ────────────────────────────────────────────────────────────────────
function BarChart({ data, labelKey, valueKey, color = "#6c63ff", height = 180 }) {
  if (!data.length) return <div style={{ textAlign: "center", padding: 40, color: "#404060", fontSize: 13 }}>데이터가 없어요</div>;
  const max = Math.max(...data.map(d => d[valueKey]), 1);
  const bw = Math.max(24, Math.min(56, Math.floor(320 / data.length) - 8));
  return (
    <div style={{ overflowX: "auto", paddingBottom: 4 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, minWidth: data.length * (bw + 6), padding: "0 4px" }}>
        {data.map((d, i) => {
          const barH = Math.max(4, Math.round((d[valueKey] / max) * height));
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, minWidth: bw }}>
              <div style={{ fontSize: 11, color: "#a09aff", fontWeight: 700, marginBottom: 3 }}>{d[valueKey]}</div>
              <div style={{ width: "100%", height: barH, borderRadius: "6px 6px 2px 2px", background: `linear-gradient(180deg,${color}cc,${color}66)`, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(255,255,255,0.15),transparent)" }} />
              </div>
              <div style={{ fontSize: 10, color: "#5060a0", marginTop: 4, textAlign: "center", lineHeight: 1.3, maxWidth: bw, wordBreak: "keep-all" }}>{d[labelKey]}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HBar({ label, value, max, color, rank }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: "#c8c8e8", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: rank === 0 ? "#f0d050" : rank === 1 ? "#b0b0c0" : rank === 2 ? "#c08050" : "#404060", fontWeight: 800, minWidth: 16 }}>#{rank + 1}</span>{label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}회</span>
      </div>
      <div style={{ height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${max ? (value / max) * 100 : 0}%`, background: `linear-gradient(90deg,${color},${color}88)`, borderRadius: 4, transition: "width .5s ease" }} />
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [authed, setAuthed] = useState(() => localStorage.getItem(LS_AUTH) === "ok");
  const isMobile = useRef(isTouch());

  // ── 모든 데이터 localStorage ──────────────────────────────────────────────
  const [rows, setRows] = useState(loadRows);
  const [presets, setPresets] = useState(loadPresets);
  const [menuHistory, setMenuHistory] = useState(loadMenuHist);
  const [archive, setArchive] = useState(loadArchive);
  const [syncUrls, setSyncUrls] = useState(() => lsGet("oc_sync_urls", { presets: "", menu: "" }));

  // 변경 시 자동 저장
  useEffect(() => saveRows(rows), [rows]);
  useEffect(() => savePresets(presets), [presets]);
  useEffect(() => saveMenuHist(menuHistory), [menuHistory]);
  useEffect(() => saveArchive(archive), [archive]);
  useEffect(() => lsSet("oc_sync_urls", syncUrls), [syncUrls]);

  const [view, setView] = useState("order");
  const [toast, setToast] = useState(null);
  const [showPreset, setShowPreset] = useState(false);
  const [showData, setShowData] = useState(false);
  const [statMode, setStatMode] = useState("monthly");
  const [statYear, setStatYear] = useState(() => new Date().getFullYear());
  const [selPerson, setSelPerson] = useState(null);

  const dragIdx = useRef(null);
  const overIdx = useRef(null);
  const [draggingIdx, setDraggingIdx] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const [floatY, setFloatY] = useState(null); // 플로팅 블럭 Y좌표
  const [floatSnap, setFloatSnap] = useState(null); // 스냅된 목표 인덱스
  const [rowRects, setRowRects] = useState([]);   // 각 행의 화면 좌표
  const toastRef = useRef(null);

  const showToast = (msg) => { setToast(msg); clearTimeout(toastRef.current); toastRef.current = setTimeout(() => setToast(null), 2400); };
  const logout = () => { localStorage.removeItem(LS_AUTH); setAuthed(false); };

  // 자동완성 목록
  const menuOptions = useMemo(() => [...menuHistory].sort((a, b) => a.localeCompare(b, "ko")), [menuHistory]);

  // ── rows CRUD ─────────────────────────────────────────────────────────────
  const updateRow = useCallback((id, patch) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }, []);

  const addRow = () => setRows(prev => [...prev, { id: uid(), name: "", menu: "", substitute: "", active: true }]);
  const deleteRow = (id) => { setRows(prev => prev.filter(r => r.id !== id)); showToast("삭제됐어요 🗑"); };
  const resetRows = () => {
    if (window.confirm("현재 주문을 초기화할까요?\n(아카이브·프리셋·메뉴목록은 유지됩니다)")) {
      setRows([]);
      showToast("초기화 완료!");
    }
  };

  // ── 메뉴 히스토리 관리 ────────────────────────────────────────────────────
  const addToHistory = useCallback((menu) => {
    const m = menu?.trim();
    if (!m || m === "없음") return;
    setMenuHistory(prev => addMenuHistory(m, prev));
  }, []);

  const deleteFromHistory = useCallback((menuName) => {
    setMenuHistory(prev => prev.filter(m => m !== menuName));
  }, []);

  // ── 주문 기록에서 불러오기 ──────────────────────────────────────────────────
  const loadArchiveEntry = (entry) => {
    if (window.confirm(`${entry.date}의 주문 기록을 불러올까요?\n(현재 목록이 덮어씌워집니다)`)) {
      setRows(entry.orders.map(o => ({
        id: uid(),
        name: o.name,
        menu: o.menu,
        substitute: o.substitute || "",
        active: true
      })));
      setView("order");
      showToast(`📂 ${entry.date} 주문을 불러왔어요!`);
    }
  };

  // ── 드래그 정렬 (터치 + 마우스 통합) ────────────────────────────────────────
  const handleDragStart = useCallback(idx => { dragIdx.current = idx; setDraggingIdx(idx); }, []);
  const handleDragEnter = useCallback(idx => { overIdx.current = idx; setOverIndex(idx); }, []);
  const handleDragEnd = useCallback(() => {
    const from = dragIdx.current, to = overIdx.current;
    if (from !== null && to !== null && from !== to) {
      setRows(prev => { const n = [...prev]; const [m] = n.splice(from, 1); n.splice(to, 0, m); return n; });
    }
    dragIdx.current = null; overIdx.current = null;
    setDraggingIdx(null); setOverIndex(null);
  }, []);

  const touchDragIdx = useRef(null);

  const handleDragHandle = useCallback((e, idx) => {
    e.preventDefault();
    e.stopPropagation();

    // 모든 행의 현재 위치 스냅샷
    const els = Array.from(document.querySelectorAll("[data-row]"));
    const rects = els.map(el => el.getBoundingClientRect());
    setRowRects(rects);

    touchDragIdx.current = idx;
    dragIdx.current = idx;
    overIdx.current = idx;
    setDraggingIdx(idx);
    setOverIndex(idx);
    setFloatSnap(idx);

    const startY = e.touches[0].clientY;
    const rowH = rects[idx]?.height || 52;
    setFloatY(rects[idx]?.top ?? startY);

    const SNAP_DIST = rowH * 0.5;

    const onMove = (me) => {
      me.preventDefault();
      const ty = me.touches[0].clientY;
      setFloatY(ty - rowH / 2);

      // 가장 가까운 행 계산
      let snapIdx = idx;
      let minDist = Infinity;
      rects.forEach((r, i) => {
        if (i === idx) return;
        const mid = r.top + r.height / 2;
        const dist = Math.abs(ty - mid);
        if (dist < minDist) { minDist = dist; snapIdx = i; }
      });

      // 스냅 거리 이내면 스냅
      const target = minDist < SNAP_DIST * 2 ? snapIdx : idx;
      if (target !== overIdx.current) {
        overIdx.current = target;
        setOverIndex(target);
        setFloatSnap(target);
      }
    };

    const onEnd = () => {
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      const from = dragIdx.current, to = overIdx.current;
      if (from !== null && to !== null && from !== to) {
        setRows(prev => {
          const n = [...prev];
          const [m] = n.splice(from, 1);
          n.splice(to, 0, m);
          return n;
        });
      }
      dragIdx.current = null; overIdx.current = null;
      touchDragIdx.current = null;
      setDraggingIdx(null); setOverIndex(null);
      setFloatY(null); setFloatSnap(null); setRowRects([]);
    };

    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: true });
  }, []);

  // ── 프리셋 (로컬) ─────────────────────────────────────────────────────────
  const savePreset = (name) => {
    const newPreset = {
      id: uid(),
      name,
      savedAt: new Date().toISOString().slice(0, 10),
      members: rows.map(r => ({ name: r.name, active: r.active, menu: r.menu, substitute: r.substitute })),
      order: Date.now(),
    };
    setPresets(prev => [...prev, newPreset].sort((a, b) => a.order - b.order));
    showToast(`💾 '${name}' 저장 완료!`);
  };

  const loadPreset = (p) => {
    setRows(p.members.map(m => ({ id: uid(), name: m.name, menu: m.menu || "", substitute: m.substitute || "", active: m.active })));
    showToast(`📂 '${p.name}' 불러왔어요!`);
  };

  const deletePreset = (id) => {
    setPresets(prev => prev.filter(p => p.id !== id));
    showToast("프리셋 삭제됐어요");
  };

  // ── 주문 확정 (로컬 archive) ──────────────────────────────────────────────
  const confirmOrder = () => {
    const active = rows.filter(r => r.active && r.menu?.trim() && r.menu !== "없음");
    if (!active.length) { showToast("확정할 주문이 없어요 😅"); return; }
    if (!window.confirm(`총 ${active.length}건을 오늘 날짜로 확정할까요?`)) return;
    const now = new Date();
    const entry = {
      id: uid(),
      date: now.toISOString().slice(0, 10),
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      orders: active.map(r => ({
        name: r.name,
        menu: r.menu.trim(),
        substitute: r.substitute?.trim() || "",
      })),
      order: Date.now(),
    };
    setArchive(prev => [...prev, entry]);
    // 확정된 메인 메뉴만 히스토리에 추가
    active.forEach(r => addToHistory(r.menu));
    showToast(`✅ ${active.length}건 저장됐어요!`);
  };

  // ── ✓ 버튼/Enter 확정 시 히스토리 저장 래퍼 ─────────────────────────────
  // SwipeRow의 onUpdate를 감싸서 menu 변경 감지 (commit 시점에만)
  const updateRowWithHistory = useCallback((id, patch) => {
    updateRow(id, patch);
    // menu 필드가 확정(비어있지 않음)될 때만 저장
    if (patch.menu !== undefined && patch.menu.trim()) {
      addToHistory(patch.menu);
    }
  }, [updateRow, addToHistory]);

  // ── 요약 복사 ─────────────────────────────────────────────────────────────
  const copyText = () => {
    const summ = getSummary(rows);
    const lines = [
      "📋 주문 요약",
      `총 ${rows.filter(r => r.active).length}명 참여 / ${rows.filter(r => r.active && r.menu?.trim() && r.menu !== "없음").length}명 주문`,
      "",
    ];
    summ.forEach(([m, c]) => lines.push(`${m}  ×${c}`));
    const withSub = rows.filter(r => r.active && r.substitute?.trim());
    if (withSub.length) {
      lines.push("", "── 대체음료 ──");
      withSub.forEach(r => lines.push(`${r.name}: ${r.menu} → ${r.substitute}`));
    }
    navigator.clipboard.writeText(lines.join("\n")).then(() => showToast("클립보드에 복사됐어요! 📋"));
  };

  // ── 데이터 불러오기 (병합) ────────────────────────────────────────────────
  const handleImport = (data) => {
    if (data.archive?.length) {
      setArchive(prev => {
        const existIds = new Set(prev.map(e => e.id));
        const newItems = data.archive.filter(e => !existIds.has(e.id));
        return [...prev, ...newItems].sort((a, b) => a.order - b.order);
      });
    }
    if (data.presets?.length) {
      setPresets(prev => mergePresets(prev, data.presets));
    }
    if (data.menuHistory?.length) {
      setMenuHistory(prev => mergeMenuHistory(prev, data.menuHistory));
    }
  };

  // ── 데이터 동기화 핸들러 ──────────────────────────────────────────────────
  const handleCopySpecific = (type) => {
    if (type === "presets") copyToClipboard(presets, "프리셋 데이터가 복사되었습니다! 👥", showToast);
    if (type === "menu") copyToClipboard(menuHistory, "메뉴 목록이 복사되었습니다! ☕", showToast);
  };

  const handleSyncData = async (type, data) => {
    if (type === "presets-url" || type === "menu-url") {
      const url = type === "presets-url" ? syncUrls.presets : syncUrls.menu;
      const target = type === "presets-url" ? "presets" : "menu";
      const directUrl = driveUrlToDirectLink(url);
      try {
        const res = await fetch(directUrl);
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (target === "presets") setPresets(prev => mergePresets(prev, json));
        else setMenuHistory(prev => mergeMenuHistory(prev, json));
        showToast(`✅ ${target === "presets" ? "프리셋" : "메뉴"} URL 동기화 완료!`);
        return true;
      } catch {
        showToast("❌ 데이터를 가져오지 못했습니다. URL과 권한을 확인하세요.");
        return false;
      }
    }
    if (!data) return false;
    if (type === "presets") {
      if (!Array.isArray(data)) return false;
      setPresets(prev => mergePresets(prev, data));
      showToast(`✅ 프리셋 동기화 완료!`);
      return true;
    }
    if (type === "menu") {
      if (!Array.isArray(data)) return false;
      setMenuHistory(prev => mergeMenuHistory(prev, data));
      showToast(`✅ 메뉴 목록 동기화 완료!`);
      return true;
    }
    if (type === "local") {
      try {
        const pRes = await fetch("/sync/presets.json").catch(() => null);
        const mRes = await fetch("/sync/menu_history.json").catch(() => null);
        let count = 0;
        if (pRes?.ok) {
          const pd = await pRes.json();
          setPresets(prev => mergePresets(prev, pd));
          count++;
        }
        if (mRes?.ok) {
          const md = await mRes.json();
          setMenuHistory(prev => mergeMenuHistory(prev, md));
          count++;
        }
        if (count > 0) showToast(`✅ 로컬 파일 ${count}종 동기화 완료!`);
        else showToast("❌ 동기화할 로컬 파일을 찾을 수 없어요. (public/sync/ 확인)");
        return true;
      } catch (e) {
        showToast("❌ 로컬 파일 읽기 실패");
        return false;
      }
    }
    return false;
  };

  // ── 통계 ─────────────────────────────────────────────────────────────────
  const summ = getSummary(rows);
  const activeCount = rows.filter(r => r.active).length;
  const totalOrdered = rows.filter(r => r.active && r.menu?.trim() && r.menu !== "없음").length;
  const years = useMemo(() => [...new Set(archive.map(e => e.year))].sort((a, b) => b - a), [archive]);
  const monthlyData = useMemo(() => { const map = {}; archive.filter(e => e.year === statYear).forEach(e => { map[e.month] = (map[e.month] || 0) + e.orders.length; }); return Array.from({ length: 12 }, (_, i) => ({ label: `${i + 1}월`, value: map[i + 1] || 0 })); }, [archive, statYear]);
  const yearlyData = useMemo(() => { const map = {}; archive.forEach(e => { map[e.year] = (map[e.year] || 0) + e.orders.length; }); return Object.entries(map).sort((a, b) => a[0] - b[0]).map(([y, v]) => ({ label: `${y}년`, value: v })); }, [archive]);
  const allMenuStats = useMemo(() => { const map = {}; archive.forEach(e => e.orders.forEach(o => { map[o.menu] = (map[o.menu] || 0) + 1; })); return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10); }, [archive]);
  const persons = useMemo(() => [...new Set(archive.flatMap(e => e.orders.map(o => o.name)))].sort((a, b) => a.localeCompare(b, "ko")), [archive]);
  const personStats = useMemo(() => { if (!selPerson) return []; const map = {}; archive.forEach(e => e.orders.filter(o => o.name === selPerson).forEach(o => { map[o.menu] = (map[o.menu] || 0) + 1; })); return Object.entries(map).sort((a, b) => b[1] - a[1]); }, [archive, selPerson]);
  const personMonthly = useMemo(() => { if (!selPerson) return []; const map = {}; archive.forEach(e => { if (e.year !== statYear) return; const cnt = e.orders.filter(o => o.name === selPerson).length; if (cnt) map[e.month] = (map[e.month] || 0) + cnt; }); return Array.from({ length: 12 }, (_, i) => ({ label: `${i + 1}월`, value: map[i + 1] || 0 })); }, [archive, selPerson, statYear]);

  if (!authed) return <PasswordGate onUnlock={() => setAuthed(true)} />;

  const TABS = [["order", "📝 입력"], ["summary", "📊 요약"], ["stats", "📈 통계"]];

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#0d0d1a 0%,#12122a 50%,#0d1a2a 100%)", fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif", color: "#e0e0f0" }}>
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px;height:4px} ::-webkit-scrollbar-thumb{background:#3d3d6a;border-radius:4px}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
        @keyframes toastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
        .toggle-wrap{position:relative;width:34px;height:20px;flex-shrink:0}
        .toggle-wrap input{opacity:0;width:0;height:0}
        .toggle-slider{position:absolute;inset:0;border-radius:20px;cursor:pointer;background:#2d2d4a;transition:all .2s}
        .toggle-slider::after{content:'';position:absolute;left:3px;top:3px;width:14px;height:14px;border-radius:50%;background:#555577;transition:all .2s}
        .toggle-wrap input:checked+.toggle-slider{background:linear-gradient(135deg,#6c63ff,#48c6ef)}
        .toggle-wrap input:checked+.toggle-slider::after{transform:translateX(14px);background:#fff}
        input{outline:none} button{cursor:pointer}
        .abtn{transition:all .15s} .abtn:hover{filter:brightness(1.15);transform:translateY(-1px)} .abtn:active{transform:translateY(0)}
        .tbtn{transition:all .18s} .chip{transition:all .15s} .chip:hover{filter:brightness(1.2)}
      `}</style>

      {/* 배경 글로우 */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -120, right: -80, width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle,rgba(108,99,255,0.08),transparent 70%)" }} />
        <div style={{ position: "absolute", bottom: -100, left: -60, width: 350, height: 350, borderRadius: "50%", background: "radial-gradient(circle,rgba(72,198,239,0.06),transparent 70%)" }} />
      </div>

      {/* 토스트 */}
      {toast && <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, background: "#2d2d4a", border: "1px solid #6c63ff44", borderRadius: 12, padding: "10px 18px", fontSize: 13, color: "#c8c8ff", boxShadow: "0 4px 24px rgba(0,0,0,0.4)", animation: "toastIn .25s ease" }}>{toast}</div>}

      {showPreset && <PresetModal presets={presets} currentRows={rows} onSave={savePreset} onLoad={loadPreset} onDelete={deletePreset} onClose={() => setShowPreset(false)} />}
      {showData && <DataModal archive={archive} presets={presets} menuHistory={menuHistory} onImport={handleImport} onClearMenuHistory={() => { setMenuHistory([]); showToast("메뉴 히스토리 초기화됐어요"); }} onClose={() => setShowData(false)} onSync={handleSyncData} onCopy={handleCopySpecific} syncUrls={syncUrls} onSaveSyncUrls={setSyncUrls} />}

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 16px 100px", position: "relative", zIndex: 1 }}>

        {/* 헤더 */}
        <header style={{ padding: "28px 0 16px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: "2px", textTransform: "uppercase", color: "#6c63ff", fontWeight: 700, marginBottom: 4 }}>LIVE ORDER BOARD</div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>메뉴 취합 시스템</h1>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <div style={{ display: "flex", gap: 6 }}>
                {[[activeCount, "참여", "#a09aff", "rgba(108,99,255,0.12)", "rgba(108,99,255,0.2)"],
                [totalOrdered, "주문", "#48c6ef", "rgba(72,198,239,0.1)", "rgba(72,198,239,0.18)"],
                [archive.length, "기록", "#f0a050", "rgba(240,160,80,0.1)", "rgba(240,160,80,0.18)"]].map(([v, l, c, bg, b]) => (
                  <div key={l} style={{ textAlign: "center", background: bg, border: `1px solid ${b}`, borderRadius: 10, padding: "6px 10px" }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: c }}>{v}</div>
                    <div style={{ fontSize: 9, color: "#7070a0" }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={() => setShowData(true)} style={{ background: "none", border: "none", color: "#404060", fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>💾 데이터</button>
                <button onClick={logout} style={{ background: "none", border: "none", color: "#303050", fontSize: 11, fontFamily: "inherit" }}>🔓 로그아웃</button>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 16, background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 4 }}>
            {TABS.map(([k, l]) => (
              <button key={k} className="tbtn" onClick={() => setView(k)} style={{ flex: 1, padding: "9px 4px", borderRadius: 9, border: "none", fontSize: 12, fontWeight: 700, fontFamily: "inherit", background: view === k ? "linear-gradient(135deg,#6c63ff,#4a9eff)" : "transparent", color: view === k ? "#fff" : "#7070a0", boxShadow: view === k ? "0 2px 12px rgba(108,99,255,0.3)" : "none" }}>{l}</button>
            ))}
          </div>
        </header>

        {/* ══ 주문 입력 ══ */}
        {view === "order" && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            {/* 프리셋 바 */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
              <button className="abtn" onClick={() => setShowPreset(true)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, border: "1px solid rgba(108,99,255,0.25)", background: "rgba(108,99,255,0.08)", color: "#8080cc", fontSize: 12, fontWeight: 700, fontFamily: "inherit", flexShrink: 0 }}>
                👥 프리셋{presets.length > 0 && <span style={{ background: "rgba(108,99,255,0.3)", color: "#a09aff", borderRadius: 10, padding: "1px 7px", fontSize: 10 }}>{presets.length}</span>}
              </button>
              {presets.length > 0 && (
                <div style={{ display: "flex", gap: 5, overflowX: "auto", flex: 1 }}>
                  {presets.slice(0, 3).map(p => (
                    <button key={p.id} className="chip" onClick={() => loadPreset(p)} style={{ flexShrink: 0, padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "#7070a0", fontSize: 11, fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap" }}>↩ {p.name}</button>
                  ))}
                </div>
              )}
            </div>

            {/* 컬럼 헤더 */}
            {rows.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: isMobile.current ? "22px 34px 1fr 1fr" : "22px 34px 1fr 1fr 28px 24px", gap: 6, padding: "0 10px 8px", fontSize: 10, letterSpacing: "1px", textTransform: "uppercase", color: "#5050a0" }}>
                <div /><div>ON</div><div>이름</div>
                <div>{isMobile.current ? "메뉴 (→대체 ←삭제)" : "메뉴  ✓=확정 ▼=이력 🔄=대체"}</div>
                {!isMobile.current && <><div /><div /></>}
              </div>
            )}

            {rows.length > 1 && (
              <div style={{ fontSize: 11, color: "#3a3a6a", textAlign: "center", marginBottom: 8 }}>
                {isMobile.current ? "☰ 꾹 눌러 정렬  |  → 대체  |  ← 삭제 (2단계)" : "☰ 드래그 정렬  |  🔄 대체  |  × 삭제"}
              </div>
            )}

            {rows.length === 0
              ? <div style={{ textAlign: "center", padding: "40px 20px", color: "#303050", lineHeight: 2 }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 14 }}>아직 참여자가 없어요</div>
                <div style={{ fontSize: 12, color: "#252540" }}>프리셋을 불러오거나 직접 추가해보세요</div>
              </div>
              : rows.map((row, idx) => (
                <SwipeRow key={row.id} row={row} idx={idx}
                  onUpdate={updateRowWithHistory}
                  onDelete={deleteRow}
                  onDragStart={handleDragStart}
                  onDragEnter={handleDragEnter}
                  onDragEnd={handleDragEnd}
                  isDragging={draggingIdx === idx}
                  isOver={floatSnap === idx && draggingIdx !== idx}
                  menuOptions={menuOptions}
                  onDeleteHistory={deleteFromHistory}
                  isMobile={isMobile.current}
                  onDragHandle={handleDragHandle}
                />
              ))
            }

            {/* 플로팅 드래그 블럭 */}
            {floatY !== null && draggingIdx !== null && rows[draggingIdx] && (
              <div style={{
                position: "fixed", left: 16, right: 16, top: floatY,
                zIndex: 9999, pointerEvents: "none",
                opacity: 0.93,
                transform: "scale(1.02)",
                boxShadow: "0 10px 40px rgba(0,0,0,0.55)",
                borderRadius: 12,
                background: "linear-gradient(135deg,rgba(108,99,255,0.2),rgba(72,198,239,0.12))",
                border: "1.5px solid rgba(108,99,255,0.55)",
                padding: "11px 14px",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, flexShrink: 0 }}>
                  {[0, 1, 2].map(i => <div key={i} style={{ width: 12, height: 2, borderRadius: 2, background: "#6c63ff" }} />)}
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#e0e0ff", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {rows[draggingIdx].name || `이름 ${draggingIdx + 1}`}
                </span>
                <span style={{ fontSize: 13, color: "#a0a0cc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "45%" }}>
                  {rows[draggingIdx].menu || "—"}
                </span>
              </div>
            )}

            <button className="abtn" onClick={addRow} style={{ width: "100%", marginTop: 4, padding: "12px", background: "rgba(108,99,255,0.08)", border: "1.5px dashed rgba(108,99,255,0.3)", borderRadius: 12, color: "#6c63ff", fontSize: 14, fontWeight: 700, fontFamily: "inherit" }}>
              + 참여자 추가
            </button>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="abtn" onClick={resetRows} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1px solid rgba(255,80,80,0.2)", background: "rgba(255,80,80,0.06)", color: "#ff8090", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>↺ 초기화</button>
              <button className="abtn" onClick={() => setView("summary")} style={{ flex: 2, padding: "11px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#6c63ff,#4a9eff)", color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "inherit", boxShadow: "0 4px 16px rgba(108,99,255,0.3)" }}>📊 요약 보기 →</button>
            </div>
            <button className="abtn" onClick={confirmOrder} style={{ width: "100%", marginTop: 8, padding: "15px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#f0a050,#e07030)", color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: "inherit", boxShadow: "0 4px 20px rgba(240,140,60,0.35)" }}>
              ✅ 주문 확정 & 로컬 저장
            </button>
          </div>
        )}

        {/* ══ 요약 ══ */}
        {view === "summary" && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <div style={{ background: "linear-gradient(135deg,rgba(108,99,255,0.12),rgba(72,198,239,0.08))", border: "1px solid rgba(108,99,255,0.2)", borderRadius: 16, padding: "16px 20px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "#7070b0", marginBottom: 10 }}>현재 주문 현황</div>
              <div style={{ display: "flex", gap: 20 }}>
                {[["전체", rows.length, "#808099"], ["참여", activeCount, "#a09aff"], ["주문", totalOrdered, "#48c6ef"], ["패스", activeCount - totalOrdered, "#f0a050"], ["제외", rows.length - activeCount, "#606080"]].map(([l, v, c]) => (
                  <div key={l}><div style={{ fontSize: 20, fontWeight: 800, color: c }}>{v}</div><div style={{ fontSize: 10, color: "#5050a0" }}>{l}</div></div>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 10, letterSpacing: "1.5px", textTransform: "uppercase", color: "#5050a0", marginBottom: 10 }}>메뉴별 집계</div>
            {summ.length === 0
              ? <div style={{ textAlign: "center", padding: "32px", color: "#404060", fontSize: 13 }}>아직 주문이 없어요</div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
                {summ.map(([menu, cnt], i) => (
                  <div key={menu} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "11px 16px", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.round((cnt / summ[0][1]) * 100)}%`, background: i === 0 ? "linear-gradient(90deg,rgba(108,99,255,0.15),transparent)" : "linear-gradient(90deg,rgba(255,255,255,0.03),transparent)" }} />
                    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: i === 0 ? "#6c63ff" : "#404060", width: 20, textAlign: "center" }}>#{i + 1}</div>
                      <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#c8c8e8" }}>{menu}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: i === 0 ? "#a09aff" : "#6060a0" }}>{cnt}</div>
                      <div style={{ fontSize: 11, color: "#404060", width: 28 }}>명</div>
                    </div>
                  </div>
                ))}
              </div>
            }
            <button className="abtn" onClick={copyText} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#6c63ff,#48c6ef)", color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "inherit", boxShadow: "0 4px 20px rgba(108,99,255,0.3)", marginBottom: 8 }}>📋 요약 텍스트 복사</button>
            <button className="abtn" onClick={confirmOrder} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#f0a050,#e07030)", color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "inherit", boxShadow: "0 4px 20px rgba(240,140,60,0.3)" }}>✅ 주문 확정 & 로컬 저장</button>
            <div style={{ fontSize: 10, letterSpacing: "1.5px", textTransform: "uppercase", color: "#5050a0", margin: "18px 0 8px" }}>개인별 목록</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {rows.map(r => (
                <div key={r.id} style={{ borderRadius: 10, background: r.active ? "rgba(255,255,255,0.03)" : "transparent", opacity: r.active ? 1 : 0.35, overflow: "hidden" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#c0c0e0", textDecoration: r.active ? "none" : "line-through", minWidth: 72 }}>{r.name || "—"}</span>
                    <span style={{ fontSize: 12, color: r.menu && r.menu !== "없음" ? "#8080cc" : "#404060", textAlign: "right" }}>{r.menu || "—"}</span>
                  </div>
                  {r.substitute?.trim() && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 14px 8px", borderTop: "1px solid rgba(72,198,239,0.1)" }}>
                      <span style={{ fontSize: 11, color: "#48c6ef", opacity: 0.7 }}>↪ 대체</span>
                      <span style={{ fontSize: 12, color: "#70c8d8" }}>{r.substitute}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ 통계 ══ */}
        {view === "stats" && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            {archive.length === 0
              ? <div style={{ textAlign: "center", padding: "60px 20px", color: "#404060", lineHeight: 2 }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
                <div style={{ fontSize: 15, color: "#5050a0" }}>아직 아카이브 데이터가 없어요</div>
                <div style={{ fontSize: 12, color: "#353550" }}>주문 확정 버튼을 눌러 기록을 쌓아보세요!</div>
              </div>
              : <>
                <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
                  {[["monthly", "📅 월별"], ["yearly", "📆 연별"], ["person", "🧑 사람별"], ["log", "📋 기록"]].map(([k, l]) => (
                    <button key={k} className="chip" onClick={() => setStatMode(k)} style={{ padding: "7px 10px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 700, fontFamily: "inherit", background: statMode === k ? "linear-gradient(135deg,#6c63ff,#4a9eff)" : "rgba(255,255,255,0.06)", color: statMode === k ? "#fff" : "#6060a0", boxShadow: statMode === k ? "0 2px 12px rgba(108,99,255,0.3)" : "none" }}>{l}</button>
                  ))}
                </div>
                {(statMode === "monthly" || statMode === "person") && years.length > 0 && (
                  <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
                    {years.map(y => <button key={y} className="chip" onClick={() => setStatYear(y)} style={{ padding: "5px 14px", borderRadius: 16, border: "none", fontSize: 12, fontWeight: 600, fontFamily: "inherit", background: statYear === y ? "rgba(108,99,255,0.25)" : "rgba(255,255,255,0.05)", color: statYear === y ? "#a09aff" : "#5060a0" }}>{y}년</button>)}
                  </div>
                )}
                {statMode === "monthly" && (
                  <div>
                    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "20px 16px", marginBottom: 16 }}>
                      <div style={{ fontSize: 11, color: "#5060a0", letterSpacing: "1px", marginBottom: 16 }}>{statYear}년 월별 주문 건수</div>
                      <BarChart data={monthlyData} labelKey="label" valueKey="value" color="#6c63ff" />
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "20px 16px" }}>
                      <div style={{ fontSize: 11, color: "#5060a0", letterSpacing: "1px", marginBottom: 14 }}>{statYear}년 인기 메뉴 TOP 10</div>
                      {(() => { const map = {}; archive.filter(e => e.year === statYear).forEach(e => e.orders.forEach(o => { map[o.menu] = (map[o.menu] || 0) + 1; })); const list = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10); const mx = list[0]?.[1] || 1; return list.length === 0 ? <div style={{ textAlign: "center", padding: 20, color: "#404060", fontSize: 13 }}>데이터가 없어요</div> : list.map(([menu, cnt], i) => <HBar key={menu} label={menu} value={cnt} max={mx} color={col(i)} rank={i} />); })()}
                    </div>
                  </div>
                )}
                {statMode === "yearly" && (
                  <div>
                    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "20px 16px", marginBottom: 16 }}>
                      <div style={{ fontSize: 11, color: "#5060a0", letterSpacing: "1px", marginBottom: 16 }}>연별 총 주문 건수</div>
                      <BarChart data={yearlyData} labelKey="label" valueKey="value" color="#48c6ef" />
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "20px 16px" }}>
                      <div style={{ fontSize: 11, color: "#5060a0", letterSpacing: "1px", marginBottom: 14 }}>전체 기간 인기 메뉴 TOP 10</div>
                      {allMenuStats.length === 0 ? <div style={{ textAlign: "center", padding: 20, color: "#404060", fontSize: 13 }}>데이터가 없어요</div> : allMenuStats.map(([menu, cnt], i) => <HBar key={menu} label={menu} value={cnt} max={allMenuStats[0][1]} color={col(i)} rank={i} />)}
                    </div>
                  </div>
                )}
                {statMode === "person" && (
                  <div>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, color: "#5060a0", letterSpacing: "1px", marginBottom: 10 }}>멤버 선택</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {persons.map((p, i) => <button key={p} className="chip" onClick={() => setSelPerson(p === selPerson ? null : p)} style={{ padding: "6px 14px", borderRadius: 20, border: "none", fontSize: 13, fontWeight: 600, fontFamily: "inherit", background: selPerson === p ? col(i) + "44" : "rgba(255,255,255,0.06)", color: selPerson === p ? col(i) : "#6060a0", boxShadow: selPerson === p ? `0 2px 12px ${col(i)}44` : "none" }}>{p}</button>)}
                      </div>
                    </div>
                    {selPerson
                      ? <>
                        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "20px 16px", marginBottom: 14 }}>
                          <div style={{ fontSize: 11, color: "#5060a0", letterSpacing: "1px", marginBottom: 16 }}>{selPerson} — {statYear}년 월별 주문</div>
                          <BarChart data={personMonthly} labelKey="label" valueKey="value" color="#f0a050" />
                        </div>
                        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "20px 16px" }}>
                          <div style={{ fontSize: 11, color: "#5060a0", letterSpacing: "1px", marginBottom: 14 }}>{selPerson}의 최애 메뉴 (전체 기간)</div>
                          {personStats.length === 0 ? <div style={{ textAlign: "center", padding: 20, color: "#404060", fontSize: 13 }}>주문 기록이 없어요</div> : personStats.map(([menu, cnt], i) => <HBar key={menu} label={menu} value={cnt} max={personStats[0][1]} color={col(i)} rank={i} />)}
                        </div>
                      </>
                      : <div style={{ textAlign: "center", padding: "40px 20px", color: "#404060", fontSize: 13 }}>위에서 멤버를 선택해보세요 👆</div>
                    }
                  </div>
                )}
                {statMode === "log" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[...archive].sort((a, b) => b.order - a.order).map(entry => (
                      <div key={entry.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "14px 16px", position: "relative" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, alignItems: "center" }}>
                          <span style={{ fontSize: 13, color: "#6c63ff", fontWeight: 700 }}>{entry.date}</span>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => loadArchiveEntry(entry)} style={{ padding: "4px 10px", borderRadius: 8, border: "none", background: "rgba(108,99,255,0.15)", color: "#a09aff", fontSize: 11, cursor: "pointer", fontWeight: 700, transition: "all 0.15s" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(108,99,255,0.25)"} onMouseLeave={e => e.currentTarget.style.background = "rgba(108,99,255,0.15)"}>이 주문 불러오기 📂</button>
                            <span style={{ fontSize: 11, color: "#5060a0", background: "rgba(108,99,255,0.1)", padding: "4px 8px", borderRadius: 8, display: "flex", alignItems: "center" }}>{entry.orders.length}건</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {entry.orders.map((o, i) => (
                            <div key={i} style={{ fontSize: 13 }}>
                              <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ color: "#8080a0", minWidth: 60 }}>{o.name}</span>
                                <span style={{ color: "#c8c8e8", textAlign: "right" }}>{o.menu}</span>
                              </div>
                              {o.substitute && (
                                <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 11, color: "#48c6ef", opacity: 0.8, marginTop: 2 }}>
                                  ↪ 대체: {o.substitute}
                                </div>
                              )}
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
