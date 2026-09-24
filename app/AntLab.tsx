"use client";

import { useEffect, useRef, useState } from "react";
import { createEcosystem, DEFAULT_ANT_CONFIG, FIELD_HEIGHT, FIELD_WIDTH, HABITATS, SEASON_NAMES, stepColony, TICK_SECONDS, type Colony, type Habitat } from "../lib/ants";

function readout(world: Colony) {
  const eco = world.ecology!;
  return { alive: world.ants.length, delivered: world.delivered, carrying: world.ants.filter((ant) => ant.carrying).length,
    hungry: world.ants.filter((ant) => ant.life!.energy < 30).length,
    energy: world.ants.length ? world.ants.reduce((sum, ant) => sum + ant.life!.energy, 0) / world.ants.length : 0,
    remaining: world.food.reduce((sum, food) => sum + food.amount, 0), seconds: Math.floor(world.ticks * TICK_SECONDS),
    stock: eco.stock, births: eco.births, starved: eco.starved, aged: eco.aged, eggs: eco.eggs.length,
    peak: eco.peak, season: eco.season, seasonRemaining: Math.max(0, Math.ceil((eco.seasonEndsAt - world.ticks) * TICK_SECONDS)),
    extinct: eco.extinctAt !== null, history: [...eco.populationHistory], events: [...eco.events] };
}

function drawField(canvas: HTMLCanvasElement, world: Colony, trails: boolean) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const scale = canvas.width / FIELD_WIDTH;
  ctx.setTransform(scale, 0, 0, canvas.height / FIELD_HEIGHT, 0, 0);
  ctx.fillStyle = world.ecology?.season === "dry" ? "#1c1c12" : "#091713";
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
  for (const corpse of world.ecology?.corpses ?? []) {
    ctx.strokeStyle = `rgba(201,126,109,${0.6 * (1 - (world.ticks - corpse.tick) / 450)})`;
    ctx.lineWidth = 0.2;
    ctx.beginPath(); ctx.moveTo(corpse.x - 0.4, corpse.y - 0.4); ctx.lineTo(corpse.x + 0.4, corpse.y + 0.4);
    ctx.moveTo(corpse.x + 0.4, corpse.y - 0.4); ctx.lineTo(corpse.x - 0.4, corpse.y + 0.4); ctx.stroke();
  }
  for (const ant of world.ants) {
    ctx.save(); ctx.translate(ant.x, ant.y); ctx.rotate(ant.heading);
    const color = ant.life && ant.life.energy < 30 ? "#ef997d" : ant.carrying ? "#ffd18b" : "#d9e4cf";
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
}

function PopulationChart({ points }: { points: ReturnType<typeof readout>["history"] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const width = canvas.getBoundingClientRect().width;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = 128 * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const max = Math.max(100, ...points.map((point) => point.population));
      const first = points[0].seconds;
      const last = Math.max(first + 60, points[points.length - 1].seconds);
      ctx.font = "10px monospace";
      ctx.fillStyle = "#8fa589";
      ctx.textAlign = "left";
      ctx.fillText(String(max), 0, 12);
      ctx.fillText("0", 0, 106);
      ctx.strokeStyle = "#294431";
      ctx.beginPath(); ctx.moveTo(27, 105); ctx.lineTo(width, 105); ctx.stroke();
      ctx.strokeStyle = "#c2df9b"; ctx.lineWidth = 2; ctx.beginPath();
      points.forEach((point, index) => {
        const x = 28 + (point.seconds - first) / (last - first) * Math.max(1, width - 33);
        const y = 105 - point.population / max * 92;
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.fillStyle = "#8fa589";
      ctx.fillText(formatTime(first), 27, 124);
      ctx.textAlign = "right";
      ctx.fillText(formatTime(last), width - 1, 124);
    };
    const observer = new ResizeObserver(draw);
    observer.observe(canvas); draw();
    return () => observer.disconnect();
  }, [points]);
  return <canvas className="eco-population-chart" ref={ref} role="img" aria-label={"生存数の推移。現在 " + points[points.length - 1].population + " 匹。横軸は経過時間、縦軸は個体数。"} />;
}

function formatTime(seconds: number) {
  return Math.floor(seconds / 60) + ":" + String(Math.floor(seconds % 60)).padStart(2, "0");
}

