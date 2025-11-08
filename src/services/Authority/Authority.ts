import { AuthorityPackage, CreatorInfo, CreatorClaim } from 'models/authority'
import {
  generateEd25519KeyPair,
  generateContentKey,
  exportKey,
  importKey,
  signAuthorityPackage,
  sha256,
} from 'services/Encryption'

/**
 * 创建房间并初始化权限系统
 */
export const createRoomAuthority = async (
  roomId: string,
  password: string,
  userId: string
): Promise<{
  authorityPackage: AuthorityPackage
  contentKey: CryptoKey
  publicKey: CryptoKey
  privateKey: CryptoKey
  claim: CreatorClaim
}> => {
  // 1. 生成 Ed25519 密钥对（用于签名 L）
  const keypair = await generateEd25519KeyPair()

  // 2. 生成 Content Key（用于消息加密）
  const contentKey = await generateContentKey()

  // 3. 初始化空的 L
  const L = {
    version: 1,
    timestamp: new Date().toISOString(),
    keyset: [],
  }

  // 4. 签名 L
  const signature = await signAuthorityPackage(L, keypair.privateKey)

  const authorityPackage: AuthorityPackage = {
    ...L,
    signature,
  }

  // 5. 生成创建者声明
  const claim = await createCreatorClaim(1, userId, keypair.publicKey, keypair.privateKey)

  // 6. 保存 CreatorInfo 到 localStorage
  await saveCreatorInfo(roomId, password, {
    roomId,
    role: 'creator',
    privateKey: await exportKey(keypair.privateKey),
    publicKey: await exportKey(keypair.publicKey),
    contentKey: await exportKey(contentKey),
    createdAt: new Date().toISOString(),
    sequence: 1,
    claimHash: claim.claimHash!,
  })

  return {
    authorityPackage,
    contentKey,
    publicKey: keypair.publicKey,
    privateKey: keypair.privateKey,
    claim,
  }
}

/**
 * 保存 CreatorInfo 到 localStorage（加密）
 */
export const saveCreatorInfo = async (
  roomId: string,
  password: string,
  creatorInfo: CreatorInfo
): Promise<void> => {
  // 使用 password 派生加密密钥
  const encryptionKey = await deriveEncryptionKeyFromPassword(password, roomId)

  // 加密 CreatorInfo
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(JSON.stringify(creatorInfo))

  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    encryptionKey,
    encoded
  )

  // 存储到 localStorage
  const storageKey = `chitchatter_creator_${roomId}`
  const storageValue = {
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
  }

  localStorage.setItem(storageKey, JSON.stringify(storageValue))
}

/**
 * 从 localStorage 恢复 CreatorInfo
 */
export const loadCreatorInfo = async (
  roomId: string,
  password: string
): Promise<CreatorInfo | null> => {
  try {
    const storageKey = `chitchatter_creator_${roomId}`
    const stored = localStorage.getItem(storageKey)

    if (!stored) return null

    const { iv, data } = JSON.parse(stored)

    // 派生解密密钥
    const encryptionKey = await deriveEncryptionKeyFromPassword(password, roomId)

    // 解密
    const ivArray = Uint8Array.from(atob(iv), c => c.charCodeAt(0))
    const dataArray = Uint8Array.from(atob(data), c => c.charCodeAt(0))

    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivArray },
      encryptionKey,
      dataArray
    )

    const creatorInfo: CreatorInfo = JSON.parse(new TextDecoder().decode(decrypted))

    return creatorInfo
  } catch (error) {
    console.error('恢复 CreatorInfo 失败:', error)
    return null
  }
}

/**
 * 从 password 派生加密密钥
 */
