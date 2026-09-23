"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MazeLab from "./MazeLab";
import {
  actionLabel,
  createSimulation,
  GROUPS,
  meanRate,
  PRESETS,
  stepSimulation,
  type SimulationState,
  type Stimulus,
} from "../lib/simulation";

type ExperimentRecord = {
  id: string;
  createdAt: string;
  preset: string;
  seed: number;
  timeMs: number;
  stimulus: Stimulus;
  totalSpikes: number;
  meanRate: number;
  turn: number;
  action: string;
  weightDelta: number;
};

const STORAGE_KEY = "flylab-experiments-v1";

function formatTime(milliseconds: number) {
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

function Slider({ label, value, min = 0, max = 1, step = 0.01, tone, onChange }: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  tone: string;
  onChange: (value: number) => void;
}) {
  const percentage = ((value - min) / (max - min)) * 100;
  return (
    <label className="slider-control" style={{ "--slider-tone": tone } as React.CSSProperties}>
      <span><span>{label}</span><output>{value.toFixed(2)}</output></span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ "--slider-fill": `${percentage}%` } as React.CSSProperties}
      />
    </label>
  );
}

function useCanvasSize(ref: React.RefObject<HTMLCanvasElement | null>) {
  const [size, setSize] = useState("");
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      setSize(`${canvas.width}x${canvas.height}`);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

function NetworkCanvas({ state }: { state: SimulationState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasSize = useCanvasSize(canvasRef);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const toPoint = (neuron: SimulationState["neurons"][number]) => ({
      x: neuron.x * width,
      y: neuron.y * height,
    });

    context.lineWidth = 0.55;
    for (const synapse of state.synapses) {
      const source = state.neurons[synapse.source];
      const target = state.neurons[synapse.target];
      const a = toPoint(source);
      const b = toPoint(target);
      const active = source.spike;
      context.strokeStyle = active
        ? synapse.weight < 0 ? "rgba(255,104,92,.82)" : "rgba(151,244,116,.9)"
        : synapse.plastic ? "rgba(168,160,255,.11)" : "rgba(116,203,198,.065)";
      context.lineWidth = active ? 1.35 : 0.55;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }

    context.textAlign = "center";
    context.textBaseline = "middle";
    for (const group of GROUPS) {
      const gx = group.x * width;
      const gy = group.y * height;
      const radius = 36 + group.count * 0.8;
      const gradient = context.createRadialGradient(gx, gy, 3, gx, gy, radius);
      gradient.addColorStop(0, `${group.color}22`);
      gradient.addColorStop(1, "rgba(7,20,20,0)");
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(gx, gy, radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "rgba(225,239,234,.46)";
      context.font = "10px var(--font-geist-mono), monospace";
      context.fillText(group.short, gx, gy - radius - 6);
    }

    for (const neuron of state.neurons) {
      const point = toPoint(neuron);
      const color = GROUPS.find((group) => group.id === neuron.group)?.color ?? "#fff";
      if (neuron.spike) {
        context.shadowColor = color;
        context.shadowBlur = 13;
        context.fillStyle = "#f2fff3";
      } else {
        context.shadowBlur = 0;
        context.fillStyle = `${color}${Math.round(75 + neuron.potential * 150).toString(16).padStart(2, "0")}`;
      }
      context.beginPath();
      context.arc(point.x, point.y, neuron.spike ? 3.8 : 2.2, 0, Math.PI * 2);
      context.fill();
    }
    context.shadowBlur = 0;
  }, [state, canvasSize]);

  return <canvas ref={canvasRef} className="network-canvas" aria-label="縮約神経回路の活動表示" />;
}

function ActivityChart({ state }: { state: SimulationState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasSize = useCanvasSize(canvasRef);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.strokeStyle = "rgba(169,195,188,.1)";
    context.lineWidth = 1;
    for (let row = 1; row < 4; row += 1) {
      context.beginPath();
      context.moveTo(0, (height / 4) * row);
      context.lineTo(width, (height / 4) * row);
      context.stroke();
    }
    const series = [
      ["sensory", "#9bf27c"],
      ["integration", "#70dfd0"],
      ["memory", "#a8a0ff"],
      ["motor", "#71b7ff"],
    ] as const;
    for (const [key, color] of series) {
      context.strokeStyle = color;
      context.lineWidth = 1.5;
      context.beginPath();
      state.history.forEach((point, index) => {
        const x = state.history.length <= 1 ? 0 : (index / 119) * width;
        const y = height - Math.min(point[key] * 4.2, 1) * (height - 3);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    }
  }, [state.history, canvasSize]);
  return <canvas ref={canvasRef} className="activity-canvas" aria-label="集団発火率の時系列" />;
}

function Trajectory({ state }: { state: SimulationState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasSize = useCanvasSize(canvasRef);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = "rgba(132,170,160,.07)";
    for (let x = 12; x < width; x += 18) {
      for (let y = 12; y < height; y += 18) {
        context.beginPath();
        context.arc(x, y, 0.8, 0, Math.PI * 2);
        context.fill();
      }
    }
    const map = (point: { x: number; y: number }) => ({
      x: width / 2 + point.x * width * 0.42,
      y: height / 2 + point.y * height * 0.42,
    });
    context.strokeStyle = "rgba(112,223,208,.55)";
    context.lineWidth = 1.6;
    context.beginPath();
    state.path.forEach((point, index) => {
      const mapped = map(point);
      if (index === 0) context.moveTo(mapped.x, mapped.y);
      else context.lineTo(mapped.x, mapped.y);
    });
    context.stroke();
    const current = map({ x: state.x, y: state.y });
    context.save();
    context.translate(current.x, current.y);
    context.rotate(state.heading + Math.PI / 2);
    context.fillStyle = "#b7f686";
    context.shadowColor = "#9bf27c";
    context.shadowBlur = 10;
    context.beginPath();
    context.ellipse(0, 0, 3.5, 7, 0, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.moveTo(0, -10);
    context.lineTo(-3, -4);
    context.lineTo(3, -4);
    context.closePath();
    context.fill();
    context.restore();
  }, [state, canvasSize]);
  return <canvas ref={canvasRef} className="trajectory-canvas" aria-label="人工的な運動出力による軌跡" />;
}

export default function FlyLab() {
  const [mode, setMode] = useState<"maze" | "circuit">("maze");
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [stimulus, setStimulus] = useState<Stimulus>(PRESETS[0].stimulus);
  const [seed, setSeed] = useState(240914);
  const [state, setState] = useState(() => createSimulation(240914));
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [records, setRecords] = useState<ExperimentRecord[]>([]);
  const stimulusRef = useRef(stimulus);

  useEffect(() => {
    stimulusRef.current = stimulus;
  }, [stimulus]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) setRecords(JSON.parse(stored));
      } catch {
        // Storage can be unavailable in privacy-focused browser modes.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => {
      setState((current) => {
        let next = current;
        for (let index = 0; index < speed; index += 1) next = stepSimulation(next, stimulusRef.current);
        return next;
      });
    }, 40);
    return () => window.clearInterval(interval);
  }, [running, speed]);

  const updateStimulus = (key: keyof Stimulus, value: number | boolean) => {
    setStimulus((current) => ({ ...current, [key]: value }));
  };

  const reset = useCallback((nextSeed = seed) => {
    setRunning(false);
    setState(createSimulation(nextSeed));
  }, [seed]);

  const selectPreset = (id: string) => {
    const preset = PRESETS.find((item) => item.id === id);
    if (!preset) return;
    setPresetId(id);
    setStimulus({ ...preset.stimulus });
    reset(seed);
  };

  const saveRecord = () => {
    const preset = PRESETS.find((item) => item.id === presetId)?.name ?? "自由実験";
    const record: ExperimentRecord = {
      id: `${Date.now()}-${seed}`,
      createdAt: new Date().toISOString(),
      preset,
      seed,
      timeMs: state.timeMs,
      stimulus,
      totalSpikes: state.totalSpikes,
      meanRate: meanRate(state),
      turn: state.turn,
      action: actionLabel(state.turn, state.forward),
      weightDelta: state.weightDelta,
    };
    const next = [record, ...records].slice(0, 24);
    setRecords(next);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* no-op */ }
  };

  const removeRecord = (id: string) => {
    const next = records.filter((record) => record.id !== id);
    setRecords(next);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* no-op */ }
  };

  const clearRecords = () => {
    setRecords([]);
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* no-op */ }
  };

  const exportCsv = () => {
    const header = ["created_at", "preset", "seed", "duration_ms", "left_light", "right_light", "odor", "reward", "noise", "plasticity", "spikes", "mean_rate", "turn", "action", "weight_delta"];
    const rows = records.map((record) => [
      record.createdAt, record.preset, record.seed, record.timeMs,
      record.stimulus.leftLight, record.stimulus.rightLight, record.stimulus.odor,
      record.stimulus.reward, record.stimulus.noise, record.stimulus.plasticity,
      record.totalSpikes, record.meanRate, record.turn, record.action, record.weightDelta,
    ]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "flylab-experiments.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const currentPreset = useMemo(() => PRESETS.find((preset) => preset.id === presetId) ?? PRESETS[0], [presetId]);
  const action = actionLabel(state.turn, state.forward);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="FlyLab ホーム">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span><strong>FLYLAB</strong><small>reduced connectome sandbox</small></span>
        </a>
        <div className="model-badge"><span /> MODEL / 84N · {state.synapses.length}S</div>
        <div className="run-state" aria-live="polite">{mode === "maze" ? "MAZE EXPLORER" : <><span className={running ? "is-running" : ""} />{running ? "RUNNING" : "PAUSED"} · {formatTime(state.timeMs)}</>}</div>
      </header>

      <section className="intro" id="top">
        <div>
          <p className="eyebrow">MALECNS-INSPIRED / EXPERIMENT 01</p>
          <h1>小さな回路で、<br /><em>ハエの選択</em>を観る。</h1>
        </div>
        <div className="intro-copy">
          <p>迷路をつくって、ハエの探索を観察。光、匂い、報酬を入力する回路実験も試せます。</p>
          <p className="scope-note"><b>モデルの範囲</b> MaleCNS v1.0 の実データそのものではなく、情報伝播の実験用に設計した縮約 LIF 回路です。</p>
        </div>
      </section>

      <div className="experiment-modes" role="group" aria-label="実験モード">
        <button aria-pressed={mode === "maze"} onClick={() => { setMode("maze"); setRunning(false); }}>迷路を解く</button>
        <button aria-pressed={mode === "circuit"} onClick={() => setMode("circuit")}>回路を観察する</button>
      </div>
      <div hidden={mode !== "maze"}><MazeLab active={mode === "maze"} renderNetwork={(brain) => <NetworkCanvas state={brain} />} /></div>
      <div hidden={mode !== "circuit"}>
      <section className="lab-grid">
        <aside className="control-panel panel">
          <div className="panel-heading"><span>01</span><div><p>STIMULUS</p><h2>実験条件</h2></div></div>
          <div className="preset-list" role="list" aria-label="実験プリセット">
            {PRESETS.map((preset) => (
              <button key={preset.id} className={preset.id === presetId ? "preset active" : "preset"} onClick={() => selectPreset(preset.id)}>
                <span>{preset.shortName}</span><strong>{preset.name}</strong><i aria-hidden="true">{preset.id === presetId ? "●" : "○"}</i>
              </button>
            ))}
          </div>
          <div className="question-box"><span>観察する問い</span><p>{currentPreset.question}</p></div>
          <div className="sliders">
            <Slider label="左の光" value={stimulus.leftLight} tone="#9bf27c" onChange={(value) => updateStimulus("leftLight", value)} />
            <Slider label="右の光" value={stimulus.rightLight} tone="#9bf27c" onChange={(value) => updateStimulus("rightLight", value)} />
            <Slider label="匂い" value={stimulus.odor} tone="#f2c66d" onChange={(value) => updateStimulus("odor", value)} />
            <Slider label="報酬 / 嫌悪" value={stimulus.reward} min={-1} tone="#ff8e72" onChange={(value) => updateStimulus("reward", value)} />
            <Slider label="ノイズ" value={stimulus.noise} tone="#a8a0ff" onChange={(value) => updateStimulus("noise", value)} />
          </div>
          <label className="toggle-row">
            <span><strong>可塑性</strong><small>記憶 → 運動の重み更新</small></span>
            <input type="checkbox" checked={stimulus.plasticity} onChange={(event) => updateStimulus("plasticity", event.target.checked)} />
            <i aria-hidden="true" />
          </label>
          <div className="seed-row">
            <label htmlFor="seed">SEED</label>
            <input id="seed" type="number" min="1" max="999999999" value={seed} onChange={(event) => setSeed(Math.max(1, Number(event.target.value) || 1))} />
            <button onClick={() => reset(seed)}>適用</button>
          </div>
        </aside>

        <section className="scope-panel panel">
          <div className="panel-heading compact"><span>02</span><div><p>NEURAL FIELD</p><h2>回路活動</h2></div><div className="scope-stats"><b>{state.lastStepSpikes}</b><small>SPIKES / STEP</small></div></div>
          <div className="network-wrap">
            <NetworkCanvas state={state} />
            <div className="canvas-corners" aria-hidden="true"><i /><i /><i /><i /></div>
            <span className="canvas-time">t + {String(state.stepCount).padStart(5, "0")}</span>
          </div>
          <div className="legend">
            {GROUPS.map((group) => <span key={group.id}><i style={{ background: group.color }} />{group.label}<b>{Math.round(state.groupRates[group.id] * 100)}%</b></span>)}
          </div>
          <div className="activity-strip">
            <div className="chart-header"><span>POPULATION FIRING / 9.6 s WINDOW</span><span className="chart-keys"><i className="sensory" />感覚 <i className="memory" />記憶 <i className="motor" />運動</span></div>
            <ActivityChart state={state} />
          </div>
          <div className="transport">
            <button className="primary-action" onClick={() => setRunning((value) => !value)}><span aria-hidden="true">{running ? "Ⅱ" : "▶"}</span>{running ? "一時停止" : "実験開始"}</button>
            <button onClick={() => setState((current) => stepSimulation(current, stimulus))} disabled={running}>1 STEP</button>
            <button onClick={() => reset(seed)}>RESET</button>
            <label><span>SPEED</span><select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option></select></label>
          </div>
        </section>

        <aside className="readout-panel panel">
          <div className="panel-heading"><span>03</span><div><p>READOUT</p><h2>行動出力</h2></div></div>
          <div className="action-readout">
            <span>CURRENT ACTION</span><strong>{action}</strong>
            <div className="turn-meter"><i style={{ left: `${50 + state.turn * 45}%` }} /><span>LEFT</span><span>CENTER</span><span>RIGHT</span></div>
          </div>
          <Trajectory state={state} />
          <div className="metric-grid">
            <div><span>TURN</span><strong>{state.turn >= 0 ? "+" : ""}{state.turn.toFixed(2)}</strong></div>
            <div><span>FORWARD</span><strong>{state.forward.toFixed(2)}</strong></div>
            <div><span>TOTAL SPIKES</span><strong>{state.totalSpikes.toLocaleString()}</strong></div>
            <div><span>Δ WEIGHT</span><strong className={state.weightDelta >= 0 ? "positive" : "negative"}>{state.weightDelta >= 0 ? "+" : ""}{state.weightDelta.toFixed(3)}</strong></div>
          </div>
          <div className="interpretation">
            <span>読み方</span>
            <p>左右運動集団の平滑化発火率の差を旋回量へ変換しています。これは人工的な読み出し規則です。</p>
          </div>
          <button className="save-button" onClick={saveRecord} disabled={state.stepCount === 0}>この結果を記録 <span>＋</span></button>
        </aside>
      </section>

      <section className="notebook panel">
        <div className="notebook-head">
          <div className="panel-heading"><span>04</span><div><p>EXPERIMENT NOTEBOOK</p><h2>実験記録</h2></div></div>
          <div><button onClick={exportCsv} disabled={!records.length}>CSVを書き出す</button><button onClick={clearRecords} disabled={!records.length}>すべて消去</button></div>
        </div>
        {records.length ? (
          <div className="table-wrap"><table><thead><tr><th>日時</th><th>実験</th><th>SEED</th><th>時間</th><th>発火数</th><th>平均率</th><th>行動</th><th>Δ 重み</th><th><span className="sr-only">操作</span></th></tr></thead>
          <tbody>{records.map((record) => <tr key={record.id}><td>{new Date(record.createdAt).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</td><td><b>{record.preset}</b></td><td>{record.seed}</td><td>{formatTime(record.timeMs)}</td><td>{record.totalSpikes.toLocaleString()}</td><td>{(record.meanRate * 100).toFixed(1)}%</td><td>{record.action}</td><td>{record.weightDelta >= 0 ? "+" : ""}{record.weightDelta.toFixed(3)}</td><td><button aria-label={`${record.preset}の記録を削除`} onClick={() => removeRecord(record.id)}>×</button></td></tr>)}</tbody></table></div>
        ) : <div className="empty-notebook"><span>NO RECORDS YET</span><p>シミュレーションを動かし、「この結果を記録」を押すと比較表がここに残ります。</p></div>}
      </section>

      </div>
      <footer>
        <div><strong>FLYLAB</strong><span>MaleCNS-inspired reduced circuit simulator</span></div>
        <p>このアプリは教育・探索用です。生物学的な忠実性、意識、痛覚、学習能力を再現・証明するものではありません。</p>
        <nav aria-label="参考資料"><a href="https://github.com/natverse/malecns" target="_blank" rel="noreferrer">MALECNS ↗</a><a href="https://github.com/nftechie/stonkfly" target="_blank" rel="noreferrer">STONKFLY ↗</a></nav>
      </footer>
    </main>
  );
}
