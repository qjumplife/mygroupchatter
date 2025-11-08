import {
  encryptMessageContent,
  decryptMessageContent,
  canSendMessage,
  canDecryptMessage,
} from './MessageEncryption'
import { generateContentKey } from 'services/Encryption'

describe('MessageEncryption 服务测试', () => {
  let contentKey: CryptoKey

  beforeEach(async () => {
    contentKey = await generateContentKey()
  })

  describe('encryptMessageContent', () => {
    test('应该能加密消息', async () => {
      const plaintext = 'Hello, World!'
      const encrypted = await encryptMessageContent(contentKey, plaintext)

      expect(encrypted).toBeDefined()
      expect(typeof encrypted).toBe('object')
      expect((encrypted as any).iv).toBeDefined()
      expect((encrypted as any).ciphertext).toBeDefined()
    })

    test('没有 contentKey 应该抛出错误', async () => {
      await expect(encryptMessageContent(null, 'test')).rejects.toThrow('NO_CONTENT_KEY')
    })
  })

  describe('decryptMessageContent', () => {
    test('应该能解密消息', async () => {
      const plaintext = 'Hello, World!'
      const encrypted = await encryptMessageContent(contentKey, plaintext)
      const decrypted = await decryptMessageContent(contentKey, encrypted)

      expect(decrypted).toBe(plaintext)
    })

    test('没有 contentKey 应该返回占位符', async () => {
      const encrypted = { iv: 'test', ciphertext: 'test' }
      const result = await decryptMessageContent(null, encrypted)

      expect(result).toBe('[🔒 加密消息 - 需要验证]')
    })

    test('兼容旧格式（字符串）', async () => {
      const oldFormat = 'plain text message'
      const result = await decryptMessageContent(contentKey, oldFormat)

      expect(result).toBe(oldFormat)
    })

    test('解密失败应该返回错误提示', async () => {
      const invalidEncrypted = { iv: 'invalid', ciphertext: 'invalid' }
      const result = await decryptMessageContent(contentKey, invalidEncrypted)

      expect(result).toBe('[❌ 解密失败]')
    })
  })

  describe('canSendMessage', () => {
    test('有 contentKey 应该返回 true', () => {
      expect(canSendMessage(contentKey)).toBe(true)
    })

    test('没有 contentKey 应该返回 false', () => {
      expect(canSendMessage(null)).toBe(false)
    })
  })

  describe('canDecryptMessage', () => {
    test('有 contentKey 应该返回 true', () => {
      expect(canDecryptMessage(contentKey)).toBe(true)
    })

    test('没有 contentKey 应该返回 false', () => {
      expect(canDecryptMessage(null)).toBe(false)
    })
  })

  describe('完整加密解密流程', () => {
    test('发送方加密 -> 接收方解密', async () => {
      const originalMessage = 'This is a secret message!'

      // 发送方加密
      const encrypted = await encryptMessageContent(contentKey, originalMessage)

      // 接收方解密
      const decrypted = await decryptMessageContent(contentKey, encrypted)

      expect(decrypted).toBe(originalMessage)
    })

    test('未验证用户无法看到消息内容', async () => {
      const originalMessage = 'Secret message'

      // 发送方加密
      const encrypted = await encryptMessageContent(contentKey, originalMessage)

      // 未验证用户尝试解密
      const result = await decryptMessageContent(null, encrypted)

      expect(result).toBe('[🔒 加密消息 - 需要验证]')
      expect(result).not.toBe(originalMessage)
    })

    test('多条消息加密解密', async () => {
      const messages = [
        'Message 1',
        'Message 2',
        'Message 3',
      ]

      for (const msg of messages) {
        const encrypted = await encryptMessageContent(contentKey, msg)
        const decrypted = await decryptMessageContent(contentKey, encrypted)
        expect(decrypted).toBe(msg)
      }
    })
  })
})
