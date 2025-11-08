import { verifyInviteKey, markKeyAsUsed, decryptContentKeyWithKi } from './Verification'
import { createRoomAuthority } from './Authority'
import { generateInviteKey, sha256, encryptContentKey, signAuthorityPackage, exportKey } from 'services/Encryption'

describe('Verification 服务测试', () => {
  let roomAuthority: Awaited<ReturnType<typeof createRoomAuthority>>
  let Ki: string
  let hashKi: string

  beforeEach(async () => {
    roomAuthority = await createRoomAuthority('test-room', 'test-password')
    
    // 生成一个测试密钥
    Ki = generateInviteKey()
    hashKi = await sha256(Ki)
    
    const encryptedContentKey = await encryptContentKey(roomAuthority.contentKey, Ki)
    
    const newL = {
      version: roomAuthority.authorityPackage.version + 1,
      timestamp: new Date().toISOString(),
      keyset: [
        {
          hash: hashKi,
          expiration: new Date(Date.now() + 86400000).toISOString(),
          status: 'ACTIVE' as const,
          usedBy: null,
          createdAt: new Date().toISOString(),
          encryptedContentKey,
        },
      ],
    }
    
    const signature = await signAuthorityPackage(newL, roomAuthority.privateKey)
    roomAuthority.authorityPackage = { ...newL, signature }
  })

  describe('verifyInviteKey', () => {
    test('应该能验证有效的邀请密钥', async () => {
      const result = await verifyInviteKey(
        hashKi,
        roomAuthority.authorityPackage,
        roomAuthority.publicKey
      )

      expect(result.success).toBe(true)
      expect(result.record).toBeDefined()
      expect(result.record?.hash).toBe(hashKi)
    })

    test('无效的哈希应该验证失败', async () => {
      const result = await verifyInviteKey(
        'invalid-hash',
        roomAuthority.authorityPackage,
        roomAuthority.publicKey
      )

      expect(result.success).toBe(false)
      expect(result.reason).toBe('INVALID_KEY')
    })

    test('已使用的密钥应该验证失败', async () => {
      // 标记为已使用
      const usedL = markKeyAsUsed(roomAuthority.authorityPackage, hashKi, 'peer-123')
      const signature = await signAuthorityPackage(usedL, roomAuthority.privateKey)
      const signedL = { ...usedL, signature }

      const result = await verifyInviteKey(hashKi, signedL, roomAuthority.publicKey)

      expect(result.success).toBe(false)
      expect(result.reason).toBe('KEY_USED')
    })

    test('过期的密钥应该验证失败', async () => {
      // 创建过期密钥
      const expiredL = {
        ...roomAuthority.authorityPackage,
        keyset: [
          {
            ...roomAuthority.authorityPackage.keyset[0],
            expiration: new Date(Date.now() - 1000).toISOString(),
          },
        ],
      }
      const signature = await signAuthorityPackage(expiredL, roomAuthority.privateKey)
      const signedL = { ...expiredL, signature }

      const result = await verifyInviteKey(hashKi, signedL, roomAuthority.publicKey)

      expect(result.success).toBe(false)
      expect(result.reason).toBe('KEY_EXPIRED')
    })
  })

  describe('markKeyAsUsed', () => {
    test('应该能标记密钥为已使用', () => {
      const peerId = 'peer-123'
      const newL = markKeyAsUsed(roomAuthority.authorityPackage, hashKi, peerId)

      expect(newL.version).toBe(roomAuthority.authorityPackage.version + 1)
      expect(newL.keyset[0].status).toBe('USED')
      expect(newL.keyset[0].usedBy).toBe(peerId)
    })
  })

  describe('decryptContentKeyWithKi', () => {
    test('应该能用 Ki 解密 Content Key', async () => {
      const record = roomAuthority.authorityPackage.keyset[0]
      const decryptedKey = await decryptContentKeyWithKi(record.encryptedContentKey, Ki)

      expect(decryptedKey).toBeDefined()
      expect(decryptedKey.type).toBe('secret')

      // 验证解密的密钥与原始密钥相同
      const originalExported = await exportKey(roomAuthority.contentKey)
      const decryptedExported = await exportKey(decryptedKey)
      expect(decryptedExported).toBe(originalExported)
    })

    test('错误的 Ki 应该无法解密', async () => {
      const record = roomAuthority.authorityPackage.keyset[0]
      const wrongKi = generateInviteKey()

      await expect(decryptContentKeyWithKi(record.encryptedContentKey, wrongKi)).rejects.toThrow()
    })
  })

  describe('完整验证流程', () => {
    test('Pnew 加入流程', async () => {
      // 1. Pnew 计算 Hash(Ki)
      const pnewHashKi = await sha256(Ki)

      // 2. Pold 验证
      const verifyResult = await verifyInviteKey(
        pnewHashKi,
        roomAuthority.authorityPackage,
        roomAuthority.publicKey
      )

      expect(verifyResult.success).toBe(true)

      // 3. Pold 标记为已使用
      const updatedL = markKeyAsUsed(
        roomAuthority.authorityPackage,
        pnewHashKi,
        'pnew-peer-id'
      )

      expect(updatedL.keyset[0].status).toBe('USED')
      expect(updatedL.keyset[0].usedBy).toBe('pnew-peer-id')

      // 4. Pnew 解密 Content Key
      const contentKey = await decryptContentKeyWithKi(
        verifyResult.record!.encryptedContentKey,
        Ki
      )

      expect(contentKey).toBeDefined()

      // 5. 验证 Content Key 正确
      const originalExported = await exportKey(roomAuthority.contentKey)
      const decryptedExported = await exportKey(contentKey)
      expect(decryptedExported).toBe(originalExported)
    })
  })
})
