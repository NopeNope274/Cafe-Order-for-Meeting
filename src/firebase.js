import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

// ── Firebase 설정 (Vercel 환경변수로 관리) ───────────────────────────────────
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FB_API_KEY,
  authDomain:        import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FB_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// ── 컬렉션 참조 ───────────────────────────────────────────────────────────────
export const rowsCol        = collection(db, "rows");
export const archiveCol     = collection(db, "archive");
export const presetsCol     = collection(db, "presets");
export const menuHistoryCol = collection(db, "menuHistory");

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────
export { doc, onSnapshot, setDoc, deleteDoc, serverTimestamp };
