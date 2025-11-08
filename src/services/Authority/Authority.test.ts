import {
  createRoomAuthority,
  saveCreatorInfo,
  loadCreatorInfo,
  restoreCreatorAuthority,
  isCreator,
} from './Authority'
import { verifyAuthorityPackage } from 'services/Encryption'

describe('Authority 服务测试', () => {
  const roomId = 'test-room-123'
  const password = 'test-password'

  beforeEach(() => {
    localStorage.clear()
  })

  describe('创建房间权限', () => {
    test('应该能创建房间并初始化权限系统', async () => {
      const result = await createRoomAuthority(roomId, password)

      expect(result.authorityPackage).toBeDefined()
      expect(result.contentKey).toBeDefined()
      expect(result.publicKey).toBeDefined()
      expect(result.privateKey).toBeDefined()

      // 验证 L 的结构
      expect(result.authorityPackage.version).toBe(1)
      expect(result.authorityPackage.keyset).toEqual([])
      expect(result.authorityPackage.signature).toBeDefined()

      // 验证签名
      const valid = await verifyAuthorityPackage(
        result.authorityPackage,
        result.publicKey
      )
      expect(valid).toBe(true)
    })

    test('创建房间后应该自动保存 CreatorInfo', async () => {
      await createRoomAuthority(roomId, password)

      const storageKey = `chitchatter_creator_${roomId}`
      const stored = localStorage.getItem(storageKey)

      expect(stored).not.toBeNull()
    })
  })

  describe('CreatorInfo 存储与恢复', () => {
    test('应该能保存和加载 CreatorInfo', async () => {
      const { publicKey, privateKey, contentKey } = await createRoomAuthority(
        roomId,
        password
      )

      // 加载
      const loaded = await loadCreatorInfo(roomId, password)

      expect(loaded).not.toBeNull()
      expect(loaded?.roomId).toBe(roomId)
      expect(loaded?.role).toBe('creator')
      expect(loaded?.publicKey).toBeDefined()
      expect(loaded?.privateKey).toBeDefined()
      expect(loaded?.contentKey).toBeDefined()
    })

    test('错误的密码应该无法加载 CreatorInfo', async () => {
      await createRoomAuthority(roomId, password)

      const loaded = await loadCreatorInfo(roomId, 'wrong-password')

      expect(loaded).toBeNull()
    })

    test('不存在的房间应该返回 null', async () => {
      const loaded = await loadCreatorInfo('non-existent-room', password)

      expect(loaded).toBeNull()
    })
  })

  describe('恢复创建者权限', () => {
    test('应该能恢复创建者权限', async () => {
      // 创建房间
      const original = await createRoomAuthority(roomId, password)

      // 恢复
      const restored = await restoreCreatorAuthority(roomId, password)

      expect(restored).not.toBeNull()
      expect(restored?.contentKey).toBeDefined()
      expect(restored?.publicKey).toBeDefined()
      expect(restored?.privateKey).toBeDefined()
    })

    test('错误的密码应该无法恢复', async () => {
      await createRoomAuthority(roomId, password)

      const restored = await restoreCreatorAuthority(roomId, 'wrong-password')

      expect(restored).toBeNull()
    })
  })

  describe('检查创建者身份', () => {
    test('创建房间后应该识别为创建者', async () => {
      await createRoomAuthority(roomId, password)

      expect(isCreator(roomId)).toBe(true)
    })

    test('未创建的房间应该返回 false', () => {
      expect(isCreator('non-existent-room')).toBe(false)
    })
  })

  describe('完整流程测试', () => {
    test('创建 -> 关闭 -> 重新打开 -> 恢复', async () => {
      // 1. 创建房间
      const created = await createRoomAuthority(roomId, password)
      expect(created.authorityPackage.version).toBe(1)

      // 2. 模拟关闭浏览器（清除内存状态）
      // （localStorage 保留）

      // 3. 重新打开，检查是否是创建者
      expect(isCreator(roomId)).toBe(true)

      // 4. 恢复权限
      const restored = await restoreCreatorAuthority(roomId, password)
      expect(restored).not.toBeNull()
      expect(restored?.contentKey).toBeDefined()

      // 5. 验证恢复的密钥可用
      const testMessage = 'Hello, World!'
      const iv = window.crypto.getRandomValues(new Uint8Array(12))
      const encoded = new TextEncoder().encode(testMessage)

      const encrypted = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        restored!.contentKey!,
        encoded
      )

      const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        restored!.contentKey!,
        encrypted
      )

      const decryptedMessage = new TextDecoder().decode(decrypted)
      expect(decryptedMessage).toBe(testMessage)
    })
  })
})
