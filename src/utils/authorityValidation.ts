import { AuthorityPackage, CreatorClaim, InviteKeyRecord } from 'models/authority'
import { JoinRequestMessage, JoinResponseMessage } from 'services/Serialization'

type ValidationResult = { valid: boolean; errors: string[] }

/**
 * 验证 AuthorityPackage
 */
export function validateAuthorityPackage(
  pkg: AuthorityPackage,
  context: string = 'Unknown'
): ValidationResult {
  const errors: string[] = []

  if (!pkg.roomId) errors.push('缺少 roomId')
  if (!pkg.creatorId) errors.push('缺少 creatorId')
  if (!pkg.createdAt) errors.push('缺少 createdAt')
  if (!pkg.version || pkg.version < 1) errors.push('version 无效')
  if (!pkg.timestamp) errors.push('缺少 timestamp')
  if (!pkg.keyset) errors.push('缺少 keyset')

  if (errors.length > 0) {
    console.error(`[${context}] AuthorityPackage 验证失败:`, { errors, package: pkg })
  }

  return { valid: errors.length === 0, errors }
}

/**
 * 验证 CreatorClaim
 */
export function validateCreatorClaim(
  claim: CreatorClaim,
  context: string = 'Unknown'
): ValidationResult {
  const errors: string[] = []

  if (!claim.userId) errors.push('缺少 userId')
  if (!claim.publicKey) errors.push('缺少 publicKey')
  if (!claim.signature) errors.push('缺少 signature')
  if (typeof claim.sequence !== 'number') errors.push('sequence 无效')
  if (typeof claim.timestamp !== 'number') errors.push('timestamp 无效')

  if (errors.length > 0) {
    console.error(`[${context}] CreatorClaim 验证失败:`, { errors, claim })
  }

  return { valid: errors.length === 0, errors }
}

/**
 * 验证 InviteKeyRecord
 */
export function validateInviteKeyRecord(
  record: InviteKeyRecord,
  context: string = 'Unknown'
): ValidationResult {
  const errors: string[] = []

  if (!record.hash) errors.push('缺少 hash')
  if (!record.expiration) errors.push('缺少 expiration')
  if (!record.status) errors.push('缺少 status')
  if (!record.createdAt) errors.push('缺少 createdAt')
  if (!record.encryptedContentKey) errors.push('缺少 encryptedContentKey')
  else {
    if (!record.encryptedContentKey.iv) errors.push('encryptedContentKey 缺少 iv')
    if (!record.encryptedContentKey.ciphertext) errors.push('encryptedContentKey 缺少 ciphertext')
  }

  if (errors.length > 0) {
    console.error(`[${context}] InviteKeyRecord 验证失败:`, { errors, record })
  }

  return { valid: errors.length === 0, errors }
}

/**
 * 验证 JoinRequestMessage
 */
export function validateJoinRequest(
  msg: JoinRequestMessage,
  context: string = 'Unknown'
): ValidationResult {
  const errors: string[] = []

  if (msg.type !== 'JOIN_REQUEST') errors.push('type 不是 JOIN_REQUEST')
  if (!msg.hashKi) errors.push('缺少 hashKi')
  if (!msg.peerId) errors.push('缺少 peerId')
  if (!msg.userId) errors.push('缺少 userId')

  if (errors.length > 0) {
    console.error(`[${context}] JoinRequestMessage 验证失败:`, { errors, msg })
  }

  return { valid: errors.length === 0, errors }
}

/**
 * 验证 JoinResponseMessage
 */
export function validateJoinResponse(
  msg: JoinResponseMessage,
  context: string = 'Unknown'
): ValidationResult {
  const errors: string[] = []

  if (msg.type !== 'JOIN_RESPONSE') errors.push('type 不是 JOIN_RESPONSE')
  if (!msg.result || !['ALLOW', 'DENY'].includes(msg.result)) errors.push('result 无效')
  if (msg.result === 'ALLOW' && !msg.encryptedContentKey) errors.push('ALLOW 响应缺少 encryptedContentKey')

  if (errors.length > 0) {
    console.error(`[${context}] JoinResponseMessage 验证失败:`, { errors, msg })
  }

  return { valid: errors.length === 0, errors }
}

/**
 * 通用断言函数（开发模式显示警告）
 */
function assert(result: ValidationResult, context: string, typeName: string): boolean {
  if (!result.valid && import.meta.env.DEV) {
    const errorMsg = `${typeName} 验证失败 [${context}]:\n${result.errors.join('\n')}`
    console.error(errorMsg)
    alert(errorMsg)
  }
  return result.valid
}

export function assertAuthorityPackage(pkg: AuthorityPackage, context: string = 'Unknown'): boolean {
  return assert(validateAuthorityPackage(pkg, context), context, 'AuthorityPackage')
}

export function assertCreatorClaim(claim: CreatorClaim, context: string = 'Unknown'): boolean {
  return assert(validateCreatorClaim(claim, context), context, 'CreatorClaim')
}

export function assertInviteKeyRecord(record: InviteKeyRecord, context: string = 'Unknown'): boolean {
  return assert(validateInviteKeyRecord(record, context), context, 'InviteKeyRecord')
}

export function assertJoinRequest(msg: JoinRequestMessage, context: string = 'Unknown'): boolean {
  return assert(validateJoinRequest(msg, context), context, 'JoinRequestMessage')
}

export function assertJoinResponse(msg: JoinResponseMessage, context: string = 'Unknown'): boolean {
  return assert(validateJoinResponse(msg, context), context, 'JoinResponseMessage')
}
