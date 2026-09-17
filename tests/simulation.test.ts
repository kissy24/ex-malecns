import assert from "node:assert/strict";
import test from "node:test";
import {
  actionLabel,
  createSimulation,
  DEFAULT_STIMULUS,
  GROUPS,
  PRESETS,
  stepSimulation,
} from "../lib/simulation.ts";

function run(seed: number, steps: number, stimulus = DEFAULT_STIMULUS) {
  let state = createSimulation(seed);
  for (let index = 0; index < steps; index += 1) state = stepSimulation(state, stimulus);
  return state;
}

test("creates the documented 84-neuron sparse circuit", () => {
  const state = createSimulation(240914);
  assert.equal(state.neurons.length, 84);
  assert.equal(state.neurons.length, GROUPS.reduce((sum, group) => sum + group.count, 0));
  assert.ok(state.synapses.length > 250);
  assert.ok(state.synapses.some((synapse) => synapse.plastic));
  assert.ok(state.synapses.some((synapse) => synapse.weight < 0));
});

test("same seed and conditions are deterministic", () => {
  const first = run(7719, 240);
  const second = run(7719, 240);
  assert.deepEqual(first.neurons, second.neurons);
  assert.deepEqual(first.synapses, second.synapses);
  assert.deepEqual(first.path, second.path);
  assert.deepEqual(first.groupRates, second.groupRates);
  assert.equal(first.totalSpikes, second.totalSpikes);
  assert.equal(first.timeMs, 4_800);
});

test("disabled plasticity preserves every synaptic weight", () => {
  const initial = createSimulation(55);
  const final = run(55, 400, { ...PRESETS[1].stimulus, plasticity: false });
  assert.deepEqual(final.synapses.map((synapse) => synapse.weight), initial.synapses.map((synapse) => synapse.weight));
  assert.equal(final.weightDelta, 0);
});

test("rewarded plasticity changes plastic weights within safe bounds", () => {
  const final = run(90210, 800, PRESETS[1].stimulus);
  const plastic = final.synapses.filter((synapse) => synapse.plastic);
  assert.ok(final.weightDelta > 0);
  assert.ok(plastic.every((synapse) => synapse.weight >= 0.04 && synapse.weight <= 0.72));
});

test("readout labels cover stop, turns, and forward movement", () => {
  assert.equal(actionLabel(0, 0), "停止");
  assert.equal(actionLabel(-0.5, 0.7), "左へ旋回");
  assert.equal(actionLabel(0.5, 0.7), "右へ旋回");
  assert.equal(actionLabel(0.02, 0.7), "直進");
});
