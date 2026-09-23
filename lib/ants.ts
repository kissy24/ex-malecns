/** A deliberately simplified agent model; no global food map or path solver. */
export const FIELD_WIDTH = 120;
export const FIELD_HEIGHT = 76;
export const TICK_SECONDS = 1 / 30;
export type Point = { x: number; y: number };
export type Ant = Point & { heading: number; carrying: boolean; scent: number };
export type Food = Point & { amount: number };
export type AntConfig = { count: number; halfLife: number; deposit: number; exploration: number };
export type Scenario = "fork" | "detour" | "scatter";
export type FieldTool = "food" | "wall" | "erase";
export type Colony = {
  ants: Ant[];
  food: Food[];
  nest: Point;
  walls: Uint8Array;
  pheromone: Float32Array;
  ticks: number;
  delivered: number;
  rng: number;
  history: number[];
};
export const DEFAULT_ANT_CONFIG: AntConfig = { count: 120, halfLife: 12, deposit: 1, exploration: 0.25 };

function random(world: Colony) {
  let value = world.rng;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  world.rng = value >>> 0;
  return world.rng / 4294967296;
}

export function fieldIndex(x: number, y: number) {
  if (x < 1 || y < 1 || x >= FIELD_WIDTH - 1 || y >= FIELD_HEIGHT - 1) return -1;
  return Math.floor(y) * FIELD_WIDTH + Math.floor(x);
}

function free(world: Colony, x: number, y: number) {
  const index = fieldIndex(x, y);
  return index >= 0 && !world.walls[index];
}

export function createColony(seed = 240914, config = DEFAULT_ANT_CONFIG, scenario: Scenario = "fork"): Colony {
  const world: Colony = {
    ants: [], food: [], nest: { x: 22, y: 38 }, walls: new Uint8Array(FIELD_WIDTH * FIELD_HEIGHT),
    pheromone: new Float32Array(FIELD_WIDTH * FIELD_HEIGHT), ticks: 0, delivered: 0, rng: seed >>> 0 || 1, history: [0],
  };
  world.food = scenario === "scatter"
    ? [{ x: 50, y: 14, amount: 140 }, { x: 90, y: 19, amount: 140 }, { x: 103, y: 49, amount: 140 }, { x: 64, y: 60, amount: 140 }]
    : [{ x: 88, y: 23, amount: 350 }, { x: 88, y: 55, amount: 350 }];
  if (scenario === "detour") {
    for (let y = 20; y < 57; y += 1) for (let x = 57; x < 61; x += 1) world.walls[y * FIELD_WIDTH + x] = 1;
  }
  for (let index = 0; index < config.count; index += 1) {
    const heading = random(world) * Math.PI * 2;
    const radius = random(world) * 3;
    world.ants.push({ x: world.nest.x + Math.cos(heading) * radius, y: world.nest.y + Math.sin(heading) * radius, heading, carrying: false, scent: 0 });
  }
  return world;
}

function angleDifference(target: number, current: number) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

// Sample along the antenna's ray; walls block both scent sensing and motion.
function sample(world: Colony, ant: Ant, offset: number) {
  const heading = ant.heading + offset;
  let value = 0;
  for (let distance = 1; distance <= 5; distance += 1) {
    const x = ant.x + Math.cos(heading) * distance;
    const y = ant.y + Math.sin(heading) * distance;
    if (!free(world, x, y)) return -1;
    value += world.pheromone[fieldIndex(x, y)];
  }
  return value;
}

function visible(world: Colony, a: Point, b: Point) {
  const length = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2);
  for (let step = 1; step <= length; step += 1) {
    if (!free(world, a.x + (b.x - a.x) * step / length, a.y + (b.y - a.y) * step / length)) return false;
  }
  return true;
}

