import { encryptMessage, decryptMessage } from 'services/Encryption'
import { EncryptedData } from 'models/authority'

/**
 * 加密消息内容
 */
export const encryptMessageContent = async (
  contentKey: CryptoKey | null,
  plaintext: string
): Promise<string | EncryptedData> => {
  if (!contentKey) {
    // 未验证用户不能发送消息
    throw new Error('NO_CONTENT_KEY')
  }

  return await encryptMessage(contentKey, plaintext)
}

/**
 * 解密消息内容
 */
export const decryptMessageContent = async (
  contentKey: CryptoKey | null,
  encryptedData: EncryptedData | string
): Promise<string> => {
  if (!contentKey) {
    console.log('[消息解密] 无contentKey，返回占位符')
    return '[🔒 加密消息 - 需要验证]'
  }

  // 兼容旧格式（字符串）
  if (typeof encryptedData === 'string') {
    console.log('[消息解密] 检测到明文消息，直接返回')
    return encryptedData
  }

  try {
    const decrypted = await decryptMessage(contentKey, encryptedData)
    console.log('[消息解密] 解密成功')
    return decrypted
  } catch (error) {
    console.error('[消息解密] 解密失败:', error)
    return '[❌ 解密失败]'
  }
}

/**
 * 检查是否可以发送消息
 */
export const canSendMessage = (contentKey: CryptoKey | null): boolean => {
  return contentKey !== null
}

/**
 * 检查是否可以解密消息
 */
export const canDecryptMessage = (contentKey: CryptoKey | null): boolean => {
  return contentKey !== null
}
