import { GroupClaim, JoinRequest, JoinResponse, MessageType, ValidationError, InviteKeyRecord } from 'models/groupClaim'

export interface ValidationResult {
  isValid: boolean
  error?: ValidationError
  message?: string
}

// 调试日志工具
export const logValidation = (
  messageType: MessageType,
  action: 'SEND' | 'RECEIVE',
  result: ValidationResult,
  data?: any
) => {
  const prefix = `[${messageType}][${action}]`
  
  if (result.isValid) {
    console.log(`${prefix} ✅ 验证通过`, data ? { summary: getSummary(messageType, data) } : '')
  } else {
    console.error(`${prefix} ❌ 验证失败: ${result.error} - ${result.message}`, data)
  }
}

// 获取消息摘要信息
const getSummary = (messageType: MessageType, data: any) => {
  switch (messageType) {
    case MessageType.GROUP_CLAIM:
      const gc = data as GroupClaim
      return {
        roomId: gc.roomId?.substring(0, 8) + '...',
        creatorId: gc.creatorId?.substring(0, 8) + '...',
        version: gc.version,
        keysetCount: gc.keyset?.length || 0
      }
    case MessageType.JOIN_REQUEST:
      const jr = data as JoinRequest
      return {
        userId: jr.userId?.substring(0, 8) + '...',
        hashKi: jr.hashKi?.substring(0, 16) + '...'
      }
    case MessageType.JOIN_RESPONSE:
      const jres = data as JoinResponse
      return {
        result: jres.result,
        reason: jres.reason,
        hasGroupClaim: !!jres.groupClaim
      }
    default:
      return data
  }
}

// GroupClaim 验证
export const validateGroupClaim = (data: any): ValidationResult => {
  if (!data || typeof data !== 'object') {
    return {
      isValid: false,
      error: ValidationError.INVALID_STRUCTURE,
      message: 'GroupClaim must be an object'
    }
  }

  const required = ['createdAt', 'roomId', 'creatorId', 'version', 'timestamp', 'publicKey', 'signature']
  for (const field of required) {
    if (!data[field]) {
      return {
        isValid: false,
        error: ValidationError.MISSING_REQUIRED_FIELD,
        message: `Missing required field: ${field}`
      }
    }
  }

  // 类型验证
  if (typeof data.version !== 'number' || data.version < 1) {
    return {
      isValid: false,
      error: ValidationError.INVALID_FIELD_TYPE,
      message: 'version must be a positive number'
    }
  }

  if (!Array.isArray(data.keyset)) {
    return {
      isValid: false,
      error: ValidationError.INVALID_FIELD_TYPE,
      message: 'keyset must be an array'
    }
  }

  // 验证keyset中的每个记录
  for (let i = 0; i < data.keyset.length; i++) {
    const keyRecord = data.keyset[i]
    const keyValidation = validateInviteKeyRecord(keyRecord)
    if (!keyValidation.isValid) {
      return {
        isValid: false,
        error: keyValidation.error,
        message: `keyset[${i}]: ${keyValidation.message}`
      }
    }
  }

  // 公钥格式验证（Ed25519公钥Base64编码后长度应该是44字符）
  if (typeof data.publicKey !== 'string') {
    return {
      isValid: false,
      error: ValidationError.INVALID_PUBLIC_KEY,
      message: 'publicKey must be a string'
    }
  }
  
  // 检查Base64格式和长度
  try {
    const decoded = atob(data.publicKey)
    if (decoded.length !== 32) { // Ed25519公钥是32字节
      return {
        isValid: false,
        error: ValidationError.INVALID_PUBLIC_KEY,
        message: 'Ed25519 public key must be 32 bytes (44 Base64 chars)'
      }
    }
  } catch {
    return {
      isValid: false,
      error: ValidationError.INVALID_PUBLIC_KEY,
      message: 'publicKey must be valid Base64'
    }
  }

  return { isValid: true }
}

