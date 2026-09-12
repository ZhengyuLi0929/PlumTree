import { createHash, createHmac, randomBytes } from "node:crypto";
import { aliyunSmsConfigured, env, smsConfigured, tencentSmsConfigured } from "./env";

const TENCENT_HOST = "sms.tencentcloudapi.com";
const TENCENT_SERVICE = "sms";
const TENCENT_ACTION = "SendSms";
const TENCENT_VERSION = "2021-01-11";
const TENCENT_ALGORITHM = "TC3-HMAC-SHA256";

function percentEncode(value: string) {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~");
}

function sha256Hex(message: string) {
  return createHash("sha256").update(message, "utf8").digest("hex");
}

function hmacSha256(key: string | Buffer, message: string) {
  return createHmac("sha256", key).update(message, "utf8").digest();
}

function toE164Cn(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("86") && digits.length === 13) return `+${digits}`;
  if (digits.length === 11) return `+86${digits}`;
  return phone.startsWith("+") ? phone : `+${digits}`;
}

function utcDate(timestamp: number) {
  const date = new Date(timestamp * 1000);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function sendTencentOtpSms(phone: string, code: string) {
  const secretId = env.tencentSecretId;
  const secretKey = env.tencentSecretKey;
  const timestamp = Math.floor(Date.now() / 1000);
  const date = utcDate(timestamp);
  const payload = JSON.stringify({
    PhoneNumberSet: [toE164Cn(phone)],
    SmsSdkAppId: env.tencentSmsSdkAppId,
    SignName: env.tencentSmsSignName,
    TemplateId: env.tencentSmsTemplateId,
    TemplateParamSet: [code],
  });

  const hashedPayload = sha256Hex(payload);
  const canonicalHeaders =
    `content-type:application/json; charset=utf-8\n` +
    `host:${TENCENT_HOST}\n` +
    `x-tc-action:${TENCENT_ACTION.toLowerCase()}\n`;
  const signedHeaders = "content-type;host;x-tc-action";
  const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, hashedPayload].join("\n");
  const credentialScope = `${date}/${TENCENT_SERVICE}/tc3_request`;
  const stringToSign = [TENCENT_ALGORITHM, String(timestamp), credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const secretDate = hmacSha256(`TC3${secretKey}`, date);
  const secretService = hmacSha256(secretDate, TENCENT_SERVICE);
  const secretSigning = hmacSha256(secretService, "tc3_request");
  const signature = createHmac("sha256", secretSigning).update(stringToSign, "utf8").digest("hex");
  const authorization =
    `${TENCENT_ALGORITHM} ` +
    `Credential=${secretId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, ` +
    `Signature=${signature}`;

  const res = await fetch(`https://${TENCENT_HOST}/`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json; charset=utf-8",
      Host: TENCENT_HOST,
      "X-TC-Action": TENCENT_ACTION,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Version": TENCENT_VERSION,
      "X-TC-Region": env.tencentSmsRegion,
      "X-TC-Language": "zh-CN",
    },
    body: payload,
  });

  const json = (await res.json()) as {
    Response?: {
      Error?: { Code?: string; Message?: string };
      SendStatusSet?: Array<{ Code?: string; Message?: string }>;
    };
  };
  const apiError = json.Response?.Error;
  if (apiError) {
    console.error("[sms] tencent", apiError.Code || "Error");
    throw new Error(apiError.Message || apiError.Code || "短信发送失败");
  }
  const status = json.Response?.SendStatusSet?.[0];
  if (!status || status.Code !== "Ok") {
    console.error("[sms] tencent", status?.Code || "SendFailed");
    throw new Error(status?.Message || status?.Code || "短信发送失败");
  }
}

async function sendAliyunOtpSms(phone: string, code: string) {
  const params: Record<string, string> = {
    AccessKeyId: env.aliyunAccessKeyId,
    Action: "SendSms",
    Format: "JSON",
    PhoneNumbers: phone,
    RegionId: "cn-hangzhou",
    SignName: env.smsSignName,
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: randomBytes(16).toString("hex"),
    SignatureVersion: "1.0",
    TemplateCode: env.smsOtpTemplate,
    TemplateParam: JSON.stringify({ code }),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    Version: "2017-05-25",
  };

  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");
  const stringToSign = `POST&${percentEncode("/")}&${percentEncode(canonical)}`;
  const signature = createHmac("sha1", `${env.aliyunAccessKeySecret}&`).update(stringToSign).digest("base64");

  const body = new URLSearchParams({ ...params, Signature: signature });
  const res = await fetch("https://dysmsapi.aliyuncs.com/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as { Code?: string; Message?: string };
  if (json.Code !== "OK") {
    console.error("[sms] aliyun", json.Code || "SendFailed");
    throw new Error(json.Message || json.Code || "短信发送失败");
  }
}

export async function sendOtpSms(phone: string, code: string) {
  if (!smsConfigured()) {
    throw new Error("短信服务未配置");
  }
  if (tencentSmsConfigured()) {
    await sendTencentOtpSms(phone, code);
    return;
  }
  if (aliyunSmsConfigured()) {
    await sendAliyunOtpSms(phone, code);
    return;
  }
  throw new Error("短信服务未配置");
}
