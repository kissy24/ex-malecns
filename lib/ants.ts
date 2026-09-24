/** A deliberately simplified agent model; no global food map or path solver. */
export const FIELD_WIDTH = 120;
export const FIELD_HEIGHT = 76;
export const TICK_SECONDS = 1 / 30;
export type Point = { x: number; y: number };
export type Ant = Point & { heading: number; carrying: boolean; scent: number; life?: { energy: number; age: number; lifespan: number; generation: number } };
export type Food = Point & { amount: number; expiresAt?: number };
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
  ecology?: Ecology;
};
export type Habitat = "grassland" | "dryland" | "woodland";
export type Season = "wet" | "dry" | "recovery";
export type Ecology = {
  habitat: Habitat;
  stock: number;
  births: number;
  starved: number;
  aged: number;
  consumed: number;
  reproductionUsed: number;
  lostCargo: number;
  grown: number;
  expired: number;
  initialFood: number;
  initialPopulation: number;
  peak: number;
  generation: number;
  season: Season;
  seasonEndsAt: number;
  nextFoodAt: number;
  nextBroodAt: number;
  eggs: Array<{ hatchAt: number; generation: number }>;
  corpses: Array<Point & { tick: number; cause: "starvation" | "age" }>;
  events: Array<{ tick: number; text: string }>;
  populationHistory: Array<{ seconds: number; population: number; stock: number }>;
  extinctAt: number | null;
};
export const HABITATS = {
  grassland: { name: "草原", description: "雨季に蓄え、乾季をしのぐ", interval: 12, food: 65, wet: 40, dry: 45, recovery: 35 },
  dryland: { name: "乾いた土地", description: "少ない餌と長い乾季", interval: 18, food: 32, wet: 25, dry: 70, recovery: 30 },
  woodland: { name: "豊かな森", description: "多くの餌と短い乾季", interval: 10, food: 90, wet: 50, dry: 25, recovery: 40 },
} as const;
export const SEASON_NAMES: Record<Season, string> = { wet: "雨季", dry: "乾季", recovery: "回復期" };
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

function event(world: Colony, text: string) {
  const eco = world.ecology!;
  eco.events = [{ tick: world.ticks, text }, ...eco.events].slice(0, 12);
}

function growFood(world: Colony, amount: number) {
  if (world.food.length >= 16) return;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const x = 8 + random(world) * (FIELD_WIDTH - 16);
    const y = 8 + random(world) * (FIELD_HEIGHT - 16);
    if (Math.hypot(x - world.nest.x, y - world.nest.y) < 16 || !free(world, x, y)) continue;
    if (world.food.some((food) => Math.hypot(food.x - x, food.y - y) < 9)) continue;
    world.food.push({ x, y, amount, expiresAt: world.ticks + 30 * (40 + random(world) * 35) });
    world.ecology!.grown += amount;
    return;
  }
}

export function createEcosystem(seed = 240914, habitat: Habitat = "grassland"): Colony {
  const world = createColony(seed, { ...DEFAULT_ANT_CONFIG, count: 80 }, "scatter");
  world.food = [];
  const stock = habitat === "dryland" ? 25 : 50;
  world.ecology = {
    habitat, stock, births: 0, starved: 0, aged: 0, consumed: 0, reproductionUsed: 0, lostCargo: 0,
    grown: 0, expired: 0, initialFood: stock, initialPopulation: 80, peak: 80, generation: 1,
    season: "wet", seasonEndsAt: HABITATS[habitat].wet * 30, nextFoodAt: HABITATS[habitat].interval * 30,
    nextBroodAt: 90, eggs: [], corpses: [], events: [], populationHistory: [{ seconds: 0, population: 80, stock }], extinctAt: null,
  };
  for (const ant of world.ants) {
    ant.life = { energy: 50 + random(world) * 45, age: random(world) * 35, lifespan: 120 + random(world) * 100, generation: 1 };
  }
  for (let index = 0; index < 3; index += 1) growFood(world, HABITATS[habitat].food);
  event(world, "80匹のコロニーが探索を開始");
  return world;
}

