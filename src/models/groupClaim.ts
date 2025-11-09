// 改造后的消息结构定义

export interface GroupClaim {
  createdAt: string        // 创建时间（竞争依据）
  roomId: string           // 房间ID
  creatorId: string        // 创建者userId
  version: number          // 版本号（单调递增）
  timestamp: string        // 更新时间
  publicKey: string        // Ed25519公钥（Base64）
  keyset: InviteKeyRecord[] // 邀请码记录
  signature: string        // Ed25519签名
}

export interface InviteKeyRecord {
  hash: string             // SHA-256(邀请码)
  expiration: string       // 过期时间
  status: 'ACTIVE' | 'USED' | 'REVOKED'
  usedBy?: string          // 使用者userId
  createdAt: string        // 创建时间
  creatorId: string        // 创建者userId
  roomId: string           // 房间ID
  sequence: number         // 邀请序号（第几个）
  encryptedContentKey: {   // 用邀请码加密的ContentKey
    iv: string
    ciphertext: string
  }
}

export interface JoinRequest {
  type: 'JOIN_REQUEST'
  hashKi: string           // SHA-256(邀请码)
  userId: string           // 请求者userId
}

export interface JoinResponse {
  type: 'JOIN_RESPONSE'
  result: 'ALLOW' | 'DENY'
  reason?: string          // 拒绝原因
  encryptedContentKey?: {  // 成功时的ContentKey
    iv: string
    ciphertext: string
  }
  groupClaim?: GroupClaim  // 成功时附带GroupClaim
}

// 消息类型枚举
export enum MessageType {
  GROUP_CLAIM = 'GROUP_CLAIM',
  JOIN_REQUEST = 'JOIN_REQUEST', 
  JOIN_RESPONSE = 'JOIN_RESPONSE'
}

// 消息验证错误类型
export enum ValidationError {
  INVALID_STRUCTURE = 'INVALID_STRUCTURE',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_FIELD_TYPE = 'INVALID_FIELD_TYPE',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  INVALID_PUBLIC_KEY = 'INVALID_PUBLIC_KEY',
  INVALID_ROOM_ID = 'INVALID_ROOM_ID',
  INVALID_VERSION = 'INVALID_VERSION'
}