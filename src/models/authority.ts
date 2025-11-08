// 权限控制系统的数据结构定义

export type KeyStatus = "ACTIVE" | "USED" | "REVOKED" | "EXPIRED"

export interface EncryptedData {
  iv: string                         // Base64 编码的 IV
  ciphertext: string                 // Base64 编码的密文
}

export interface InviteKeyRecord {
  hash: string                       // SHA-256(Ki) Base64
  expiration: string                 // UTC ISO 8601
  status: KeyStatus
  usedBy: string | null             // Peer ID
  createdAt: string                  // UTC ISO 8601
  encryptedContentKey: EncryptedData // 用 Ki 加密的 Content Key
}

export interface AuthorityPackage {
  version: number                    // 单调递增版本号
  timestamp: string                  // UTC ISO 8601
  keyset: InviteKeyRecord[]         // 密钥记录数组
  signature: string                  // Ed25519 签名（Base64）
}

export interface InviteKey {
  key: string                        // 原始密钥（如 "S7X-93F-G5T-HF8"）
  ttl: string                        // 过期时间
}

export interface CreatorInfo {
  roomId: string
  role: "creator"
  privateKey: string                 // Ed25519 私钥（Base64）
  publicKey: string                  // Ed25519 公钥（Base64）
  contentKey: string                 // Content Key（Base64）
  createdAt: string
  sequence: number                   // 加入序号（1 = 创建者）
  claimHash: string                  // 声明的哈希值
}

export interface CreatorClaim {
  sequence: number                   // 加入序号
  userId: string                     // 用户ID
  timestamp: number                  // 时间戳（毫秒）
  publicKey: string                  // 公钥（Base64）
  signature: string                  // 签名（Base64）
  claimHash?: string                 // 自身哈希（计算后填充）
}

export interface VerifiedUserInfo {
  roomId: string
  userId: string                     // 用户ID（公钥指纹）
  contentKey: string                 // Content Key（Base64）
  verifiedAt: number                 // 时间戳
  inviteKeyHash: string              // 用于审计
}