// InviteKeyRecord 验证
export const validateInviteKeyRecord = (data: any): ValidationResult => {
  if (!data || typeof data !== 'object') {
    return {
      isValid: false,
      error: ValidationError.INVALID_STRUCTURE,
      message: 'InviteKeyRecord must be an object'
    }
  }

  const required = ['hash', 'expiration', 'status', 'createdAt', 'creatorId', 'roomId', 'sequence', 'encryptedContentKey']
  for (const field of required) {
    if (data[field] === undefined || data[field] === null) {
      return {
        isValid: false,
        error: ValidationError.MISSING_REQUIRED_FIELD,
        message: `Missing required field: ${field}`
      }
    }
  }

  // 状态验证
  if (!['ACTIVE', 'USED', 'REVOKED'].includes(data.status)) {
    return {
      isValid: false,
      error: ValidationError.INVALID_FIELD_TYPE,
      message: 'status must be ACTIVE, USED, or REVOKED'
    }
  }

  // 序号验证
  if (typeof data.sequence !== 'number' || data.sequence < 1) {
    return {
      isValid: false,
      error: ValidationError.INVALID_FIELD_TYPE,
      message: 'sequence must be a positive number'
    }
  }

  // 加密内容验证
  if (!data.encryptedContentKey?.iv || !data.encryptedContentKey?.ciphertext) {
    return {
      isValid: false,
      error: ValidationError.INVALID_STRUCTURE,
      message: 'encryptedContentKey must have iv and ciphertext'
    }
  }

  return { isValid: true }
}

// JoinRequest 验证
export const validateJoinRequest = (data: any): ValidationResult => {
  if (!data || typeof data !== 'object') {
    return {
      isValid: false,
      error: ValidationError.INVALID_STRUCTURE,
      message: 'JoinRequest must be an object'
    }
  }

  if (data.type !== 'JOIN_REQUEST') {
    return {
      isValid: false,
      error: ValidationError.INVALID_FIELD_TYPE,
      message: 'type must be JOIN_REQUEST'
    }
  }

  const required = ['hashKi', 'userId']
  for (const field of required) {
    if (!data[field]) {
      return {
        isValid: false,
        error: ValidationError.MISSING_REQUIRED_FIELD,
        message: `Missing required field: ${field}`
      }
    }
  }

  return { isValid: true }
}

// JoinResponse 验证
export const validateJoinResponse = (data: any): ValidationResult => {
  if (!data || typeof data !== 'object') {
    return {
      isValid: false,
      error: ValidationError.INVALID_STRUCTURE,
      message: 'JoinResponse must be an object'
    }
  }

  if (data.type !== 'JOIN_RESPONSE') {
    return {
      isValid: false,
      error: ValidationError.INVALID_FIELD_TYPE,
      message: 'type must be JOIN_RESPONSE'
    }
  }

  if (!['ALLOW', 'DENY'].includes(data.result)) {
    return {
      isValid: false,
      error: ValidationError.INVALID_FIELD_TYPE,
      message: 'result must be ALLOW or DENY'
    }
  }

  // ALLOW时必须有encryptedContentKey和groupClaim
  if (data.result === 'ALLOW') {
    if (!data.encryptedContentKey?.iv || !data.encryptedContentKey?.ciphertext) {
      return {
        isValid: false,
        error: ValidationError.MISSING_REQUIRED_FIELD,
        message: 'ALLOW response must include encryptedContentKey'
      }
    }

    if (!data.groupClaim) {
      return {
        isValid: false,
        error: ValidationError.MISSING_REQUIRED_FIELD,
        message: 'ALLOW response must include groupClaim'
      }
    }

    // 验证附带的GroupClaim
    const gcValidation = validateGroupClaim(data.groupClaim)
    if (!gcValidation.isValid) {
      return {
        isValid: false,
        error: gcValidation.error,
        message: `Invalid groupClaim: ${gcValidation.message}`
      }
    }
  }

  // DENY时应该有reason
  if (data.result === 'DENY' && !data.reason) {
    return {
      isValid: false,
      error: ValidationError.MISSING_REQUIRED_FIELD,
      message: 'DENY response should include reason'
    }
  }

  return { isValid: true }
}

// 统一验证入口
export const validateMessage = (messageType: MessageType, data: any): ValidationResult => {
  switch (messageType) {
    case MessageType.GROUP_CLAIM:
      return validateGroupClaim(data)
    case MessageType.JOIN_REQUEST:
      return validateJoinRequest(data)
    case MessageType.JOIN_RESPONSE:
      return validateJoinResponse(data)
    default:
      return {
        isValid: false,
        error: ValidationError.INVALID_STRUCTURE,
        message: `Unknown message type: ${messageType}`
      }
  }
}