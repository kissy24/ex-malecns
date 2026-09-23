export type Maze = {
  size: number;
  seed: number;
  walls: boolean[];
  start: number;
  goal: number;
};

export type MazeRun = {
  position: number;
  heading: number;
  visited: number[];
  stack: number[];
  trail: number[];
  moves: number;
  backtracks: number;
  status: "ready" | "exploring" | "solved" | "unreachable";
};

// Clockwise: north, east, south, west. Never wrap between rows.
export function neighbor(maze: Maze, cell: number, direction: number): number | null {
  const dx = [0, 1, 0, -1][direction];
  const dy = [-1, 0, 1, 0][direction];
  const x = cell % maze.size + dx;
  const y = Math.floor(cell / maze.size) + dy;
  if (x < 0 || y < 0 || x >= maze.size || y >= maze.size) return null;
  const next = y * maze.size + x;
  return maze.walls[next] ? null : next;
}

export function createMaze(size = 15, seed = 240914): Maze {
  if (!Number.isInteger(size) || size < 7 || size > 25 || size % 2 === 0) {
    throw new RangeError("Maze size must be an odd integer between 7 and 25");
  }
  let rng = seed >>> 0 || 1;
  const random = () => {
    rng ^= rng << 13;
    rng ^= rng >>> 17;
    rng ^= rng << 5;
    return (rng >>> 0) / 4294967296;
  };
  const maze: Maze = { size, seed, walls: Array(size * size).fill(true), start: size + 1, goal: size * (size - 1) - 2 };
  const stack = [maze.start];
  maze.walls[maze.start] = false;
  while (stack.length) {
    const cell = stack[stack.length - 1];
    const x = cell % size;
    const y = Math.floor(cell / size);
    const options = [[0, -2], [2, 0], [0, 2], [-2, 0]]
      .map(([dx, dy]) => ({ x: x + dx, y: y + dy, middle: cell + dy / 2 * size + dx / 2 }))
      .filter((p) => p.x > 0 && p.y > 0 && p.x < size - 1 && p.y < size - 1 && maze.walls[p.y * size + p.x]);
    if (!options.length) { stack.pop(); continue; }
    const chosen = options[Math.floor(random() * options.length)];
    const next = chosen.y * size + chosen.x;
    maze.walls[chosen.middle] = false;
    maze.walls[next] = false;
    stack.push(next);
  }
  return maze;
}

export function createMazeRun(maze: Maze): MazeRun {
  return { position: maze.start, heading: 1, visited: [maze.start], stack: [maze.start], trail: [maze.start], moves: 0, backtracks: 0, status: "ready" };
}

export function editMaze(maze: Maze, cell: number, tool: "wall" | "start" | "goal"): Maze {
  const x = cell % maze.size;
  const y = Math.floor(cell / maze.size);
  if (!Number.isInteger(cell) || x <= 0 || y <= 0 || x >= maze.size - 1 || y >= maze.size - 1) return maze;
  if (cell === maze.start || cell === maze.goal) return maze;
  const walls = [...maze.walls];
  walls[cell] = tool === "wall" ? !walls[cell] : false;
  return { ...maze, walls, ...(tool === "wall" ? {} : { [tool]: cell }) };
}

// This reference distance is only for the UI. The explorer never receives it.
export function shortestDistance(maze: Maze): number | null {
  const queue = [maze.start];
  const distances = new Map([[maze.start, 0]]);
  for (let index = 0; index < queue.length; index += 1) {
    const cell = queue[index];
    const distance = distances.get(cell)!;
    if (cell === maze.goal) return distance;
    for (let direction = 0; direction < 4; direction += 1) {
      const next = neighbor(maze, cell, direction);
      if (next !== null && !distances.has(next)) {
        distances.set(next, distance + 1);
        queue.push(next);
      }
    }
  }
  return null;
}

export function mazeSenses(maze: Maze, run: MazeRun) {
  const open = (offset: number) => neighbor(maze, run.position, (run.heading + offset) % 4) !== null ? 0.9 : 0.08;
  return { leftLight: open(3), rightLight: open(1), odor: open(0), reward: run.position === maze.goal ? 1 : 0 };
}

// An explicit DFS memory scaffold prevents loops. Motor output only orders
// unseen local neighbors; neither a shortest path nor the goal direction is used.
export function stepMaze(maze: Maze, run: MazeRun, turn: number): MazeRun {
  if (run.status === "solved" || run.status === "unreachable") return run;
  if (run.position === maze.goal) return { ...run, status: "solved" };
  const preference = turn < -0.14 ? [3, 0, 1, 2] : turn > 0.14 ? [1, 0, 3, 2] : [0, 3, 1, 2];
  for (const offset of preference) {
    const heading = (run.heading + offset) % 4;
    const next = neighbor(maze, run.position, heading);
    if (next === null || run.visited.includes(next)) continue;
    return { ...run, position: next, heading, visited: [...run.visited, next], stack: [...run.stack, next], trail: [...run.trail, next], moves: run.moves + 1, status: next === maze.goal ? "solved" : "exploring" };
  }
  if (run.stack.length < 2) return { ...run, status: "unreachable" };
  const next = run.stack[run.stack.length - 2];
  const heading = [0, 1, 2, 3].find((direction) => neighbor(maze, run.position, direction) === next)!;
  return { ...run, position: next, heading, stack: run.stack.slice(0, -1), trail: [...run.trail, next], moves: run.moves + 1, backtracks: run.backtracks + 1, status: "exploring" };
}
