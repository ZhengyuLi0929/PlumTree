// 企业微信客服回调消息加解密（WXBizMsgCrypt 官方算法的 Node 实现）
// AES-256-CBC：key = Base64.decode(EncodingAESKey + "=")，iv = key 前 16 字节
// 明文结构：random(16) + msgLen(4, BE) + msg + corpid；PKCS7 按 32 字节块补齐
import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const BLOCK = 32;

function keyOf(encodingAesKey: string) {
  const key = Buffer.from(encodingAesKey + "=", "base64");
  if (key.length !== 32) throw new Error("WECOM_AES_KEY 解码后应为 32 字节");
  return { key, iv: key.subarray(0, 16) };
}

export function wecomSignature(token: string, timestamp: string, nonce: string, encryptMsg: string) {
  return createHash("sha1")
    .update([token, timestamp, nonce, encryptMsg].sort().join(""))
    .digest("hex");
}

export function wecomEncrypt(msg: string, encodingAesKey: string, corpid: string) {
  const { key, iv } = keyOf(encodingAesKey);
  const msgBuf = Buffer.from(msg, "utf8");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(msgBuf.length);
  const plain = Buffer.concat([randomBytes(16), lenBuf, msgBuf, Buffer.from(corpid, "utf8")]);
  const padLen = BLOCK - (plain.length % BLOCK);
  const padded = Buffer.concat([plain, Buffer.alloc(padLen, padLen)]);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString("base64");
}

export function wecomDecrypt(encryptMsg: string, encodingAesKey: string, expectCorpid: string) {
  const { key, iv } = keyOf(encodingAesKey);
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(encryptMsg, "base64"), decipher.final()]);
  const padLen = decrypted[decrypted.length - 1];
  if (padLen < 1 || padLen > BLOCK) throw new Error("PKCS7 填充非法");
  const content = decrypted.subarray(16, decrypted.length - padLen);
  const msgLen = content.readUInt32BE(0);
  const msg = content.subarray(4, 4 + msgLen).toString("utf8");
  const corpid = content.subarray(4 + msgLen).toString("utf8");
  if (expectCorpid && corpid !== expectCorpid) throw new Error("corpid 不匹配");
  return msg;
}
