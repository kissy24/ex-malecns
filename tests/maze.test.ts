import assert from "node:assert/strict";
import test from "node:test";
import { createMaze, createMazeRun, editMaze, mazeSenses, neighbor, shortestDistance, stepMaze, type Maze } from "../lib/maze.ts";
import { createSimulation, stepSimulation } from "../lib/simulation.ts";

test("generation is reproducible, has closed borders and a reachable goal", () => {
  for (const size of [11, 15, 21]) {
    for (const seed of [1, 42, 240914, 999999999]) {
      const maze = createMaze(size, seed);
      assert.deepEqual(maze, createMaze(size, seed));
      assert.notEqual(shortestDistance(maze), null);
      assert.equal(maze.walls[maze.start], false);
      assert.equal(maze.walls[maze.goal], false);
      maze.walls.forEach((wall, cell) => {
        if (cell % size === 0 || cell % size === size - 1 || cell < size || cell >= size * (size - 1)) assert.equal(wall, true);
      });
    }
  }
  assert.notDeepEqual(createMaze(15, 1).walls, createMaze(15, 2).walls);
  assert.throws(() => createMaze(10), RangeError);
});

test("explorer reaches every generated goal without crossing walls or teleporting", () => {
  for (const size of [11, 15, 21]) {
    for (const seed of [1, 2, 42, 240914]) {
      const maze = createMaze(size, seed);
      const original = structuredClone(maze);
      let run = createMazeRun(maze);
      for (let tick = 0; tick < size * size * 2 && run.status !== "solved"; tick += 1) {
        const previous = run;
        run = stepMaze(maze, run, Math.sin(tick));
        assert.equal(maze.walls[run.position], false);
        assert.ok([0, 1, 2, 3].some((direction) => neighbor(maze, previous.position, direction) === run.position));
      }
      assert.equal(run.status, "solved");
      assert.equal(run.position, maze.goal);
      assert.ok(run.moves >= shortestDistance(maze)!);
      assert.equal(run.trail.length, run.moves + 1);
      assert.equal(new Set(run.visited).size, run.visited.length);
      assert.equal(stepMaze(maze, run, 1), run);
      assert.deepEqual(maze, original);
    }
  }
});

function openMaze(): Maze {
  const maze = createMaze(7, 42);
  return { ...maze, start: 24, goal: 8, walls: maze.walls.map((_, cell) => cell % 7 === 0 || cell % 7 === 6 || cell < 7 || cell >= 42) };
}

test("motor turn changes exploration order in a junction", () => {
  const maze = openMaze();
  const run = createMazeRun(maze);
  assert.equal(stepMaze(maze, run, -1).position, 17);
  assert.equal(stepMaze(maze, run, 1).position, 31);
  assert.equal(stepMaze(maze, run, 0).position, 25);
  assert.deepEqual(mazeSenses(maze, run), { leftLight: 0.9, rightLight: 0.9, odor: 0.9, reward: 0 });
});

test("cyclic paths terminate and disconnected goals are reported after exploration", () => {
  const maze = openMaze();
  maze.walls[9] = true;
  maze.walls[15] = true;
  assert.equal(shortestDistance(maze), null);
  let run = createMazeRun(maze);
  for (let tick = 0; tick < maze.size ** 2 * 2; tick += 1) run = stepMaze(maze, run, 1);
  assert.equal(run.status, "unreachable");
  assert.equal(run.position, maze.start);
  assert.equal(run.moves, 2 * (run.visited.length - 1));
  assert.equal(stepMaze(maze, run, 0), run);
});

test("editing preserves endpoints and borders and allows moving endpoints onto walls", () => {
  const maze = createMaze();
  for (const cell of [0, maze.size - 1, -1, maze.walls.length, maze.start, maze.goal]) {
    assert.equal(editMaze(maze, cell, "wall"), maze);
  }
  const cell = maze.size * 2 + 2;
  const edited = editMaze(maze, cell, "wall");
  assert.notEqual(edited.walls[cell], maze.walls[cell]);
  assert.notEqual(edited.walls, maze.walls);
  const moved = editMaze(maze, cell, "start");
  assert.equal(moved.start, cell);
  assert.equal(moved.walls[cell], false);
  assert.equal(createMazeRun(moved).position, cell);
  assert.equal(editMaze(maze, maze.start, "goal"), maze);
});

test("neural-driven runs reproduce their trail and solve without changing weights", () => {
  const maze = createMaze(11, 42);
  const solve = () => {
    let run = createMazeRun(maze);
    let brain = createSimulation(maze.seed);
    for (let tick = 0; tick < maze.walls.length * 2 && run.status !== "solved"; tick += 1) {
      const stimulus = { ...mazeSenses(maze, run), noise: 0.12, plasticity: false };
      for (let i = 0; i < 8; i += 1) brain = stepSimulation(brain, stimulus);
      run = stepMaze(maze, run, brain.turn);
    }
    assert.equal(run.status, "solved");
    assert.ok(brain.totalSpikes > 0);
    assert.equal(brain.weightDelta, 0);
    return run;
  };
  assert.deepEqual(solve(), solve());
});
