import {
  generateEd25519KeyPair,
  generateContentKey,
  sha256,
  deriveKeyFromKi,
  encryptContentKey,
  decryptContentKey,
  encryptMessage,
  decryptMessage,
  exportKey,
  importKey,
  signAuthorityPackage,
  verifyAuthorityPackage,
  generateInviteKey,
} from './Encryption'

describe('权限控制加密工具测试', () => {
  describe('Ed25519 密钥对', () => {
    test('应该能生成 Ed25519 密钥对', async () => {
      const keypair = await generateEd25519KeyPair()
      
      expect(keypair.publicKey).toBeDefined()
      expect(keypair.privateKey).toBeDefined()
      expect(keypair.publicKey.type).toBe('public')
      expect(keypair.privateKey.type).toBe('private')
    })
  })

  describe('Content Key', () => {
    test('应该能生成 Content Key', async () => {
      const contentKey = await generateContentKey()
      
      expect(contentKey).toBeDefined()
      expect(contentKey.type).toBe('secret')
    })
  })

  describe('SHA-256 哈希', () => {
    test('应该能计算 SHA-256 哈希', async () => {
      const input = 'TEST-KEY-1234'
      const hash = await sha256(input)
      
      expect(hash).toBeDefined()
      expect(typeof hash).toBe('string')
      expect(hash.length).toBeGreaterThan(0)
    })

    test('相同输入应该产生相同哈希', async () => {
      const input = 'TEST-KEY-1234'
      const hash1 = await sha256(input)
      const hash2 = await sha256(input)
      
      expect(hash1).toBe(hash2)
    })

    test('不同输入应该产生不同哈希', async () => {
      const hash1 = await sha256('KEY-1')
      const hash2 = await sha256('KEY-2')
      
      expect(hash1).not.toBe(hash2)
    })
  })

  describe('Ki 派生密钥', () => {
    test('应该能从 Ki 派生密钥', async () => {
      const Ki = 'TEST-KEY-1234'
      const derived = await deriveKeyFromKi(Ki)
      
      expect(derived).toBeDefined()
      expect(derived.type).toBe('secret')
    })

    test('相同 Ki 应该派生相同密钥', async () => {
      const Ki = 'TEST-KEY-1234'
      const derived1 = await deriveKeyFromKi(Ki)
      const derived2 = await deriveKeyFromKi(Ki)
      
      const exported1 = await exportKey(derived1)
      const exported2 = await exportKey(derived2)
      
      expect(exported1).toBe(exported2)
    })
  })

  describe('Content Key 加密/解密', () => {
    test('应该能用 Ki 加密和解密 Content Key', async () => {
      const contentKey = await generateContentKey()
      const Ki = 'TEST-KEY-1234'
      
      // 加密
      const encrypted = await encryptContentKey(contentKey, Ki)
      expect(encrypted.iv).toBeDefined()
      expect(encrypted.ciphertext).toBeDefined()
      
      // 解密
      const decrypted = await decryptContentKey(encrypted, Ki)
      
      // 验证：导出后比较
      const originalExported = await exportKey(contentKey)
      const decryptedExported = await exportKey(decrypted)
      
      expect(decryptedExported).toBe(originalExported)
    })

    test('错误的 Ki 应该无法解密', async () => {
      const contentKey = await generateContentKey()
      const Ki = 'CORRECT-KEY'
      const wrongKi = 'WRONG-KEY'
      
      const encrypted = await encryptContentKey(contentKey, Ki)
      
      await expect(decryptContentKey(encrypted, wrongKi)).rejects.toThrow()
    })
  })

  describe('消息加密/解密', () => {
    test('应该能用 Content Key 加密和解密消息', async () => {
      const contentKey = await generateContentKey()
      const plaintext = 'Hello, World!'
      
      // 加密
      const encrypted = await encryptMessage(contentKey, plaintext)
      expect(encrypted.iv).toBeDefined()
      expect(encrypted.ciphertext).toBeDefined()
      
      // 解密
      const decrypted = await decryptMessage(contentKey, encrypted)
      
      expect(decrypted).toBe(plaintext)
    })

    test('错误的 Content Key 应该无法解密', async () => {
      const contentKey1 = await generateContentKey()
      const contentKey2 = await generateContentKey()
      const plaintext = 'Secret message'
      
      const encrypted = await encryptMessage(contentKey1, plaintext)
      
      await expect(decryptMessage(contentKey2, encrypted)).rejects.toThrow()
    })
  })

  describe('密钥导出/导入', () => {
    test('应该能导出和导入 Content Key', async () => {
      const contentKey = await generateContentKey()
      
      const exported = await exportKey(contentKey)
      expect(typeof exported).toBe('string')
      
      const imported = await importKey(exported, 'AES-GCM', 'secret', ['encrypt', 'decrypt'])
      
      const originalExported = await exportKey(contentKey)
      const importedExported = await exportKey(imported)
      
      expect(importedExported).toBe(originalExported)
    })

    test('应该能导出和导入 Ed25519 密钥对', async () => {
      const keypair = await generateEd25519KeyPair()
      
      const publicExported = await exportKey(keypair.publicKey)
      const privateExported = await exportKey(keypair.privateKey)
      
      const publicImported = await importKey(publicExported, 'Ed25519', 'public', ['verify'])
      const privateImported = await importKey(privateExported, 'Ed25519', 'private', ['sign'])
      
      expect(publicImported.type).toBe('public')
      expect(privateImported.type).toBe('private')
    })
  })

  describe('Authority Package 签名/验证', () => {
    test('应该能签名和验证 Authority Package', async () => {
      const keypair = await generateEd25519KeyPair()
      
      const L = {
        version: 1,
        timestamp: new Date().toISOString(),
        keyset: [],
      }
      
      // 签名
      const signature = await signAuthorityPackage(L, keypair.privateKey)
      expect(typeof signature).toBe('string')
      
      // 验证
      const valid = await verifyAuthorityPackage(
        { ...L, signature },
        keypair.publicKey
      )
      
      expect(valid).toBe(true)
    })

    test('修改后的 L 应该验证失败', async () => {
      const keypair = await generateEd25519KeyPair()
      
      const L = {
        version: 1,
        timestamp: new Date().toISOString(),
        keyset: [],
      }
      
      const signature = await signAuthorityPackage(L, keypair.privateKey)
      
      // 修改 L
      const modifiedL = {
        ...L,
        version: 2,
        signature,
      }
      
      const valid = await verifyAuthorityPackage(modifiedL, keypair.publicKey)
      
      expect(valid).toBe(false)
    })

    test('错误的公钥应该验证失败', async () => {
      const keypair1 = await generateEd25519KeyPair()
      const keypair2 = await generateEd25519KeyPair()
      
      const L = {
        version: 1,
        timestamp: new Date().toISOString(),
        keyset: [],
      }
      
      const signature = await signAuthorityPackage(L, keypair1.privateKey)
      
      const valid = await verifyAuthorityPackage(
        { ...L, signature },
        keypair2.publicKey
      )
      
      expect(valid).toBe(false)
    })
  })

  describe('生成邀请密钥', () => {
    test('应该能生成邀请密钥', () => {
      const Ki = generateInviteKey()
      
      expect(typeof Ki).toBe('string')
      expect(Ki).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    })

    test('每次生成的密钥应该不同', () => {
      const Ki1 = generateInviteKey()
      const Ki2 = generateInviteKey()
      
      expect(Ki1).not.toBe(Ki2)
    })
  })

  describe('完整流程测试', () => {
    test('完整的加密验证流程', async () => {
      // 1. Pcreator 创建房间
      const creatorKeypair = await generateEd25519KeyPair()
      const contentKey = await generateContentKey()
      
      // 2. 生成邀请密钥
      const Ki = generateInviteKey()
      const hashKi = await sha256(Ki)
      
      // 3. 用 Ki 加密 Content Key
      const encryptedContentKey = await encryptContentKey(contentKey, Ki)
      
      // 4. 创建 L
      const L = {
        version: 1,
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
      
      // 5. 签名 L
      const signature = await signAuthorityPackage(L, creatorKeypair.privateKey)
      const signedL = { ...L, signature }
      
      // 6. Pnew 验证
      const valid = await verifyAuthorityPackage(signedL, creatorKeypair.publicKey)
      expect(valid).toBe(true)
      
      // 7. Pnew 用 Ki 解密 Content Key
      const decryptedContentKey = await decryptContentKey(encryptedContentKey, Ki)
      
      // 8. 验证 Content Key 正确
      const originalExported = await exportKey(contentKey)
      const decryptedExported = await exportKey(decryptedContentKey)
      expect(decryptedExported).toBe(originalExported)
      
      // 9. 用 Content Key 加密消息
      const message = 'Hello from Pnew!'
      const encryptedMessage = await encryptMessage(decryptedContentKey, message)
      
      // 10. 用 Content Key 解密消息
      const decryptedMessage = await decryptMessage(contentKey, encryptedMessage)
      expect(decryptedMessage).toBe(message)
    })
  })
})
