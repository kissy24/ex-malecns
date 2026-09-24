import assert from "node:assert/strict";
import test from "node:test";
import { createEcosystem, DEFAULT_ANT_CONFIG, stepColony, TICK_SECONDS, type Colony, type Habitat } from "../lib/ants.ts";

function advance(world: Colony, ticks: number) {
  for (let i = 0; i < ticks; i += 1) stepColony(world, DEFAULT_ANT_CONFIG);
  return world;
}

function checkAccounts(world: Colony) {
  const eco = world.ecology!;
  assert.equal(world.ants.length, eco.initialPopulation + eco.births - eco.starved - eco.aged);
  const food = world.food.reduce((sum, patch) => sum + patch.amount, 0);
  const cargo = world.ants.filter((ant) => ant.carrying).length;
  assert.equal(eco.initialFood + eco.grown, food + cargo + eco.stock + eco.consumed + eco.reproductionUsed + eco.expired + eco.lostCargo);
  assert.ok(eco.stock >= 0);
  assert.ok(world.ants.length + eco.eggs.length <= 240);
  assert.ok(world.ants.every((ant) => ant.life!.energy > 0 && ant.life!.energy <= 100));
}

test("autonomous worlds reproduce food locations, lifecycle and population for the same seed", () => {
  const a = advance(createEcosystem(17), 1800);
  const b = advance(createEcosystem(17), 1800);
  assert.deepEqual(a, b);
  assert.notDeepEqual(createEcosystem(17).food, createEcosystem(18).food);
  assert.ok(a.ecology!.births > 0);
  checkAccounts(a);
});

test("seasons stop food growth in drought and resume it during recovery", () => {
  const world = createEcosystem();
  const eco = world.ecology!;
  advance(world, eco.seasonEndsAt + 1);
  assert.equal(eco.season, "dry");
  const grown = eco.grown;
  const end = eco.seasonEndsAt;
  advance(world, end - world.ticks);
  assert.equal(eco.grown, grown);
  stepColony(world, DEFAULT_ANT_CONFIG);
  assert.equal(eco.season, "recovery");
  advance(world, 400);
  assert.ok(eco.grown > grown);
  checkAccounts(world);
});

test("uncollected food expires and remains accounted for", () => {
  const world = createEcosystem();
  const patch = world.food[0];
  const amount = patch.amount;
  patch.expiresAt = 0;
  stepColony(world, DEFAULT_ANT_CONFIG);
  assert.ok(!world.food.includes(patch));
  assert.equal(world.ecology!.expired, amount);
  checkAccounts(world);
});

test("starvation and old age remove individuals, account for cargo, and end a colony", () => {
  const world = createEcosystem();
  const eco = world.ecology!;
  const starving = world.ants[0];
  starving.life!.energy = 0.001;
  starving.carrying = true;
  const old = world.ants[1];
  old.life!.age = old.life!.lifespan - TICK_SECONDS / 2;
  world.ants = [starving, old];
  stepColony(world, DEFAULT_ANT_CONFIG);
  assert.equal(world.ants.length, 0);
  assert.equal(eco.starved, 1);
  assert.equal(eco.aged, 1);
  assert.equal(eco.lostCargo, 1);
  assert.equal(eco.corpses.length, 2);
  assert.equal(eco.extinctAt, 1);
  const final = structuredClone(world);
  advance(world, 3000);
  assert.deepEqual(world, final, "an extinct colony is never automatically revived");
});

test("feeding consumes finite resources and restores individual energy", () => {
  const world = createEcosystem();
  const ant = world.ants[0];
  world.ants = [ant];
  Object.assign(ant, world.nest);
  ant.life!.energy = 20;
  const stock = world.ecology!.stock;
  stepColony(world, DEFAULT_ANT_CONFIG);
  assert.ok(ant.life!.energy > 70);
  assert.equal(world.ecology!.stock, stock - 1);
  assert.equal(world.ecology!.consumed, 1);
});

test("brood costs stock up front, matures later, and can survive the last adult", () => {
  const world = createEcosystem();
  const eco = world.ecology!;
  world.ticks = eco.nextBroodAt;
  stepColony(world, DEFAULT_ANT_CONFIG);
  assert.ok(eco.eggs.length > 0);
  assert.equal(eco.births, 0);
  assert.equal(eco.reproductionUsed, eco.eggs.length * 4);
  const hatchAt = eco.eggs[0].hatchAt;
  const eggs = eco.eggs.length;
  world.ants = [];
  eco.nextBroodAt = Infinity;
  advance(world, hatchAt - world.ticks);
  assert.equal(eco.extinctAt, null);
  assert.equal(eco.births, 0);
  stepColony(world, DEFAULT_ANT_CONFIG);
  assert.equal(world.ants.length, eggs);
  assert.equal(eco.births, eggs);
  assert.equal(eco.eggs.length, 0);
});

test("ten unattended minutes show habitat-dependent survival with bounded histories", () => {
  const outcomes = {} as Record<Habitat, Colony>;
  for (const habitat of ["grassland", "dryland", "woodland"] as const) {
    const world = createEcosystem(240914, habitat);
    for (let second = 0; second < 600; second += 1) {
      advance(world, 30);
      checkAccounts(world);
    }
    const eco = world.ecology!;
    assert.ok(eco.births > 0);
    assert.ok(eco.aged > 0);
    assert.ok(eco.events.length <= 12);
    assert.ok(eco.corpses.length <= 80);
    assert.ok(eco.populationHistory.length <= 360);
    assert.ok(world.food.length <= 16);
    outcomes[habitat] = world;
  }
  assert.equal(outcomes.dryland.ants.length, 0);
  assert.ok(outcomes.dryland.ecology!.starved > 0);
  assert.notEqual(outcomes.dryland.ecology!.extinctAt, null);
  assert.ok(outcomes.grassland.ants.length > 0);
  assert.ok(outcomes.woodland.ants.length > outcomes.grassland.ants.length);
});
