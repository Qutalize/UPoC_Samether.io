import React, { useState, useCallback, useRef } from "react";
import {
  Camera, Upload, ImageIcon, CheckCircle2, XCircle, Trash2,
  FlaskConical, Grid3X3, Info, ArrowRight, RefreshCw,
} from "lucide-react";

/* ================================================================
   UECPort_Samezario 照合ラボ (Photo Verify Lab)
   実際の写真でdHash照合のハミング距離としきい値を検証するツール。
   技術検証書(07)の computeDHash / hammingDistance と同一実装。
   使い方:
     1. お手本(参照)画像を1〜3枚アップロード
     2. テスト画像を撮影 or アップロード
     3. 距離が自動計算され、しきい値スライダーで合否が変わる
   ================================================================ */

const C = {
  lagoon: "#4FC3F7", lagoonDeep: "#00B4D8", sea: "#0096C7",
  coral: "#FF6B6B", sunset: "#FFA94D", palm: "#38D9A9",
  hibiscus: "#E63946", sand: "#FFE8B0", ink: "#073B4C", cloud: "#B0BEC5",
};

/* ---------- dHash core（技術検証書 §2.1 と同一） ---------- */

async function decodeBitmap(source) {
  // EXIF回転を適用（iOS縦持ち対策）。古い環境向けフォールバック付き
  try {
    return await createImageBitmap(source, { imageOrientation: "from-image" });
  } catch {
    try {
      return await createImageBitmap(source);
    } catch {
      // 最終フォールバック: <img>経由
      const url = URL.createObjectURL(source);
      try {
        const img = await new Promise((res, rej) => {
          const el = new Image();
          el.onload = () => res(el);
          el.onerror = rej;
          el.src = url;
        });
        return img;
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  }
}

async function computeDHash(source) {
  const bmp = await decodeBitmap(source);
  const W = 9, H = 8;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, W, H);
  if (bmp.close) bmp.close();

  const { data } = ctx.getImageData(0, 0, W, H);
  const gray = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }
  let hash = 0n;
  const bits = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W - 1; x++) {
      const bit = gray[y * W + x] < gray[y * W + x + 1] ? 1 : 0;
      hash = (hash << 1n) | BigInt(bit);
      bits.push(bit);
    }
  }
  return { hash, bits, gray: Array.from(gray) };
}

function hammingDistance(a, b) {
  let x = a ^ b, d = 0;
  while (x) { d += Number(x & 1n); x >>= 1n; }
  return d;
}

function hashToHex(h) {
  return "0x" + h.toString(16).padStart(16, "0");
}

/* ---------- 撮影/アップロード（技術検証書 §1.2 と同方式） ---------- */

function pickImage(useCamera) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (useCamera) input.setAttribute("capture", "environment");
    input.style.display = "none";
    document.body.appendChild(input);
    const cleanup = () => input.remove();
    input.onchange = () => { const f = input.files?.[0] ?? null; cleanup(); resolve(f); };
    window.addEventListener("focus", () => {
      setTimeout(() => { if (!input.files?.length) { cleanup(); resolve(null); } }, 400);
    }, { once: true });
    input.click();
  });
}

/* ---------- 8x8ミニチュア可視化 ---------- */

function GrayGrid({ gray }) {
  if (!gray) return null;
  const W = 9, H = 8;
  return (
    <div className="inline-grid gap-px p-1 rounded-lg" style={{ gridTemplateColumns: `repeat(${W}, 10px)`, background: C.ink }}>
      {Array.from({ length: W * H }, (_, i) => {
        const v = Math.round(gray[i]);
        return <div key={i} style={{ width: 10, height: 10, background: `rgb(${v},${v},${v})` }} />;
      })}
    </div>
  );
}

/* ---------- 画像スロット ---------- */

