import { describe, expect, it } from "vitest";
import { MBTI_TYPES } from "./mbti";

const ALL_CODES = [
  "ISTJ", "ISFJ", "INFJ", "INTJ",
  "ISTP", "ISFP", "INFP", "INTP",
  "ESTP", "ESFP", "ENFP", "ENTP",
  "ESTJ", "ESFJ", "ENFJ", "ENTJ",
];

const entries = Object.entries(MBTI_TYPES);

describe("MBTI_TYPES", () => {
  it("contains exactly 16 types, each keyed by its code", () => {
    expect(entries).toHaveLength(16);
    for (const [key, type] of entries) {
      expect(key).toBe(type.code);
    }
  });

  it("gives every type a non-empty Chinese name", () => {
    for (const type of Object.values(MBTI_TYPES)) {
      expect(type.name.length).toBeGreaterThan(0);
      expect(type.name).toMatch(/^[\u4e00-\u9fff]+$/);
    }
  });

  it("gives every type a non-empty love description of at most 30 code points", () => {
    for (const type of Object.values(MBTI_TYPES)) {
      const length = [...type.love].length;
      expect(length).toBeGreaterThan(0);
      expect(length).toBeLessThanOrEqual(30);
    }
  });

  it("gives every type an avatar at /mbti/<CODE>.svg matching its code", () => {
    for (const type of Object.values(MBTI_TYPES)) {
      expect(type.avatar).toMatch(/^\/mbti\/[A-Z]{4}\.svg$/);
      expect(type.avatar).toBe(`/mbti/${type.code}.svg`);
    }
  });

  it("covers exactly the 16 MBTI codes", () => {
    expect(Object.keys(MBTI_TYPES).sort()).toEqual([...ALL_CODES].sort());
    expect(Object.values(MBTI_TYPES).map((t) => t.code).sort()).toEqual(
      [...ALL_CODES].sort(),
    );
  });
});