function updateEnvironment(world: Colony) {
  const eco = world.ecology!;
  const habitat = HABITATS[eco.habitat];
  if (world.ticks >= eco.seasonEndsAt) {
    eco.season = eco.season === "wet" ? "dry" : eco.season === "dry" ? "recovery" : "wet";
    eco.seasonEndsAt = world.ticks + habitat[eco.season] * 30;
    event(world, `${SEASON_NAMES[eco.season]}へ。${eco.season === "dry" ? "新しい餌の発生が止まります" : "新しい餌が育ち始めます"}`);
  }
  world.food = world.food.filter((food) => {
    if (food.expiresAt !== undefined && food.expiresAt <= world.ticks) { eco.expired += food.amount; return false; }
    return food.amount > 0;
  });
  if (world.ticks >= eco.nextFoodAt) {
    eco.nextFoodAt = world.ticks + habitat.interval * 30;
    if (eco.season !== "dry") growFood(world, Math.round(habitat.food * (0.7 + random(world) * 0.6)));
  }
  if (world.ticks >= eco.nextBroodAt) {
    eco.nextBroodAt = world.ticks + 90;
    const reserve = Math.max(15, world.ants.length * 0.4);
    // Brood is paid for up front; no living adults means no new eggs.
    if (world.ants.length > 0 && eco.stock >= reserve + 4) {
      const brood = Math.min(3, Math.floor((eco.stock - reserve) / 4), 240 - world.ants.length - eco.eggs.length);
      for (let index = 0; index < brood; index += 1) {
        eco.stock -= 4;
        eco.reproductionUsed += 4;
        eco.eggs.push({ hatchAt: world.ticks + 450, generation: Math.max(...world.ants.map((ant) => ant.life!.generation)) + 1 });
      }
    }
  }
  const hatching = eco.eggs.filter((egg) => egg.hatchAt <= world.ticks);
  eco.eggs = eco.eggs.filter((egg) => egg.hatchAt > world.ticks);
  for (const egg of hatching) {
    world.ants.push({ ...world.nest, heading: random(world) * Math.PI * 2, carrying: false, scent: 0,
      life: { energy: 85, age: 0, lifespan: 120 + random(world) * 100, generation: egg.generation } });
    eco.births += 1;
    eco.generation = Math.max(eco.generation, egg.generation);
  }
  if (hatching.length && (eco.births === hatching.length || eco.births % 10 < hatching.length)) event(world, `新しい働きアリが羽化。累計 ${eco.births} 匹が誕生`);
  eco.corpses = eco.corpses.filter((corpse) => world.ticks - corpse.tick < 450);
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
  const eco = world.ecology;
  if (eco?.extinctAt !== undefined && eco.extinctAt !== null) return;
  if (eco) updateEnvironment(world);
  const decay = Math.pow(0.5, TICK_SECONDS / Math.max(0.1, config.halfLife));
  for (let index = 0; index < world.pheromone.length; index += 1) {
    world.pheromone[index] = world.walls[index] ? 0 : world.pheromone[index] * decay;
  }
  for (const ant of world.ants) {
    if (ant.life) {
      ant.life.age += TICK_SECONDS;
      ant.life.energy -= (ant.carrying ? 0.95 : 0.8) * TICK_SECONDS;
      if (ant.life.energy <= 0 || ant.life.age >= ant.life.lifespan) continue;
    }
    const noise = random(world) - 0.5;
    if (ant.carrying || (eco && ant.life!.energy < 30 && eco.stock > 0)) {
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
        if (eco) eco.stock += 1;
        ant.heading += Math.PI;
      }
    } else {
      for (const food of world.food) {
        if (food.amount > 0 && Math.hypot(ant.x - food.x, ant.y - food.y) < 2.5 && visible(world, ant, food)) {
          food.amount -= 1;
          if (eco && ant.life!.energy < 45) { ant.life!.energy = Math.min(100, ant.life!.energy + 55); eco.consumed += 1; }
          else { ant.carrying = true; ant.scent = 1; ant.heading += Math.PI; }
          break;
        }
      }
    }
    if (eco && ant.life!.energy < 60 && eco.stock >= 1 && Math.hypot(ant.x - world.nest.x, ant.y - world.nest.y) < 3.5) {
      eco.stock -= 1;
      eco.consumed += 1;
      ant.life!.energy = Math.min(100, ant.life!.energy + 55);
    }
  }
  world.ticks += 1;
  if (world.ticks % 30 === 0) world.history = [...world.history.slice(-119), world.delivered];
  if (eco) {
    const previousDeaths = eco.starved + eco.aged;
    world.ants = world.ants.filter((ant) => {
      const life = ant.life!;
      if (life.energy > 0 && life.age < life.lifespan) return true;
      const cause = life.energy <= 0 ? "starvation" : "age";
      if (cause === "starvation") eco.starved += 1; else eco.aged += 1;
      if (ant.carrying) eco.lostCargo += 1;
      eco.corpses.push({ x: ant.x, y: ant.y, tick: world.ticks, cause });
      return false;
    });
    eco.corpses = eco.corpses.slice(-80);
    const deaths = eco.starved + eco.aged;
    if (deaths > previousDeaths && (previousDeaths === 0 || Math.floor(deaths / 10) > Math.floor(previousDeaths / 10))) {
      event(world, `死亡累計 ${deaths} 匹（餓死 ${eco.starved} / 寿命 ${eco.aged}）`);
    }
    eco.peak = Math.max(eco.peak, world.ants.length);
    if (world.ants.length === 0 && eco.eggs.length === 0) {
      eco.extinctAt = world.ticks;
      event(world, "コロニーが絶滅しました。自動で再出現はしません");
    }
    if (world.ticks % 150 === 0 || eco.extinctAt !== null) {
      eco.populationHistory = [...eco.populationHistory.slice(-359), { seconds: world.ticks * TICK_SECONDS, population: world.ants.length, stock: eco.stock }];
    }
  }
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
