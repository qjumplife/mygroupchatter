import { AuthorityPackage, InviteKeyRecord } from 'models/authority'
import { verifyAuthorityPackage, decryptContentKey } from 'services/Encryption'

export interface VerificationResult {
  success: boolean
  reason?: string
  record?: InviteKeyRecord
}

/**
 * 验证邀请密钥
 */
export const verifyInviteKey = async (
  hashKi: string,
  L: AuthorityPackage,
  publicKey?: CryptoKey
): Promise<VerificationResult> => {
  // 1. 验证 L 签名（如果有公钥）
  if (publicKey) {
    const signatureValid = await verifyAuthorityPackage(L, publicKey)
    if (!signatureValid) {
      return { success: false, reason: 'INVALID_SIGNATURE' }
    }
  }

  // 2. 查找匹配的记录
  const record = L.keyset.find(k => k.hash === hashKi)
  if (!record) {
    return { success: false, reason: 'INVALID_KEY' }
  }

  // 3. 检查状态
  if (record.status !== 'ACTIVE') {
    return { success: false, reason: `KEY_${record.status}` }
  }

  // 4. 检查过期
  if (new Date(record.expiration).getTime() < Date.now()) {
    return { success: false, reason: 'KEY_EXPIRED' }
  }

  return { success: true, record }
}

/**
 * 标记密钥为已使用
 */
export const markKeyAsUsed = (
  L: AuthorityPackage,
  hashKi: string,
  peerId: string
): AuthorityPackage => {
  const newKeyset = L.keyset.map(record =>
    record.hash === hashKi
      ? { ...record, status: 'USED' as const, usedBy: peerId }
      : record
  )

  return {
    roomId: L.roomId,
    version: L.version + 1,
    timestamp: new Date().toISOString(),
    createdAt: L.createdAt,
    creatorId: L.creatorId,
    keyset: newKeyset,
    signature: L.signature,
  }
}

/**
 * 解密 Content Key（用于 Pnew）
 */
export const decryptContentKeyWithKi = async (
  encryptedContentKey: { iv: string; ciphertext: string },
  Ki: string
): Promise<CryptoKey> => {
  return await decryptContentKey(encryptedContentKey, Ki)
}
