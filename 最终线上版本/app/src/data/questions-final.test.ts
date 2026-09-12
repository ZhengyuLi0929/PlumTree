import { describe, expect, it } from "vitest";
import { FINAL_QUESTIONS, computeScoresFinal } from "./questions-final";

function allMiddleAnswers() {
  const answers: Record<number, number> = {};
  for (const q of FINAL_QUESTIONS) answers[q.id] = 4;
  return answers;
}

describe("computeScoresFinal", () => {
  it("maps 1 / 4 / 7 to complementary bipolar scores", () => {
    // id 2 是亲密距离左极 F
    expect(computeScoresFinal({ 2: 1 }, {}).FI).toEqual({ F: 1, I: 7 });
    expect(computeScoresFinal({ 2: 4 }, {}).FI).toEqual({ F: 4, I: 4 });
    expect(computeScoresFinal({ 2: 7 }, {}).FI).toEqual({ F: 7, I: 1 });
    // id 5 是亲密距离右极 I
    expect(computeScoresFinal({ 5: 1 }, {}).FI).toEqual({ F: 7, I: 1 });
  });

  it("ties every dimension when all answers are the middle option", () => {
    const scores = computeScoresFinal(allMiddleAnswers(), {});
    for (const pair of [scores.FI, scores.SG, scores.RP, scores.HC, scores.TM]) {
      const [left, right] = Object.values(pair);
      expect(left).toBe(right);
      expect(left).toBeGreaterThan(0);
    }
  });

  it("maps all-middle answers to 51/49 on every dimension including TM", () => {
    const timings: Record<number, number> = {};
    for (const q of FINAL_QUESTIONS) timings[q.id] = 1000;
    const scores = computeScoresFinal(allMiddleAnswers(), {}, timings);
    for (const pair of [scores.FI, scores.SG, scores.RP, scores.HC, scores.TM]) {
      expect(Object.values(pair).sort((a, b) => a - b)).toEqual([49, 51]);
    }
  });
});