/** Mutates one fixed-duration tick. UI owns the world in a ref, not React state. */
export function stepColony(world: Colony, config: AntConfig) {
  const decay = Math.pow(0.5, TICK_SECONDS / Math.max(0.1, config.halfLife));
  for (let index = 0; index < world.pheromone.length; index += 1) {
    world.pheromone[index] = world.walls[index] ? 0 : world.pheromone[index] * decay;
  }
  for (const ant of world.ants) {
    const noise = random(world) - 0.5;
    if (ant.carrying) {
      // An explicit nest compass approximates path integration, not neural learning.
      const home = Math.atan2(world.nest.y - ant.y, world.nest.x - ant.x);
      ant.heading += Math.max(-0.13, Math.min(0.13, angleDifference(home, ant.heading))) + noise * 0.12;
    } else {
      let nearby: Food | undefined;
      let closest = 11;
      for (const food of world.food) {
        const distance = Math.hypot(food.x - ant.x, food.y - ant.y);
        if (food.amount > 0 && distance < closest && visible(world, ant, food)) { nearby = food; closest = distance; }
      }
      if (nearby) {
        const target = Math.atan2(nearby.y - ant.y, nearby.x - ant.x);
        ant.heading += Math.max(-0.3, Math.min(0.3, angleDifference(target, ant.heading)));
      } else {
        const left = sample(world, ant, -0.6);
        const front = sample(world, ant, 0);
        const right = sample(world, ant, 0.6);
        if (random(world) > config.exploration && Math.max(left, front, right) > 0.02) {
          if (left > front && left > right) ant.heading -= 0.23;
          else if (right > front && right > left) ant.heading += 0.23;
        }
        ant.heading += noise * (0.22 + config.exploration * 0.7);
      }
    }

    // Movement is shorter than a grid cell; also sample the segment to avoid
    // cutting through the corner of a painted wall.
    const move = (heading: number) => {
      const dx = Math.cos(heading) * 0.56;
      const dy = Math.sin(heading) * 0.56;
      for (let step = 1; step <= 4; step += 1) if (!free(world, ant.x + dx * step / 4, ant.y + dy * step / 4)) return false;
      ant.x += dx;
      ant.y += dy;
      ant.heading = heading;
      return true;
    };
    if (!move(ant.heading)) {
      const side = random(world) < 0.5 ? -1 : 1;
      for (const offset of [side * 0.8, -side * 0.8, side * 1.6, -side * 1.6, Math.PI]) {
        if (move(ant.heading + offset)) break;
      }
    }
    ant.heading = Math.atan2(Math.sin(ant.heading), Math.cos(ant.heading));

    if (ant.carrying) {
      ant.scent *= 0.998;
      // Deposit in a small footprint. Walls never hold pheromone.
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const index = fieldIndex(ant.x + dx, ant.y + dy);
        if (index >= 0 && !world.walls[index]) world.pheromone[index] = Math.min(12, world.pheromone[index] + config.deposit * ant.scent * 0.16);
      }
      if (Math.hypot(ant.x - world.nest.x, ant.y - world.nest.y) < 3.5) {
        ant.carrying = false;
        world.delivered += 1;
        ant.heading += Math.PI;
      }
    } else {
      for (const food of world.food) {
        if (food.amount > 0 && Math.hypot(ant.x - food.x, ant.y - food.y) < 2.5 && visible(world, ant, food)) {
          food.amount -= 1;
          ant.carrying = true;
          ant.scent = 1;
          ant.heading += Math.PI;
          break;
        }
      }
    }
  }
  world.ticks += 1;
  if (world.ticks % 30 === 0) world.history = [...world.history.slice(-119), world.delivered];
}

export function paintField(world: Colony, point: Point, tool: FieldTool) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
  const x = Math.max(3, Math.min(FIELD_WIDTH - 4, point.x));
  const y = Math.max(3, Math.min(FIELD_HEIGHT - 4, point.y));
  if (tool === "food") {
    if (Math.hypot(x - world.nest.x, y - world.nest.y) < 7 || !free(world, x, y)) return;
    const existing = world.food.find((food) => Math.hypot(food.x - x, food.y - y) < 5);
    if (existing) existing.amount += 200;
    else if (world.food.length < 40) world.food.push({ x, y, amount: 200 });
    return;
  }
  if (tool === "erase") world.food = world.food.filter((food) => Math.hypot(food.x - x, food.y - y) > 5);
  for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
    const px = Math.floor(x) + dx;
    const py = Math.floor(y) + dy;
    const index = fieldIndex(px, py);
    if (index < 0 || Math.hypot(px + 0.5 - world.nest.x, py + 0.5 - world.nest.y) < 6) continue;
    if (tool === "wall" && (world.ants.some((ant) => fieldIndex(ant.x, ant.y) === index) || world.food.some((food) => Math.hypot(food.x - px, food.y - py) < 4))) continue;
    world.walls[index] = tool === "wall" ? 1 : 0;
    world.pheromone[index] = 0;
  }
}
