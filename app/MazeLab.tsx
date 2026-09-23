"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createMaze, createMazeRun, editMaze, mazeSenses, shortestDistance, stepMaze, type Maze } from "../lib/maze";
import { createSimulation, stepSimulation, type SimulationState } from "../lib/simulation";

function experiment(maze: Maze) {
  return { maze, run: createMazeRun(maze), brain: createSimulation(maze.seed), running: false };
}

function advance(current: ReturnType<typeof experiment>) {
  if (current.run.status === "solved" || current.run.status === "unreachable") return current;
  let brain = current.brain;
  const stimulus = { ...mazeSenses(current.maze, current.run), noise: 0.12, plasticity: false };
  for (let i = 0; i < 8; i += 1) brain = stepSimulation(brain, stimulus);
  const run = stepMaze(current.maze, current.run, brain.turn);
  return { ...current, brain, run, running: current.running && run.status === "exploring" };
}

export default function MazeLab({ active, renderNetwork }: { active: boolean; renderNetwork: (state: SimulationState) => ReactNode }) {
  const [state, setState] = useState(() => experiment(createMaze()));
  const [size, setSize] = useState(15);
  const [seed, setSeed] = useState(240914);
  const [speed, setSpeed] = useState(1);
  const [editing, setEditing] = useState(false);
  const [tool, setTool] = useState<"wall" | "start" | "goal">("wall");
  const [focusCell, setFocusCell] = useState(16);
  const { maze, run, brain, running } = state;
  const shortest = useMemo(() => shortestDistance(maze), [maze]);
  const visited = new Set(run.visited);
  const route = new Set(run.stack);
  const finished = run.status === "solved" || run.status === "unreachable";

  useEffect(() => {
    if (!running || !active) return;
    const interval = window.setInterval(() => setState(advance), 180 / speed);
    return () => window.clearInterval(interval);
  }, [running, speed, active]);

  const replace = (next: Maze) => {
    setState(experiment(next));
    setFocusCell(next.start);
  };
  const status = run.status === "solved" ? "ゴールに到達！" : run.status === "unreachable" ? "探索完了 · ゴールに届く道がありません" : running ? "探索中" : run.moves ? "一時停止中" : "スタートで待機中";

  return (
    <section className="maze-lab panel" aria-label="迷路実験">
      <div className="maze-heading">
        <div><p className="eyebrow">MAZE / EXPERIMENT 02</p><h2>道をつくって、ハエに解かせる。</h2><p>迷路を生成するか、編集して自分だけのコースを作成。ハエの探索を追いかけましょう。</p></div>
        <span className="maze-badge">84 NEURONS · LOCAL EXPLORATION</span>
      </div>
      <div className="maze-layout">
        <div className="maze-workspace">
          <div className="maze-controls">
            <label>サイズ<select value={size} onChange={(event) => setSize(Number(event.target.value))}><option value={11}>小 · 11 × 11</option><option value={15}>中 · 15 × 15</option><option value={21}>大 · 21 × 21</option></select></label>
            <label>迷路 SEED<input type="number" min={1} max={999999999} value={seed} onChange={(event) => setSeed(Math.min(999999999, Math.max(1, Math.floor(Number(event.target.value) || 1))))} /></label>
            <button onClick={() => replace(createMaze(size, seed))}>この条件で生成</button>
            <button onClick={() => { const nextSeed = seed % 999999999 + 1; setSeed(nextSeed); replace(createMaze(size, nextSeed)); }}>別の迷路</button>
          </div>
          <div className="maze-editor">
            <button aria-pressed={editing} onClick={() => { setEditing(!editing); setState((current) => ({ ...current, running: false })); }}>{editing ? "編集を終える" : "迷路を編集"}</button>
            {editing && <div className="maze-tools" role="group" aria-label="編集ツール">{(["wall", "start", "goal"] as const).map((value) => <button key={value} aria-pressed={tool === value} onClick={() => setTool(value)}>{value === "wall" ? "壁 / 通路" : value === "start" ? "スタート" : "ゴール"}</button>)}</div>}
            <span>{editing ? "マスを押して編集 · 変更すると探索をリセット" : `現在の迷路 ${maze.size} × ${maze.size} / SEED ${maze.seed}`}</span>
          </div>
          <div className="maze-board" role="group" aria-label="迷路。矢印キーでマスを移動し、編集中は Enter またはスペースで変更" style={{ gridTemplateColumns: `repeat(${maze.size}, 1fr)` }}>
            {maze.walls.map((wall, cell) => {
              const fly = cell === run.position;
              const start = cell === maze.start;
              const goal = cell === maze.goal;
              const label = `${Math.floor(cell / maze.size) + 1}行 ${cell % maze.size + 1}列: ${start ? "スタート" : goal ? "ゴール" : wall ? "壁" : "通路"}${fly ? "、ハエの現在地" : ""}`;
              return <button key={cell} type="button" tabIndex={cell === focusCell ? 0 : -1} aria-label={label} aria-disabled={!editing} className={`maze-cell${wall ? " wall" : ""}${visited.has(cell) ? " visited" : ""}${route.has(cell) ? " route" : ""}${start ? " start" : ""}${goal ? " goal" : ""}`}
                onFocus={() => setFocusCell(cell)}
                onKeyDown={(event) => {
                  const offsets: Record<string, number> = { ArrowUp: -maze.size, ArrowDown: maze.size, ArrowLeft: -1, ArrowRight: 1 };
                  const offset = offsets[event.key];
                  if (offset === undefined) return;
                  event.preventDefault();
                  const next = cell + offset;
                  if (next < 0 || next >= maze.walls.length || (Math.abs(offset) === 1 && Math.floor(next / maze.size) !== Math.floor(cell / maze.size))) return;
                  (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus();
                }}
                onClick={() => {
                  if (!editing) return;
                  const next = editMaze(maze, cell, tool);
                  if (next !== maze) setState(experiment(next));
                }}>
                {fly ? <span className="maze-fly" style={{ transform: `rotate(${run.heading * 90}deg)` }} aria-hidden="true" /> : start ? "S" : goal ? "G" : visited.has(cell) ? "·" : ""}
              </button>;
            })}
          </div>
          <div className="maze-legend"><span><i className="fly-key" />ハエ</span><span>S スタート</span><span>G ゴール</span><span><i className="route-key" />現在の経路</span><span><i className="visited-key" />探索済み</span></div>
          <div className="transport maze-transport">
            <button className="primary-action" disabled={editing || finished} onClick={() => setState((current) => ({ ...current, running: !current.running }))}>{running ? "一時停止" : run.moves ? "探索を再開" : "ハエに解かせる"}</button>
            <button disabled={editing || running || finished} onClick={() => setState(advance)}>1 歩進める</button>
            <button onClick={() => setState(experiment(maze))}>最初から</button>
            <label>速度<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option><option value={8}>8×</option></select></label>
          </div>
        </div>
        <aside className="maze-readout">
          <p className="eyebrow">EXPLORATION LOG</p>
          <h3 role="status">{status}</h3>
          {shortest === null && <p className="maze-warning">スタートとゴールがつながっていません。壁を編集して通路を作れます。探索を実行して行き止まりを観察することもできます。</p>}
          <div className="metric-grid">
            <div><span>移動した歩数</span><strong>{run.moves}</strong></div><div><span>最短距離</span><strong>{shortest ?? "—"}</strong></div>
            <div><span>探索したマス</span><strong>{run.visited.length}</strong></div><div><span>戻った歩数</span><strong>{run.backtracks}</strong></div>
          </div>
          {run.status === "solved" && <p className="maze-success">{run.moves} 歩で到達しました。最短距離は {shortest} 歩です。「最初から」で同じ探索を再現できます。</p>}
          <div className="maze-network">{renderNetwork(brain)}</div>
          <div className="maze-brain-stats"><span>発火数 {brain.totalSpikes}</span><span>旋回出力 {brain.turn.toFixed(2)}</span></div>
          <div className="maze-explanation"><h3>どうやって解く？</h3><p>左右の通路を光、前方の通路を嗅覚入力に変換し、84 個のニューロンを動かします。旋回出力で、未探索の通路を調べる順番を選びます。</p><p>探索済みの記憶と、行き止まりから戻る動作には深さ優先探索の補助ルールを使います。移動は 1 マスずつで、前進出力は速度に使いません。最短距離は比較表示専用です。</p><p>このモードは学習・実際のハエの迷路解決能力を再現するものではありません。可塑性は OFF 固定です。</p></div>
        </aside>
      </div>
    </section>
  );
}
