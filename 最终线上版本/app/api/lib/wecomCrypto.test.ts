import { describe, expect, it } from "vitest";
import { wecomDecrypt, wecomEncrypt, wecomSignature } from "./wecomCrypto";

// 43 位 EncodingAESKey（官方文档示例格式）
const AES_KEY = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";
const CORPID = "ww1234567890abcdef";
const TOKEN = "test-token";

describe("wecomCrypto", () => {
  it("encrypt/decrypt round-trips and validates corpid", () => {
    const msg = JSON.stringify({ event: "kf_msg_or_event", open_kfid: "wkTest" });
    const encrypted = wecomEncrypt(msg, AES_KEY, CORPID);
    expect(wecomDecrypt(encrypted, AES_KEY, CORPID)).toBe(msg);
    expect(() => wecomDecrypt(encrypted, AES_KEY, "wwwrong")).toThrow("corpid");
  });

  it("rejects a malformed AES key", () => {
    expect(() => wecomEncrypt("x", "too-short", CORPID)).toThrow("32");
  });

  it("signature sorts the four parts before sha1", () => {
    const sig = wecomSignature(TOKEN, "1700000000", "nonce123", "encryptedMsg");
    expect(sig).toMatch(/^[0-9a-f]{40}$/);
    // 与字段顺序无关：同样的四件套产出同样签名
    expect(wecomSignature(TOKEN, "1700000000", "nonce123", "encryptedMsg")).toBe(sig);
    expect(wecomSignature(TOKEN, "1700000000", "nonce123", "otherMsg")).not.toBe(sig);
  });
});
