import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

function optional(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export const env = {
  appId: required("APP_ID"),
  appSecret: required("APP_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  inviteCode: optional("INVITE_CODE", "RDFZNB").toUpperCase(),
  adminPassword: optional("ADMIN_PASSWORD"),
  tencentSecretId: optional("TENCENT_SECRET_ID"),
  tencentSecretKey: optional("TENCENT_SECRET_KEY"),
  tencentSmsSdkAppId: optional("TENCENT_SMS_SDK_APP_ID"),
  tencentSmsSignName: optional("TENCENT_SMS_SIGN_NAME"),
  tencentSmsTemplateId: optional("TENCENT_SMS_TEMPLATE_ID"),
  tencentSmsRegion: optional("TENCENT_SMS_REGION", "ap-guangzhou"),
  aliyunAccessKeyId: optional("ALIYUN_ACCESS_KEY_ID"),
  aliyunAccessKeySecret: optional("ALIYUN_ACCESS_KEY_SECRET"),
  smsSignName: optional("SMS_SIGN_NAME"),
  smsOtpTemplate: optional("SMS_OTP_TEMPLATE"),
  // 微信月老机器人（企业微信客服 + LLM）
  wecomCorpid: optional("WECOM_CORPID"),
  wecomKfSecret: optional("WECOM_KF_SECRET"),
  wecomKfOpenid: optional("WECOM_KF_OPENID"),
  wecomToken: optional("WECOM_TOKEN"),
  wecomAesKey: optional("WECOM_AES_KEY"),
  llmApiKey: optional("LLM_API_KEY"),
  llmBaseUrl: optional("LLM_BASE_URL", "https://api.moonshot.cn/v1"),
  llmModel: optional("LLM_MODEL", "kimi-k2-0905-preview"),
  // T5 合规：字段级加密密钥 / 第三方内容安全 API（接口位预留）
  fieldEncryptionKey: optional("FIELD_ENCRYPTION_KEY"),
  contentSafetyUrl: optional("CONTENT_SAFETY_URL"),
};

export function wecomConfigured() {
  return Boolean(env.wecomCorpid && env.wecomKfSecret && env.wecomKfOpenid && env.wecomToken && env.wecomAesKey);
}

export function tencentSmsConfigured() {
  return Boolean(
    env.tencentSecretId &&
      env.tencentSecretKey &&
      env.tencentSmsSdkAppId &&
      env.tencentSmsSignName &&
      env.tencentSmsTemplateId,
  );
}

export function aliyunSmsConfigured() {
  return Boolean(env.aliyunAccessKeyId && env.aliyunAccessKeySecret && env.smsSignName && env.smsOtpTemplate);
}

export function smsConfigured() {
  return tencentSmsConfigured() || aliyunSmsConfigured();
}
