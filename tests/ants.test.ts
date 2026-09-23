import assert from "node:assert/strict";
import test from "node:test";
import { createColony, DEFAULT_ANT_CONFIG, FIELD_WIDTH, fieldIndex, paintField, stepColony, type AntConfig, type Colony, type Scenario } from "../lib/ants.ts";

function run(ticks: number, config: AntConfig = DEFAULT_ANT_CONFIG, scenario: Scenario = "fork") {
  const world = createColony(240914, config, scenario);
  for (let tick = 0; tick < ticks; tick += 1) stepColony(world, config);
  return world;
}
function foodTotal(world: Colony) {
  return world.delivered + world.ants.filter((ant) => ant.carrying).length + world.food.reduce((sum, food) => sum + food.amount, 0);
}

test("same seed, configuration and interventions reproduce a colony", () => {
  const first = run(300);
  const second = run(300);
  assert.deepEqual(first, second);
  assert.notDeepEqual(createColony(1).ants, createColony(2).ants);
  paintField(first, { x: 60, y: 20 }, "wall");
  paintField(second, { x: 60, y: 20 }, "wall");
  for (let tick = 0; tick < 100; tick += 1) { stepColony(first, DEFAULT_ANT_CONFIG); stepColony(second, DEFAULT_ANT_CONFIG); }
  assert.deepEqual(first, second);
});

test("foraging discovers food, returns it and deposits bounded trails in each scenario", () => {
  for (const scenario of ["fork", "detour", "scatter"] as const) {
    const world = run(900, DEFAULT_ANT_CONFIG, scenario);
    assert.ok(world.delivered > 20, `${scenario}: ${world.delivered} delivered`);
    assert.equal(foodTotal(world), scenario === "scatter" ? 560 : 700);
    assert.ok(world.pheromone.some((amount) => amount > 0));
    assert.ok(world.pheromone.every((amount) => Number.isFinite(amount) && amount >= 0 && amount <= 12));
  }
});

test("pheromone decays with the configured half-life and zero deposition stays zero", () => {
  const config = { ...DEFAULT_ANT_CONFIG, count: 0, halfLife: 2 };
  const world = createColony(1, config);
  const index = 30 * FIELD_WIDTH + 30;
  world.pheromone[index] = 4;
  for (let tick = 0; tick < 60; tick += 1) stepColony(world, config);
  assert.ok(Math.abs(world.pheromone[index] - 2) < 0.00001);
  const noTrail = run(600, { ...DEFAULT_ANT_CONFIG, deposit: 0 });
  assert.ok(noTrail.delivered > 0);
  assert.ok(noTrail.pheromone.every((amount) => amount === 0));
});

test("ants cannot cross a complete wall even when food and scent are behind it", () => {
  const world = createColony();
  for (let y = 0; y < 76; y += 1) world.walls[y * FIELD_WIDTH + 50] = 1;
  world.pheromone.fill(2);
  for (let tick = 0; tick < 900; tick += 1) {
    stepColony(world, DEFAULT_ANT_CONFIG);
    for (const ant of world.ants) {
      assert.ok(ant.x < 50);
      assert.ok(fieldIndex(ant.x, ant.y) >= 0);
      assert.equal(world.walls[fieldIndex(ant.x, ant.y)], 0);
    }
  }
  assert.equal(world.delivered, 0);
  assert.equal(foodTotal(world), 700);
  assert.equal(world.pheromone[38 * FIELD_WIDTH + 50], 0);
});

test("painting protects occupied cells and nest; erasing clears food, walls and scent", () => {
  const world = createColony();
  const ant = world.ants[0];
  paintField(world, ant, "wall");
  assert.equal(world.walls[fieldIndex(ant.x, ant.y)], 0);
  assert.equal(world.walls[fieldIndex(world.nest.x, world.nest.y)], 0);
  paintField(world, { x: 60, y: 38 }, "wall");
  assert.equal(world.walls[fieldIndex(60, 38)], 1);
  paintField(world, { x: 60, y: 38 }, "food");
  assert.equal(world.food.length, 2);
  paintField(world, { x: 60, y: 38 }, "erase");
  paintField(world, { x: 60, y: 38 }, "food");
  assert.equal(foodTotal(world), 900);
  world.pheromone[fieldIndex(60, 38)] = 5;
  paintField(world, { x: 60, y: 38 }, "erase");
  assert.equal(world.food.length, 2);
  assert.equal(world.pheromone[fieldIndex(60, 38)], 0);
  assert.equal(foodTotal(world), 700);
});

test("moving food does not create cargo or discard carried food; ants discover new food", () => {
  const world = run(300);
  const carrying = world.ants.filter((ant) => ant.carrying).length;
  const delivered = world.delivered;
  world.food = [];
  paintField(world, { x: 40, y: 60 }, "food");
  const total = delivered + carrying + 200;
  for (let tick = 0; tick < 900; tick += 1) stepColony(world, DEFAULT_ANT_CONFIG);
  assert.equal(foodTotal(world), total);
  assert.ok(world.delivered > delivered + carrying);
});

test("removing a blocking wall restores access without a reset", () => {
  const world = createColony();
  for (let y = 0; y < 76; y += 1) world.walls[y * FIELD_WIDTH + 50] = 1;
  for (let tick = 0; tick < 300; tick += 1) stepColony(world, DEFAULT_ANT_CONFIG);
  assert.equal(world.delivered, 0);
  for (let y = 25; y < 51; y += 3) paintField(world, { x: 50, y }, "erase");
  for (let tick = 0; tick < 1200; tick += 1) stepColony(world, DEFAULT_ANT_CONFIG);
  assert.ok(world.delivered > 0);
  assert.equal(foodTotal(world), 700);
});