export default function AntLab({ active }: { active: boolean }) {
  const worldRef = useRef<Colony | null>(null);
  if (worldRef.current === null) worldRef.current = createEcosystem();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [habitat, setHabitat] = useState<Habitat>("grassland");
  const [seed, setSeed] = useState(240914);
  const [appliedSeed, setAppliedSeed] = useState(240914);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(2);
  const [trails, setTrails] = useState(true);
  const [stats, setStats] = useState(() => readout(createEcosystem()));

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
      if (last && running && !document.hidden && world.ecology!.extinctAt === null) {
        accumulator += Math.min((now - last) / 1000, 0.1) * speed;
        while (accumulator >= TICK_SECONDS) { stepColony(world, DEFAULT_ANT_CONFIG); accumulator -= TICK_SECONDS; }
      }
      last = now;
      drawField(canvas, world, trails);
      if (now - lastReadout > 250) { setStats(readout(world)); lastReadout = now; }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [active, running, speed, trails]);

  const reset = (nextHabitat = habitat, nextSeed = seed) => {
    const world = createEcosystem(nextSeed, nextHabitat);
    worldRef.current = world;
    setHabitat(nextHabitat);
    setSeed(nextSeed);
    setAppliedSeed(nextSeed);
    setStats(readout(world));
    setRunning(true);
  };
  const recentPopulation = stats.history[Math.max(0, stats.history.length - 4)].population;
  const status = stats.extinct ? "絶滅" : stats.alive === 0 ? "幼体が羽化を待っています" : stats.hungry > stats.alive / 3 ? "食糧不足の兆候" : stats.alive > recentPopulation + 2 ? "群れが成長しています" : stats.alive < recentPopulation - 2 ? "群れが減少しています" : "群れは生存中";
  const isRunning = running && !stats.extinct;

  return <section className="ant-lab eco-lab panel" aria-label="アリの自律生態系シミュレーション">
    <div className="ant-toolbar">
      <div className="ant-live"><i className={isRunning ? "live" : ""} /><span>{stats.extinct ? "COLONY EXTINCT" : isRunning ? "LIVING ECOSYSTEM" : "PAUSED"}</span><b>{formatTime(stats.seconds)}</b></div>
      <div className="ant-scenarios" role="group" aria-label="生息環境を選んで新しい観察を開始">
        {(Object.keys(HABITATS) as Habitat[]).map((id) => <button key={id} aria-pressed={habitat === id} onClick={() => reset(id)}>{HABITATS[id].name}</button>)}
      </div>
      <button onClick={() => reset(habitat, appliedSeed % 999999999 + 1)}>別の世界を観察 ↗</button>
    </div>
    <div className="ant-layout">
      <div className="ant-stage">
        <div className={"eco-weather " + stats.season}>
          <div><span className="eyebrow">AUTONOMOUS WORLD</span><strong>{SEASON_NAMES[stats.season]}</strong><p>{stats.season === "dry" ? "新しい餌は育ちません。残った餌と巣の蓄えが頼りです。" : "新しい餌場が自然に発生しています。古い餌は時間とともに枯れます。"}</p></div>
          <span>{stats.extinct ? "観察終了" : "次の季節まで " + stats.seasonRemaining + " 秒"}</span>
        </div>
        <div className="eco-field-wrap">
          <canvas ref={canvasRef} className="ant-canvas" role="img" aria-label="自律的に採餌・帰巣するアリの生態系。赤い個体は空腹、×印は死亡した個体。" />
          {stats.extinct && <div className="eco-extinction" role="status"><span>END OF THIS COLONY</span><h2>群れは、ここで途絶えました。</h2><p>生存時間 {formatTime(stats.seconds)} · 最大 {stats.peak} 匹 · 誕生 {stats.births} 匹</p><button onClick={() => reset(habitat, appliedSeed % 999999999 + 1)}>別の世界を観察する</button></div>}
        </div>
        <div className="ant-legend"><span><i />探索中</span><span><i className="loaded" />運搬中</span><span><i className="hungry" />空腹</span><span>× 死亡</span><label><input type="checkbox" checked={trails} onChange={(event) => setTrails(event.target.checked)} />フェロモンを表示</label></div>
        <div className="ant-transport">
          <button className="ant-primary" disabled={stats.extinct} onClick={() => setRunning(!running)}>{isRunning ? "Ⅱ 一時停止" : "▶ 観察を再開"}</button>
          <button disabled={isRunning || stats.extinct} onClick={() => { for (let i = 0; i < 30; i += 1) stepColony(worldRef.current!, DEFAULT_ANT_CONFIG); setStats(readout(worldRef.current!)); }}>1秒進める</button>
          <label>観察速度<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option><option value={8}>8×</option></select></label>
        </div>
        <p className="ant-help">操作せずに眺められます。餌の発生・空腹・繁殖・死は自動で進みます。時間はモデル内の秒数です。</p>
        <div className="eco-chart-head"><h3>生存数の推移</h3><span>開始 80 匹 / 最大 {stats.peak} 匹</span></div>
        <PopulationChart points={stats.history} />
        <p className="ant-history-label">5秒ごとの個体数 · 直近最大30分</p>
      </div>
      <aside className="ant-sidebar eco-sidebar">
        <p className="eyebrow">COLONY SURVIVAL</p>
        <div className="ant-total"><strong>{stats.alive}<small> 匹</small></strong><span>現在の生存数</span></div>
        <p className={"eco-status" + (stats.extinct ? " danger" : "")} role="status">{status}</p>
        <div className="ant-small-stats"><div><strong>{stats.births}</strong><span>累計出生</span></div><div><strong>{stats.starved + stats.aged}</strong><span>累計死亡</span></div></div>
        <div className="eco-causes"><span>餓死 <b>{stats.starved}</b></span><span>寿命 <b>{stats.aged}</b></span></div>
        <div className="eco-energy"><span>平均エネルギー <b>{Math.round(stats.energy)}%</b></span><meter min={0} max={100} low={30} high={60} optimum={90} value={stats.energy} aria-label="平均エネルギー" /><small>空腹の個体 {stats.hungry} 匹</small></div>
        <div className="eco-resources"><div><span>巣の蓄え</span><strong>{stats.stock}</strong></div><div><span>育成中の幼体</span><strong>{stats.eggs}</strong></div><div><span>野外に残る餌</span><strong>{stats.remaining}</strong></div><div><span>運搬中</span><strong>{stats.carrying}</strong></div></div>
        <div className="eco-events"><h3>この世界の出来事</h3><ol>{stats.events.map((item) => <li key={item.tick + "-" + item.text}><time>{formatTime(item.tick * TICK_SECONDS)}</time><p>{item.text}</p></li>)}</ol></div>
      </aside>
    </div>
    <div className="ant-experiments"><div><span>01 / GROWTH</span><h3>蓄えが、次の命になる</h3><p>持ち帰った餌で空腹を満たし、余裕があれば幼体を育てます。15秒の育成期間のあと、新しい個体が巣を出ます。</p></div><div><span>02 / PRESSURE</span><h3>増えた群れに、乾季が来る</h3><p>雨季・乾季・回復期が繰り返されます。個体数が増えるほど必要な食糧も増え、採餌と蓄えが生存を左右します。</p></div><div><span>03 / SURVIVAL</span><h3>生き延びるか、途絶えるか</h3><p>空腹と寿命で個体が減り、次世代が育てば群れが続きます。成体と幼体がいなくなると絶滅し、その世界の観察を終えます。</p></div></div>
    <details className="ant-model"><summary>初期条件と再現</summary><p>{HABITATS[habitat].name}：{HABITATS[habitat].description}。開始は80匹、実行中の SEED は {appliedSeed} です。環境の切り替え・シードの適用は新しい観察を開始します。</p><div className="ant-seed eco-seed"><label htmlFor="ant-seed">SEED</label><input id="ant-seed" type="number" min={1} max={999999999} value={seed} onChange={(event) => setSeed(Math.min(999999999, Math.max(1, Math.floor(Number(event.target.value) || 1))))} /><button onClick={() => reset()}>この条件でやり直す</button></div></details>
    <details className="ant-model"><summary>この生態系のルール</summary><p>これは局所ルールで動くマルチエージェントモデルです。近くの餌と前方3方向のフェロモンを感知し、餌を運ぶ個体や空腹の個体は、簡略化した帰巣コンパスで巣へ向かいます。餌は野外でも巣でもエネルギーに変わります。エネルギーが尽きるか、個体ごとの寿命に達すると死亡します。</p><p>繁殖は巣の蓄えを使うコロニー単位の規則で、働きアリの交配を表すものではありません。幼体の育成費は最初に消費し、15秒後に羽化します。計算負荷を抑えるため成体と幼体の合計は最大240匹です。季節・寿命・育成期間は観察用に短縮した人工的な時間設定で、生物学的に検証された再現ではありません。</p><p>開いている間に自動で進みます。別モード・非表示タブでは休止し、再読み込みすると初期状態へ戻ります。絶滅後の自動リセットはありません。</p></details>
  </section>;
}
