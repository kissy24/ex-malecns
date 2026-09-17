export type GroupId =
  | "visualLeft"
  | "visualRight"
  | "olfactory"
  | "integration"
  | "memory"
  | "motorLeft"
  | "motorRight"
  | "dopamine";

export type Stimulus = {
  leftLight: number;
  rightLight: number;
  odor: number;
  reward: number;
  noise: number;
  plasticity: boolean;
};

export type SimulationConfig = Stimulus & { seed: number };

export type Neuron = {
  id: number;
  group: GroupId;
  x: number;
  y: number;
  potential: number;
  spike: boolean;
  refractory: number;
};

export type Synapse = {
  source: number;
  target: number;
  weight: number;
  initialWeight: number;
  plastic: boolean;
  eligibility: number;
};

export type HistoryPoint = {
  timeMs: number;
  sensory: number;
  integration: number;
  memory: number;
  motor: number;
};

export type SimulationState = {
  neurons: Neuron[];
  synapses: Synapse[];
  timeMs: number;
  stepCount: number;
  totalSpikes: number;
  lastStepSpikes: number;
  turn: number;
  forward: number;
  x: number;
  y: number;
  heading: number;
  path: Array<{ x: number; y: number }>;
  groupRates: Record<GroupId, number>;
  history: HistoryPoint[];
  rngState: number;
  weightDelta: number;
};

export type Preset = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  question: string;
  stimulus: Stimulus;
};

export const GROUPS: Array<{
  id: GroupId;
  label: string;
  short: string;
  count: number;
  x: number;
  y: number;
  color: string;
}> = [
  { id: "visualLeft", label: "左視覚", short: "VL", count: 10, x: 0.13, y: 0.24, color: "#9bf27c" },
  { id: "visualRight", label: "右視覚", short: "VR", count: 10, x: 0.13, y: 0.70, color: "#9bf27c" },
  { id: "olfactory", label: "嗅覚", short: "OL", count: 10, x: 0.32, y: 0.47, color: "#f2c66d" },
  { id: "integration", label: "統合", short: "IN", count: 14, x: 0.50, y: 0.27, color: "#70dfd0" },
  { id: "memory", label: "記憶", short: "MB", count: 16, x: 0.51, y: 0.68, color: "#a8a0ff" },
  { id: "motorLeft", label: "左運動", short: "ML", count: 9, x: 0.77, y: 0.24, color: "#71b7ff" },
  { id: "motorRight", label: "右運動", short: "MR", count: 9, x: 0.77, y: 0.70, color: "#71b7ff" },
  { id: "dopamine", label: "報酬", short: "DA", count: 6, x: 0.69, y: 0.47, color: "#ff8e72" },
];

export const DEFAULT_STIMULUS: Stimulus = {
  leftLight: 0.82,
  rightLight: 0.18,
  odor: 0.1,
  reward: 0,
  noise: 0.12,
  plasticity: false,
};

export const PRESETS: Preset[] = [
  {
    id: "phototaxis",
    name: "光走性",
    shortName: "LIGHT",
    description: "左側の強い光に向く出力が生まれるか観察します。",
    question: "左右差は運動出力へどう伝わる？",
    stimulus: { ...DEFAULT_STIMULUS },
  },
  {
    id: "conditioning",
    name: "匂いと報酬",
    shortName: "LEARN",
    description: "匂いと報酬を同時提示し、可塑シナプスの変化を追います。",
    question: "報酬は記憶経路の重みを変える？",
    stimulus: { leftLight: 0.2, rightLight: 0.2, odor: 0.85, reward: 0.8, noise: 0.1, plasticity: true },
  },
  {
    id: "conflict",
    name: "感覚競合",
    shortName: "MIX",
    description: "右の光と匂い経路を同時に働かせ、出力の揺らぎを見ます。",
    question: "異なる感覚が競合すると何が起きる？",
    stimulus: { leftLight: 0.15, rightLight: 0.92, odor: 0.78, reward: -0.3, noise: 0.18, plasticity: true },
  },
  {
    id: "noise",
    name: "ノイズ耐性",
    shortName: "NOISE",
    description: "対称な入力に強いノイズを加え、意思決定の安定性を見ます。",
    question: "同じ入力でも出力はどれだけ揺れる？",
    stimulus: { leftLight: 0.55, rightLight: 0.55, odor: 0.25, reward: 0, noise: 0.62, plasticity: false },
  },
];

