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
    // 未验证用户看到占位符
    return '[🔒 加密消息 - 需要验证]'
  }

  // 兼容旧格式（字符串）
  if (typeof encryptedData === 'string') {
    return encryptedData
  }

  try {
    return await decryptMessage(contentKey, encryptedData)
  } catch (error) {
    console.error('解密消息失败:', error)
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