function ImageSlot({ item, label, accent, onRemove }) {
  return (
    <div className="rounded-2xl overflow-hidden border-2 shadow-sm" style={{ borderColor: accent, background: "#fff" }}>
      <div className="flex items-center justify-between px-2 py-1 text-[11px] font-extrabold text-white" style={{ background: accent }}>
        <span>{label}</span>
        {onRemove && (
          <button onClick={onRemove} className="p-0.5 rounded hover:bg-white hover:bg-opacity-20"><Trash2 size={13} /></button>
        )}
      </div>
      <div className="p-2 flex gap-2 items-center">
        <img src={item.url} alt={label} className="w-20 h-20 object-cover rounded-lg" />
        <div className="text-[10px] font-mono" style={{ color: C.ink }}>
          <div className="font-bold mb-1 flex items-center gap-1" style={{ color: C.sea }}>
            <Grid3X3 size={11} /> dHash入力(9×8)
          </div>
          <GrayGrid gray={item.gray} />
          <div className="mt-1 break-all opacity-70">{hashToHex(item.hash)}</div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================ */

export default function PhotoVerifyLab() {
  const [refs, setRefs] = useState([]);      // {url, hash, bits, gray, name}
  const [test, setTest] = useState(null);
  const [threshold, setThreshold] = useState(14);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);        // 検証履歴 {name, best, pass}
  const idRef = useRef(0);

  const addImage = useCallback(async (kind, useCamera) => {
    const f = await pickImage(useCamera);
    if (!f) return;
    setBusy(true);
    try {
      const { hash, bits, gray } = await computeDHash(f);
      const item = { id: ++idRef.current, url: URL.createObjectURL(f), hash, bits, gray, name: f.name || `photo_${idRef.current}` };
      if (kind === "ref") setRefs((r) => [...r.slice(-2), item]);   // 最大3枚
      else setTest(item);
    } finally {
      setBusy(false);
    }
  }, []);

  const distances = test && refs.length
    ? refs.map((r) => ({ ref: r, d: hammingDistance(test.hash, r.hash) }))
    : [];
  const best = distances.length ? Math.min(...distances.map((x) => x.d)) : null;
  const pass = best !== null && best <= threshold;
  const matchScore = best !== null ? Math.round(100 - (best / 64) * 100) : null;

  const recordLog = () => {
    if (best === null || !test) return;
    setLog((l) => [{ name: test.name, best, pass, at: new Date().toLocaleTimeString() }, ...l.slice(0, 9)]);
  };

  return (
    <div className="min-h-screen w-full py-8 px-4 flex flex-col items-center"
      style={{ background: `linear-gradient(160deg, ${C.lagoon}, ${C.lagoonDeep} 60%, ${C.sea})`, fontFamily: "'M PLUS Rounded 1c', sans-serif", color: C.ink }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@500;700;800&display=swap');`}</style>

      {/* ヘッダ */}
      <div className="text-center text-white mb-5">
        <div className="text-3xl font-extrabold drop-shadow flex items-center justify-center gap-2">
          <FlaskConical size={30} /> 照合ラボ
        </div>
        <div className="text-sm font-bold opacity-90 mt-1">
          dHash照合のしきい値をリアル写真で検証（技術検証書 §2.1 / §4.5 用ツール）
        </div>
      </div>

      <div className="w-full max-w-2xl flex flex-col gap-4">
        {/* Step 1: 参照画像 */}
        <section className="rounded-3xl p-4 shadow-lg" style={{ background: "rgba(255,255,255,0.94)" }}>
          <div className="font-extrabold flex items-center gap-2 mb-2">
            <span className="w-6 h-6 rounded-full text-white text-sm flex items-center justify-center" style={{ background: C.sunset }}>1</span>
            お手本（参照）画像 — スポットごとに2〜3枚推奨
          </div>
          <div className="flex flex-wrap gap-3">
            {refs.map((r) => (
              <ImageSlot key={r.id} item={r} label={`参照 ${r.name.slice(0, 14)}`} accent={C.sunset}
                onRemove={() => setRefs((arr) => arr.filter((x) => x.id !== r.id))} />
            ))}
            <button onClick={() => addImage("ref", false)} disabled={busy}
              className="w-28 h-28 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-1 text-xs font-bold active:scale-95 transition-transform"
              style={{ borderColor: C.sunset, color: C.sunset, background: C.sand + "44" }}>
              <Upload size={22} /> 追加
            </button>
          </div>
        </section>

        {/* Step 2: テスト画像 */}
        <section className="rounded-3xl p-4 shadow-lg" style={{ background: "rgba(255,255,255,0.94)" }}>
          <div className="font-extrabold flex items-center gap-2 mb-2">
            <span className="w-6 h-6 rounded-full text-white text-sm flex items-center justify-center" style={{ background: C.lagoonDeep }}>2</span>
            テスト画像（正解写真・不正解写真の両方で試すこと）
          </div>
          <div className="flex flex-wrap gap-3 items-start">
            {test && <ImageSlot item={test} label={`テスト ${test.name.slice(0, 14)}`} accent={C.lagoonDeep} onRemove={() => setTest(null)} />}
            <div className="flex flex-col gap-2">
              <button onClick={() => addImage("test", true)} disabled={busy}
                className="px-4 py-3 rounded-2xl text-white font-extrabold text-sm shadow flex items-center gap-2 active:scale-95 transition-transform"
                style={{ background: C.coral }}>
                <Camera size={18} /> カメラで撮る（capture属性）
              </button>
              <button onClick={() => addImage("test", false)} disabled={busy}
                className="px-4 py-3 rounded-2xl font-extrabold text-sm shadow flex items-center gap-2 border-2 active:scale-95 transition-transform"
                style={{ borderColor: C.lagoonDeep, color: C.lagoonDeep, background: "#fff" }}>
                <ImageIcon size={18} /> ギャラリーから選ぶ
              </button>
              {busy && <div className="text-xs font-bold flex items-center gap-1" style={{ color: C.sea }}><RefreshCw size={13} className="animate-spin" /> ハッシュ計算中…</div>}
            </div>
          </div>
        </section>

        {/* Step 3: 判定結果 */}
        <section className="rounded-3xl p-4 shadow-lg" style={{ background: "rgba(255,255,255,0.94)" }}>
          <div className="font-extrabold flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full text-white text-sm flex items-center justify-center" style={{ background: C.palm }}>3</span>
            判定結果としきい値チューニング
          </div>

          {best === null ? (
            <div className="text-sm font-bold text-center py-6" style={{ color: C.cloud }}>
              参照画像とテスト画像の両方をセットすると、ここに距離が表示されます
            </div>
          ) : (
            <>
              {/* 合否バッジ */}
              <div className="flex items-center justify-center gap-4 mb-3">
                <div className="text-center">
                  <div className="text-[11px] font-bold" style={{ color: C.sea }}>最小ハミング距離</div>
                  <div className="text-4xl font-extrabold" style={{ color: pass ? C.palm : C.hibiscus }}>{best}</div>
                  <div className="text-[11px] font-bold" style={{ color: C.cloud }}>/ 64bit（一致度 {matchScore}%）</div>
                </div>
                <ArrowRight size={22} style={{ color: C.cloud }} />
                <div className={`px-5 py-3 rounded-2xl font-extrabold text-white text-lg flex items-center gap-2 shadow`}
                  style={{ background: pass ? C.palm : C.hibiscus }}>
                  {pass ? <><CheckCircle2 size={22} /> 解放OK</> : <><XCircle size={22} /> NO_MATCH</>}
                </div>
              </div>

              {/* 参照ごとの距離 */}
              <div className="flex flex-wrap gap-2 justify-center mb-3">
                {distances.map(({ ref, d }) => (
                  <div key={ref.id} className="text-[11px] font-bold px-2.5 py-1 rounded-full border-2"
                    style={{ borderColor: d <= threshold ? C.palm : C.cloud, color: d <= threshold ? C.palm : C.ink }}>
                    vs {ref.name.slice(0, 10)}: <span className="font-mono">{d}</span>
                  </div>
                ))}
              </div>

              {/* しきい値スライダー */}
              <div className="px-2">
                <div className="flex justify-between text-[11px] font-extrabold mb-1">
                  <span style={{ color: C.palm }}>厳しい（なりすまし耐性↑）</span>
                  <span style={{ color: C.ink }}>しきい値: {threshold}</span>
                  <span style={{ color: C.sunset }}>ゆるい（現地成功率↑）</span>
                </div>
                <input type="range" min={4} max={32} value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))} className="w-full" />
                <div className="relative h-4 mt-1 rounded-full overflow-hidden" style={{ background: "#EAF7FC" }}>
                  <div className="absolute inset-y-0 left-0" style={{ width: `${((threshold - 4) / 28) * 100}%`, background: `linear-gradient(90deg, ${C.palm}, ${C.sunset})`, opacity: 0.5 }} />
                  <div className="absolute inset-y-0" style={{ left: `${((best - 4) / 28) * 100}%`, width: 3, background: pass ? C.palm : C.hibiscus }} />
                </div>
                <div className="text-[10px] font-bold mt-1 text-center" style={{ color: C.sea }}>
                  経験則: 同一被写体の別撮影 = 6〜12 / 無関係画像 = 22〜32 → 初期値14前後が分離帯
                </div>
              </div>

              <button onClick={recordLog}
                className="mt-3 w-full py-2.5 rounded-2xl font-extrabold text-sm text-white shadow active:scale-95 transition-transform"
                style={{ background: C.ink }}>
                この結果を検証ログに記録
              </button>
            </>
          )}
        </section>

        {/* 検証ログ */}
        {log.length > 0 && (
          <section className="rounded-3xl p-4 shadow-lg" style={{ background: "rgba(255,255,255,0.94)" }}>
            <div className="font-extrabold text-sm mb-2">検証ログ（しきい値決定の根拠メモ）</div>
            <div className="space-y-1">
              {log.map((l, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px] font-bold">
                  {l.pass ? <CheckCircle2 size={14} style={{ color: C.palm }} /> : <XCircle size={14} style={{ color: C.hibiscus }} />}
                  <span className="font-mono px-1.5 rounded" style={{ background: "#EAF7FC" }}>d={l.best}</span>
                  <span className="truncate flex-1">{l.name}</span>
                  <span style={{ color: C.cloud }}>{l.at}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 使い方メモ */}
        <div className="rounded-2xl p-3 text-[11px] font-bold text-white flex gap-2" style={{ background: "rgba(7,59,76,0.55)" }}>
          <Info size={16} className="shrink-0 mt-0.5" />
          <div>
            しきい値の決め方（§4.5）: 正解写真10〜20枚と不正解写真10〜20枚をこのツールに通し、
            「正解群の最大距離 &lt; しきい値 &lt; 不正解群の最小距離」となる値を採用。
            分離帯ができない場合は参照画像を時間帯違いで追加する。
            EXIF回転は自動補正済み（iPhone縦持ち写真OK）。画像はブラウザ内で処理され、どこにも送信されません。
          </div>
        </div>
      </div>
    </div>
  );
}