function random(state: number): [number, number] {
  let next = state | 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return [((next >>> 0) % 1_000_000) / 1_000_000, next >>> 0];
}

function groupIndexes(neurons: Neuron[], group: GroupId) {
  return neurons.filter((neuron) => neuron.group === group).map((neuron) => neuron.id);
}

export function createSimulation(seed = 240914): SimulationState {
  let rngState = seed >>> 0 || 1;
  const neurons: Neuron[] = [];

  for (const group of GROUPS) {
    for (let index = 0; index < group.count; index += 1) {
      let angleRandom: number;
      let radiusRandom: number;
      [angleRandom, rngState] = random(rngState);
      [radiusRandom, rngState] = random(rngState);
      const angle = angleRandom * Math.PI * 2;
      const radius = 0.018 + radiusRandom * 0.056;
      neurons.push({
        id: neurons.length,
        group: group.id,
        x: group.x + Math.cos(angle) * radius,
        y: group.y + Math.sin(angle) * radius,
        potential: 0,
        spike: false,
        refractory: 0,
      });
    }
  }

  const synapses: Synapse[] = [];
  const addConnections = (
    from: GroupId,
    to: GroupId,
    probability: number,
    minWeight: number,
    maxWeight: number,
    plastic = false,
  ) => {
    for (const source of groupIndexes(neurons, from)) {
      for (const target of groupIndexes(neurons, to)) {
        let chance: number;
        [chance, rngState] = random(rngState);
        if (chance > probability) continue;
        let amount: number;
        [amount, rngState] = random(rngState);
        const weight = minWeight + amount * (maxWeight - minWeight);
        synapses.push({ source, target, weight, initialWeight: weight, plastic, eligibility: 0 });
      }
    }
  };

  addConnections("visualLeft", "integration", 0.34, 0.24, 0.52);
  addConnections("visualRight", "integration", 0.34, 0.24, 0.52);
  addConnections("olfactory", "memory", 0.38, 0.20, 0.48);
  addConnections("integration", "memory", 0.22, 0.16, 0.34);
  addConnections("integration", "motorLeft", 0.34, 0.22, 0.46);
  addConnections("integration", "motorRight", 0.34, 0.22, 0.46);
  addConnections("visualLeft", "motorLeft", 0.24, 0.18, 0.36);
  addConnections("visualRight", "motorRight", 0.24, 0.18, 0.36);
  addConnections("memory", "motorLeft", 0.28, 0.12, 0.32, true);
  addConnections("memory", "motorRight", 0.28, 0.12, 0.32, true);
  addConnections("motorLeft", "motorRight", 0.18, -0.32, -0.14);
  addConnections("motorRight", "motorLeft", 0.18, -0.32, -0.14);
  addConnections("dopamine", "memory", 0.24, 0.08, 0.20);

  for (const group of GROUPS) addConnections(group.id, group.id, 0.06, 0.08, 0.18);

  return {
    neurons,
    synapses,
    timeMs: 0,
    stepCount: 0,
    totalSpikes: 0,
    lastStepSpikes: 0,
    turn: 0,
    forward: 0,
    x: 0,
    y: 0,
    heading: -Math.PI / 2,
    path: [{ x: 0, y: 0 }],
    groupRates: Object.fromEntries(GROUPS.map((group) => [group.id, 0])) as Record<GroupId, number>,
    history: [],
    rngState,
    weightDelta: 0,
  };
}

