export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const createSeededRng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

export const shuffleWithSeed = <T>(items: T[], seed: number): T[] => {
  const rng = createSeededRng(seed);
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

export const makeId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
