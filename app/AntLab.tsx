"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createColony, DEFAULT_ANT_CONFIG, FIELD_HEIGHT, FIELD_WIDTH, paintField, stepColony, TICK_SECONDS, type AntConfig, type Colony, type FieldTool, type Point, type Scenario } from "../lib/ants";

function readout(world: Colony) {
  return { delivered: world.delivered, carrying: world.ants.filter((ant) => ant.carrying).length, remaining: world.food.reduce((sum, food) => sum + food.amount, 0), seconds: Math.floor(world.ticks * TICK_SECONDS), history: [...world.history] };
}

function drawField(canvas: HTMLCanvasElement, world: Colony, trails: boolean, cursor: Point | null, tool: FieldTool) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const scale = canvas.width / FIELD_WIDTH;
  ctx.setTransform(scale, 0, 0, canvas.height / FIELD_HEIGHT, 0, 0);
  ctx.fillStyle = "#091713";
  ctx.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
  ctx.fillStyle = "#1c3025";
  for (let y = 2; y < FIELD_HEIGHT; y += 4) for (let x = 2; x < FIELD_WIDTH; x += 4) ctx.fillRect(x, y, 0.15, 0.15);
  for (let index = 0; index < world.pheromone.length; index += 1) {
    const x = index % FIELD_WIDTH;
    const y = Math.floor(index / FIELD_WIDTH);
    if (world.walls[index]) {
      ctx.fillStyle = "#536052";
      ctx.fillRect(x, y, 1.03, 1.03);
    } else if (trails && world.pheromone[index] > 0.015) {
      ctx.fillStyle = `rgba(230,175,74,${Math.min(0.75, Math.sqrt(world.pheromone[index]) * 0.29)})`;
      ctx.fillRect(x, y, 1.05, 1.05);
    }
  }
  const ring = (x: number, y: number, radius: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.18;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
  };
  const { x: nx, y: ny } = world.nest;
  ring(nx, ny, 5, "#547b61");
  ring(nx, ny, 3.6, "#96c49e");
  ctx.fillStyle = "#234830";
  ctx.beginPath(); ctx.arc(nx, ny, 2.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#b8e4bd";
  ctx.font = "1.6px monospace"; ctx.textAlign = "center";
  ctx.fillText("NEST", nx, ny + 8);

  for (const food of world.food) {
    if (food.amount <= 0) continue;
    ring(food.x, food.y, 4.2, "#608744");
    ctx.fillStyle = "#bde778";
    const grains = Math.min(24, Math.ceil(food.amount / 15));
    for (let index = 0; index < grains; index += 1) {
      const angle = index * 2.4;
      const radius = Math.sqrt(index / 24) * 2.7;
      ctx.beginPath(); ctx.arc(food.x + Math.cos(angle) * radius, food.y + Math.sin(angle) * radius, 0.42, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#bed29b";
    ctx.font = "1.6px monospace";
    ctx.fillText(String(food.amount), food.x, food.y + 6.5);
  }
  for (const ant of world.ants) {
    ctx.save(); ctx.translate(ant.x, ant.y); ctx.rotate(ant.heading);
    const color = ant.carrying ? "#ffd18b" : "#d9e4cf";
    ctx.strokeStyle = color; ctx.lineWidth = 0.12;
    ctx.beginPath();
    for (const side of [-1, 1]) for (let leg = -1; leg <= 1; leg += 1) {
      ctx.moveTo(leg * 0.24, side * 0.12);
      ctx.lineTo(leg * 0.45 - 0.13, side * 0.62);
    }
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(-0.34, 0, 0.38, 0.23, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0.1, 0, 0.19, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0.43, 0, 0.21, 0, Math.PI * 2); ctx.fill();
    if (ant.carrying) { ctx.fillStyle = "#bde778"; ctx.fillRect(0.66, -0.22, 0.4, 0.4); }
    ctx.restore();
  }
  if (cursor) {
    ring(cursor.x, cursor.y, tool === "food" ? 4 : 3, "#e9efce");
    ctx.fillStyle = "#e9efce"; ctx.fillRect(cursor.x - 0.5, cursor.y - 0.1, 1, 0.2); ctx.fillRect(cursor.x - 0.1, cursor.y - 0.5, 0.2, 1);
  }
}

export default function AntLab({ active }: { active: boolean }) {
  const worldRef = useRef<Colony | null>(null);
  if (worldRef.current === null) worldRef.current = createColony();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<Point | null>(null);
  const previousRef = useRef<Point | null>(null);
  const pointerRef = useRef<number | null>(null);
  const [config, setConfig] = useState<AntConfig>(DEFAULT_ANT_CONFIG);
  const [scenario, setScenario] = useState<Scenario>("fork");
  const [seed, setSeed] = useState(240914);
  const [appliedSeed, setAppliedSeed] = useState(240914);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [tool, setTool] = useState<FieldTool>("food");
  const [trails, setTrails] = useState(true);
  const [notice, setNotice] = useState("餌を置いてみましょう。壁と消しゴムはドラッグで描けます。");
  const [stats, setStats] = useState({ delivered: 0, carrying: 0, remaining: 700, seconds: 0, history: [0] });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return;
    const resize = () => {
      const width = canvas.getBoundingClientRect().width;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(width * FIELD_HEIGHT / FIELD_WIDTH * dpr));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas); resize();
    let frame = 0;
    let last = 0;
    let lastReadout = 0;
    let accumulator = 0;
    const animate = (now: number) => {
      const world = worldRef.current!;
      if (last && running && !document.hidden) {
        accumulator += Math.min((now - last) / 1000, 0.1) * speed;
        while (accumulator >= TICK_SECONDS) { stepColony(world, config); accumulator -= TICK_SECONDS; }
      }
      last = now;
      drawField(canvas, world, trails, cursorRef.current, tool);
      if (now - lastReadout > 250) { setStats(readout(world)); lastReadout = now; }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [active, running, speed, config, trails, tool]);

  const reset = (nextScenario = scenario, nextConfig = config) => {
    const world = createColony(seed, nextConfig, nextScenario);
    worldRef.current = world;
    setAppliedSeed(seed);
    setStats(readout(world));
    setNotice("巣から探索をやり直します。同じシードと条件で初期状態を再現できます。");
  };
  const position = (event: PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) / bounds.width * FIELD_WIDTH, y: (event.clientY - bounds.top) / bounds.height * FIELD_HEIGHT };
  };
  const paint = (point: Point) => {
    paintField(worldRef.current!, point, tool);
    setStats(readout(worldRef.current!));
  };
  const endStroke = () => { pointerRef.current = null; previousRef.current = null; };
  const recentRate = stats.history.length > 10 ? stats.delivered - stats.history[stats.history.length - 11] : stats.delivered;

  return <section className="ant-lab panel" aria-label="アリの採餌シミュレーション">
    <div className="ant-toolbar">
      <div className="ant-live"><i className={running ? "live" : ""} /><span>{running ? "COLONY ACTIVE" : "PAUSED"}</span><b>{stats.seconds}s</b></div>
      <div className="ant-scenarios" role="group" aria-label="環境プリセット">
        {([['fork', '2つの餌場'], ['detour', '壁の向こう'], ['scatter', '点在する餌']] as const).map(([id, label]) => <button key={id} aria-pressed={scenario === id} onClick={() => { setScenario(id); reset(id); }}>{label}</button>)}
      </div>
      <button onClick={() => reset()}>やり直す ↺</button>
    </div>
    <div className="ant-layout">
      <div className="ant-stage">
        <div className="ant-tools" role="group" aria-label="フィールドに介入">
          <span>環境を変える</span>
          {([['food', '＋ 餌を置く'], ['wall', '▧ 壁を描く'], ['erase', '− 消しゴム']] as const).map(([id, label]) => <button key={id} aria-pressed={tool === id} onClick={() => setTool(id)}>{label}</button>)}
        </div>
        <canvas ref={canvasRef} className="ant-canvas" tabIndex={0} aria-label="アリの採餌フィールド。クリックで餌を追加。壁と消しゴムはドラッグ。キーボードは矢印でカーソル移動、Enterで適用。" aria-describedby="ant-help"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
            pointerRef.current = event.pointerId;
            const point = position(event); cursorRef.current = point; previousRef.current = point; paint(point);
          }}
          onPointerMove={(event) => {
            const point = position(event); cursorRef.current = point;
            if (pointerRef.current !== event.pointerId || tool === "food") return;
            const previous = previousRef.current ?? point;
            const steps = Math.max(1, Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y) / 2));
            for (let i = 1; i <= steps; i += 1) paintField(worldRef.current!, { x: previous.x + (point.x - previous.x) * i / steps, y: previous.y + (point.y - previous.y) * i / steps }, tool);
            previousRef.current = point;
          }}
          onPointerUp={endStroke} onPointerCancel={endStroke} onLostPointerCapture={endStroke}
          onPointerLeave={() => { if (pointerRef.current === null) cursorRef.current = null; }}
          onFocus={() => { cursorRef.current ??= { x: 60, y: 38 }; }} onBlur={() => { cursorRef.current = null; endStroke(); }}
          onKeyDown={(event) => {
            const offsets: Record<string, [number, number]> = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2] };
            const point = cursorRef.current ?? { x: 60, y: 38 };
            if (offsets[event.key]) { event.preventDefault(); const [dx, dy] = offsets[event.key]; cursorRef.current = { x: Math.max(3, Math.min(116, point.x + dx)), y: Math.max(3, Math.min(72, point.y + dy)) }; }
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); paint(point); setNotice(`${tool === "food" ? "餌の追加" : tool === "wall" ? "壁の描画" : "消去"}を適用: 横 ${Math.round(point.x)}、縦 ${Math.round(point.y)}`); }
          }} />
        <div className="ant-legend"><span><i />探索中</span><span><i className="loaded" />餌を運ぶアリ</span><span><i className="scent" />フェロモン</span><label><input type="checkbox" checked={trails} onChange={(event) => setTrails(event.target.checked)} />匂いを表示</label></div>
        <div className="ant-transport"><button className="ant-primary" onClick={() => setRunning(!running)}>{running ? "Ⅱ 一時停止" : "▶ 探索を再開"}</button><button disabled={running} onClick={() => { for (let i = 0; i < 30; i += 1) stepColony(worldRef.current!, config); setStats(readout(worldRef.current!)); }}>1秒進める</button><label>速度<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select></label></div>
        <p id="ant-help" className="ant-help">{notice}</p>
      </div>
      <aside className="ant-sidebar">
        <p className="eyebrow">THE COLLECTIVE</p>
        <div className="ant-total"><strong>{stats.delivered}</strong><span>巣に運んだ餌</span></div>
        <div className="ant-small-stats"><div><strong>{stats.carrying}<small> / {config.count}</small></strong><span>運搬中</span></div><div><strong>{stats.remaining}</strong><span>残りの餌</span></div></div>
        <div className="ant-history" aria-label={`最近の累計回収量。過去最大10秒の回収量 ${recentRate}`}>
          {stats.history.map((amount, index) => <i key={index} style={{ height: `${Math.max(2, amount / Math.max(1, stats.delivered) * 100)}%` }} />)}
        </div>
        <p className="ant-history-label">累計回収量 · 直近最大120秒</p>
        <div className="ant-parameters">
          <label><span>個体数 <small>変更でリセット</small></span><select value={config.count} onChange={(event) => { const next = { ...config, count: Number(event.target.value) }; setConfig(next); reset(scenario, next); }}><option value={60}>60匹</option><option value={120}>120匹</option><option value={240}>240匹</option></select></label>
          <label><span>匂いの残りやすさ <output>{config.halfLife} 秒</output></span><input type="range" min={2} max={40} step={1} value={config.halfLife} onChange={(event) => setConfig({ ...config, halfLife: Number(event.target.value) })} /><small>この時間で濃さが半分に</small></label>
          <label><span>フェロモン量 <output>{config.deposit.toFixed(1)}×</output></span><input type="range" min={0} max={2} step={0.1} value={config.deposit} onChange={(event) => setConfig({ ...config, deposit: Number(event.target.value) })} /><small>0にすると新しい匂いを残しません</small></label>
          <label><span>探索の自由度 <output>{Math.round(config.exploration * 100)}%</output></span><input type="range" min={0} max={1} step={0.05} value={config.exploration} onChange={(event) => setConfig({ ...config, exploration: Number(event.target.value) })} /><small>高いほど匂いに頼らず歩き回ります</small></label>
        </div>
        <div className="ant-interventions"><button onClick={() => { worldRef.current!.pheromone.fill(0); setNotice("フェロモンを消しました。運搬中のアリはまた匂いを残します。"); }}>匂いをすべて消す</button><button onClick={() => { worldRef.current!.food = []; setStats(readout(worldRef.current!)); setNotice("餌場を取り除きました。アリが持っている餌はそのまま運ばれます。別の場所を押して餌を追加できます。"); }}>餌場をすべて取り除く</button></div>
        <div className="ant-seed"><label htmlFor="ant-seed">SEED</label><input id="ant-seed" type="number" min={1} max={999999999} value={seed} onChange={(event) => setSeed(Math.min(999999999, Math.max(1, Math.floor(Number(event.target.value) || 1))))} /><button onClick={() => reset()}>適用</button></div>
        <p className="ant-history-label">実行中のシード {appliedSeed}</p>
      </aside>
    </div>
    <div className="ant-experiments"><div><span>01 / OBSERVE</span><h3>道ができるまで待つ</h3><p>最初の探索から餌の発見、帰巣へ。琥珀色の匂いが重なり、ほかのアリの動きに影響します。</p></div><div><span>02 / INTERRUPT</span><h3>できた道に壁を描く</h3><p>移動を遮る壁を追加。迂回して帰れるか、別の餌場へ向かうか、回収量も比べてみましょう。</p></div><div><span>03 / CHANGE</span><h3>餌場を引っ越す</h3><p>餌場を取り除いて別の場所へ。古い匂いが残る時間を変えると、切り替わり方はどう変わる？</p></div></div>
    <details className="ant-model"><summary>このシミュレーションのルール</summary><p>各個体は前方3方向のフェロモンと、近くの餌（半径11以内・壁の向こうは不可）を感知します。餌を持つ個体には巣の方向が分かる簡略化した帰巣規則を与えています。個体間の情報共有はフェロモンを通じて行い、経路を事前計算する仕組みはありません。壁は感知と移動を遮り、匂いは時間で減衰します。巣・餌・アリのいるマスへの壁の描画は保護されます。</p><p>これは局所ルールで動くマルチエージェントモデルです。既存のハエの神経回路や、生物学的に検証されたアリの脳は使用していません。実験状態は保存されず、画面を再読み込みすると初期状態に戻ります。</p></details>
  </section>;
}