const inputFor = (group: GroupId, stimulus: Stimulus) => {
  if (group === "visualLeft") return stimulus.leftLight * 0.34;
  if (group === "visualRight") return stimulus.rightLight * 0.34;
  if (group === "olfactory") return stimulus.odor * 0.32;
  if (group === "dopamine") return Math.abs(stimulus.reward) * 0.30;
  return 0.018;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function stepSimulation(previous: SimulationState, stimulus: Stimulus): SimulationState {
  let rngState = previous.rngState;
  const incoming = new Float32Array(previous.neurons.length);
  for (const synapse of previous.synapses) {
    if (previous.neurons[synapse.source].spike) incoming[synapse.target] += synapse.weight;
  }

  const neurons = previous.neurons.map((neuron) => {
    if (neuron.refractory > 0) {
      return { ...neuron, potential: 0, spike: false, refractory: neuron.refractory - 1 };
    }
    let sample: number;
    [sample, rngState] = random(rngState);
    const noise = (sample - 0.5) * stimulus.noise * 0.32;
    const potential = neuron.potential * 0.88 + inputFor(neuron.group, stimulus) + incoming[neuron.id] + noise;
    const spike = potential >= 1;
    return { ...neuron, potential: spike ? 0 : clamp(potential, -0.45, 0.999), spike, refractory: spike ? 2 : 0 };
  });

  const groupRates = { ...previous.groupRates };
  for (const group of GROUPS) {
    const members = neurons.filter((neuron) => neuron.group === group.id);
    const instant = members.filter((neuron) => neuron.spike).length / members.length;
    groupRates[group.id] = previous.groupRates[group.id] * 0.84 + instant * 0.16;
  }

  const synapses = previous.synapses.map((synapse) => {
    if (!synapse.plastic) return synapse;
    const pre = previous.neurons[synapse.source].spike ? 1 : 0;
    const post = neurons[synapse.target].spike ? 1 : 0;
    const eligibility = synapse.eligibility * 0.94 + pre * (post ? 1 : 0.18);
    if (!stimulus.plasticity || stimulus.reward === 0) return { ...synapse, eligibility };
    const change = stimulus.reward * eligibility * 0.0018;
    return { ...synapse, eligibility, weight: clamp(synapse.weight + change, 0.04, 0.72) };
  });

  const left = groupRates.motorLeft;
  const right = groupRates.motorRight;
  const turn = clamp((right - left) * 3.4, -1, 1);
  const forward = clamp((right + left) * 2.1, 0, 1);
  const heading = previous.heading + turn * 0.07;
  const x = clamp(previous.x + Math.cos(heading) * forward * 0.012, -1, 1);
  const y = clamp(previous.y + Math.sin(heading) * forward * 0.012, -1, 1);
  const path = previous.stepCount % 3 === 0 ? [...previous.path.slice(-179), { x, y }] : previous.path;
  const lastStepSpikes = neurons.filter((neuron) => neuron.spike).length;
  const plastic = synapses.filter((synapse) => synapse.plastic);
  const weightDelta = plastic.length
    ? plastic.reduce((sum, synapse) => sum + synapse.weight - synapse.initialWeight, 0) / plastic.length
    : 0;
  const timeMs = previous.timeMs + 20;
  const history = previous.stepCount % 4 === 0
    ? [...previous.history.slice(-119), {
        timeMs,
        sensory: (groupRates.visualLeft + groupRates.visualRight + groupRates.olfactory) / 3,
        integration: groupRates.integration,
        memory: groupRates.memory,
        motor: (left + right) / 2,
      }]
    : previous.history;

  return {
    ...previous,
    neurons,
    synapses,
    timeMs,
    stepCount: previous.stepCount + 1,
    totalSpikes: previous.totalSpikes + lastStepSpikes,
    lastStepSpikes,
    turn,
    forward,
    x,
    y,
    heading,
    path,
    groupRates,
    history,
    rngState,
    weightDelta,
  };
}

export function actionLabel(turn: number, forward: number) {
  if (forward < 0.06) return "停止";
  if (turn < -0.14) return "左へ旋回";
  if (turn > 0.14) return "右へ旋回";
  return "直進";
}

export function meanRate(state: SimulationState) {
  const values = Object.values(state.groupRates);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
