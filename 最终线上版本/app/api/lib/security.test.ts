import { describe, expect, it } from "vitest";
import { decryptText, encryptText } from "./fieldCrypto";
import { screenText } from "./safety";

describe("fieldCrypto", () => {
  it("round-trips with a key, storing ciphertext with enc1: prefix", () => {
    process.env.FIELD_ENCRYPTION_KEY = "test-field-key";
    const enc = encryptText("身高必须 175 以上")!;
    expect(enc.startsWith("enc1:")).toBe(true);
    expect(enc).not.toContain("175");
    expect(decryptText(enc)).toBe("身高必须 175 以上");
    delete process.env.FIELD_ENCRYPTION_KEY;
  });

  it("passes plaintext through when no key, and reads legacy plaintext", () => {
    delete process.env.FIELD_ENCRYPTION_KEY;
    expect(encryptText("明文")).toBe("明文");
    expect(decryptText("明文")).toBe("明文");
    expect(decryptText(null)).toBe(null);
  });
});

describe("safety", () => {
  it("blocks harassing content by keyword", async () => {
    expect((await screenText("约炮吗")).ok).toBe(false);
    expect((await screenText("周末一起去爬山吧")).ok).toBe(true);
  });
});