const deriveEncryptionKeyFromPassword = async (
  password: string,
  roomId: string
): Promise<CryptoKey> => {
  const passwordBytes = new TextEncoder().encode(password)

  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    passwordBytes,
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode(`chitchatter-creator-${roomId}`),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * 恢复 CreatorInfo 并导入密钥
 */
export const restoreCreatorAuthority = async (
  roomId: string,
  password: string
): Promise<{
  authorityPackage: AuthorityPackage | null
  contentKey: CryptoKey | null
  publicKey: CryptoKey | null
  privateKey: CryptoKey | null
} | null> => {
  const creatorInfo = await loadCreatorInfo(roomId, password)

  if (!creatorInfo) return null

  try {
    // 导入密钥
    const publicKey = await importKey(creatorInfo.publicKey, 'Ed25519', 'public', ['verify'])
    const privateKey = await importKey(creatorInfo.privateKey, 'Ed25519', 'private', ['sign'])
    const contentKey = await importKey(creatorInfo.contentKey, 'AES-GCM', 'secret', ['encrypt', 'decrypt'])

    // 注意：L 需要从网络同步或本地缓存恢复
    // 这里返回 null，由调用方处理
    return {
      authorityPackage: null,
      contentKey,
      publicKey,
      privateKey,
    }
  } catch (error) {
    console.error('恢复密钥失败:', error)
    return null
  }
}

/**
 * 检查是否是房间创建者
 */
export const isCreator = (roomId: string): boolean => {
  const storageKey = `chitchatter_creator_${roomId}`
  return localStorage.getItem(storageKey) !== null
}

/**
 * 保存验证用户信息
 */
export const saveVerifiedUser = async (
  roomId: string,
  userId: string,
  contentKey: CryptoKey,
  inviteKeyHash: string
): Promise<void> => {
  const { encryptWithPassword } = await import('services/Encryption')
  const storageKey = `chitchatter_verified_${roomId}_${userId}`
  const verifiedInfo = {
    roomId,
    userId,
    contentKey: await exportKey(contentKey),
    verifiedAt: Date.now(),
    inviteKeyHash,
  }
  const encrypted = await encryptWithPassword(
    JSON.stringify(verifiedInfo),
    roomId,
    `verified-${userId}`
  )
  localStorage.setItem(storageKey, encrypted)
}

/**
 * 恢复验证用户信息
 */
export const loadVerifiedUser = async (
  roomId: string,
  userId: string
): Promise<CryptoKey | null> => {
  try {
    const { decryptWithPassword } = await import('services/Encryption')
    const storageKey = `chitchatter_verified_${roomId}_${userId}`
    const stored = localStorage.getItem(storageKey)
    if (!stored) return null

    const decrypted = await decryptWithPassword(stored, roomId, `verified-${userId}`)
    const verifiedInfo = JSON.parse(decrypted)
    const contentKey = await importKey(
      verifiedInfo.contentKey,
      'AES-GCM',
      'secret',
      ['encrypt', 'decrypt']
    )
    return contentKey
  } catch (error) {
    console.error('恢复验证信息失败:', error)
    return null
  }
}

/**
 * 创建创建者声明（用于共识）
 */
export const createCreatorClaim = async (
  sequence: number,
  userId: string,
  publicKey: CryptoKey,
  privateKey: CryptoKey
): Promise<CreatorClaim> => {
  const timestamp = Date.now()
  const publicKeyString = await exportKey(publicKey)

  // 构建声明对象
  const claimData = {
    sequence,
    userId,
    timestamp,
    publicKey: publicKeyString,
  }

  // 计算哈希
  const claimString = JSON.stringify(claimData)
  const claimHash = await sha256(claimString)

  // 签名
  const encoder = new TextEncoder()
  const data = encoder.encode(claimHash)
  const signatureBuffer = await window.crypto.subtle.sign(
    'Ed25519',
    privateKey,
    data
  )
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))

  return {
    ...claimData,
    signature,
    claimHash,
  }
}

/**
 * 验证创建者声明
 */
export const verifyCreatorClaim = async (
  claim: CreatorClaim
): Promise<boolean> => {
  try {
    // 重新计算哈希
    const claimData = {
      sequence: claim.sequence,
      userId: claim.userId,
      timestamp: claim.timestamp,
      publicKey: claim.publicKey,
    }
    const claimString = JSON.stringify(claimData)
    const expectedHash = await sha256(claimString)

    if (expectedHash !== claim.claimHash) {
      return false
    }

    // 验证签名
    const publicKey = await importKey(
      claim.publicKey,
      'Ed25519',
      'public',
      ['verify']
    )

    const encoder = new TextEncoder()
    const data = encoder.encode(claim.claimHash!)
    const signatureArray = Uint8Array.from(atob(claim.signature), c =>
      c.charCodeAt(0)
    )

    return await window.crypto.subtle.verify(
      'Ed25519',
      publicKey,
      signatureArray,
      data
    )
  } catch (error) {
    console.error('验证声明失败:', error)
    return false
  }
}

/**
 * 比较两个声明，返回胜出者
 */
export const compareCreatorClaims = (
  claim1: CreatorClaim,
  claim2: CreatorClaim
): CreatorClaim => {
  // 1. 序号小的胜出
  if (claim1.sequence !== claim2.sequence) {
    return claim1.sequence < claim2.sequence ? claim1 : claim2
  }

  // 2. 序号相同，时间戳早的胜出
  return claim1.timestamp < claim2.timestamp ? claim1 : claim2
}
