import { GroupClaim } from 'models/groupClaim'
import { generateEd25519KeyPair, generateContentKey, signAuthorityPackage } from 'services/Encryption'

interface CreatorInfo {
  roomId: string
  userId: string
  privateKeyString: string
  publicKeyString: string
  contentKeyString: string
  createdAt: string
}

/**
 * 创建新的GroupClaim和管理员身份
 */
export const createGroupClaim = async (
  roomId: string,
  userId: string
): Promise<{
  groupClaim: GroupClaim
  contentKey: CryptoKey
  privateKey: CryptoKey
}> => {
  // 生成密钥
  const keyPair = await generateEd25519KeyPair()
  const contentKey = await generateContentKey()
  
  // 导出公钥为raw格式
  const publicKeyRaw = await window.crypto.subtle.exportKey('raw', keyPair.publicKey)
  const publicKeyString = btoa(String.fromCharCode(...new Uint8Array(publicKeyRaw)))
  
  const now = new Date().toISOString()
  const groupClaim: GroupClaim = {
    createdAt: now,
    roomId,
    creatorId: userId,
    version: 1,
    timestamp: now,
    publicKey: publicKeyString,
    keyset: [],
    signature: ''
  }
  
  // 签名
  groupClaim.signature = await signAuthorityPackage(groupClaim, keyPair.privateKey)
  
  // 保存管理员信息
  await saveCreatorInfo(roomId, {
    roomId,
    userId,
    privateKeyString: await exportKeyToString(keyPair.privateKey),
    publicKeyString,
    contentKeyString: await exportKeyToString(contentKey),
    createdAt: now
  })
  
  return {
    groupClaim,
    contentKey,
    privateKey: keyPair.privateKey
  }
}

/**
 * 恢复管理员身份
 */
export const restoreCreatorIdentity = async (
  roomId: string,
  userId: string
): Promise<{
  contentKey: CryptoKey
  privateKey: CryptoKey
} | null> => {
  const creatorInfo = await loadCreatorInfo(roomId)
  if (!creatorInfo || creatorInfo.userId !== userId) {
    return null
  }
  
  try {
    const privateKey = await importKeyFromString(creatorInfo.privateKeyString, 'Ed25519', 'private', ['sign'])
    const contentKey = await importKeyFromString(creatorInfo.contentKeyString, 'AES-GCM', 'secret', ['encrypt', 'decrypt'])
    
    return { contentKey, privateKey }
  } catch (error) {
    console.error('恢复管理员身份失败:', error)
    return null
  }
}

/**
 * 检查是否是管理员
 */
export const isRoomCreator = (roomId: string, userId: string): boolean => {
  const sessionKey = `chitchatter_session_creator_${roomId}`
  const sessionCreator = sessionStorage.getItem(sessionKey)
  
  if (sessionCreator === 'true') {
    const creatorInfo = localStorage.getItem(`chitchatter_creator_${roomId}`)
    if (creatorInfo) {
      try {
        const info = JSON.parse(creatorInfo)
        return info.userId === userId
      } catch {
        return false
      }
    }
  }
  
  return false
}

/**
 * 保存管理员信息到localStorage（加密存储）
 */
const saveCreatorInfo = async (roomId: string, info: CreatorInfo): Promise<void> => {
  const storageKey = `chitchatter_creator_${roomId}`
  
  try {
    // 获取房间密码用于加密
    const password = sessionStorage.getItem(`chitchatter_room_password_${roomId}`)
    if (password) {
      const { encryptWithPassword } = await import('services/Encryption')
      const encrypted = await encryptWithPassword(
        JSON.stringify(info),
        password,
        `creator-${roomId}`
      )
      localStorage.setItem(storageKey, encrypted)
      console.log('✅ 管理员信息已加密存储')
    } else {
      // 降级到明文存储（不推荐）
      localStorage.setItem(storageKey, JSON.stringify(info))
      console.warn('⚠️ 管理员信息明文存储（无密码）')
    }
  } catch (error) {
    console.error('❌ 管理员信息存储失败:', error)
    // 降级到明文存储
    localStorage.setItem(storageKey, JSON.stringify(info))
  }
}

/**
 * 从localStorage加载管理员信息（解密）
 */
const loadCreatorInfo = async (roomId: string): Promise<CreatorInfo | null> => {
  try {
    const storageKey = `chitchatter_creator_${roomId}`
    const stored = localStorage.getItem(storageKey)
    if (!stored) {
      console.log('[管理员恢复] 未找到存储数据')
      return null
    }
    
    const password = sessionStorage.getItem(`chitchatter_room_password_${roomId}`)
    console.log('[管理员恢复] 密码状态:', password ? '存在' : '不存在')
    
    if (password) {
      try {
        const { decryptWithPassword } = await import('services/Encryption')
        const decrypted = await decryptWithPassword(stored, password, `creator-${roomId}`)
        const info = JSON.parse(decrypted)
        console.log('[管理员恢复] 解密成功')
        return info
      } catch (decryptError) {
        console.error('[管理员恢复] 解密失败:', decryptError)
        
        // 尝试明文解析（兼容旧数据）
        try {
          const info = JSON.parse(stored)
          console.log('[管理员恢复] 明文解析成功（兼容模式）')
          return info
        } catch (parseError) {
          console.error('[管理员恢复] 明文解析也失败:', parseError)
          return null
        }
      }
    } else {
      // 无密码，尝试明文解析
      try {
        const info = JSON.parse(stored)
        console.log('[管理员恢复] 明文解析成功（无密码）')
        return info
      } catch (parseError) {
        console.error('[管理员恢复] 明文解析失败:', parseError)
        return null
      }
    }
  } catch (error) {
    console.error('[管理员恢复] 加载管理员信息失败:', error)
    return null
  }
}

/**
 * 导出密钥为字符串
 */
const exportKeyToString = async (key: CryptoKey): Promise<string> => {
  let format: 'raw' | 'spki' | 'pkcs8'
  
  if (key.type === 'public') {
    format = 'spki'
  } else if (key.type === 'private') {
    format = 'pkcs8'
  } else {
    format = 'raw'
  }
  
  const exported = await window.crypto.subtle.exportKey(format, key)
  return btoa(String.fromCharCode(...new Uint8Array(exported)))
}

/**
 * 从字符串导入密钥
 */
const importKeyFromString = async (
  keyString: string,
  algorithm: 'Ed25519' | 'AES-GCM',
  type: 'public' | 'private' | 'secret',
  usages: KeyUsage[]
): Promise<CryptoKey> => {
  let format: 'raw' | 'spki' | 'pkcs8'
  
  if (type === 'public') {
    format = 'spki'
  } else if (type === 'private') {
    format = 'pkcs8'
  } else {
    format = 'raw'
  }
  
  const keyBuffer = Uint8Array.from(atob(keyString), c => c.charCodeAt(0))
  
  if (algorithm === 'Ed25519') {
    return await window.crypto.subtle.importKey(
      format,
      keyBuffer,
      { name: 'Ed25519' },
      true,
      usages
    )
  } else {
    return await window.crypto.subtle.importKey(
      format,
      keyBuffer,
      { name: 'AES-GCM' },
      true,
      usages
    )
  }
}

/**
 * 保存验证用户信息（加密存储）
 */
export const saveVerifiedUser = async (
  roomId: string,
  userId: string,
  contentKey: CryptoKey,
  inviteKeyHash: string
): Promise<void> => {
  const storageKey = `chitchatter_verified_${roomId}_${userId}`
  
  try {
    const verifiedInfo = {
      roomId,
      userId,
      contentKey: await exportKeyToString(contentKey),
      verifiedAt: Date.now(),
      inviteKeyHash,
    }
    
    // 使用roomId作为密码加密存储
    const { encryptWithPassword } = await import('services/Encryption')
    const encrypted = await encryptWithPassword(
      JSON.stringify(verifiedInfo),
      roomId,
      `verified-${userId}`
    )
    localStorage.setItem(storageKey, encrypted)
    localStorage.setItem(`chitchatter_invite_hash_${roomId}_${userId}`, inviteKeyHash)
    console.log('✅ 用户验证信息已加密存储')
  } catch (error) {
    console.error('❌ 用户验证信息存储失败:', error)
    throw error
  }
}

/**
 * 恢复验证用户信息（解密）
 */
export const loadVerifiedUser = async (
  roomId: string,
  userId: string
): Promise<CryptoKey | null> => {
  try {
    const storageKey = `chitchatter_verified_${roomId}_${userId}`
    const stored = localStorage.getItem(storageKey)
    if (!stored) {
      console.log('[用户恢复] 未找到验证数据')
      return null
    }

    try {
      // 解密数据
      const { decryptWithPassword } = await import('services/Encryption')
      const decrypted = await decryptWithPassword(stored, roomId, `verified-${userId}`)
      const verifiedInfo = JSON.parse(decrypted)
      
      const contentKey = await importKeyFromString(
        verifiedInfo.contentKey,
        'AES-GCM',
        'secret',
        ['encrypt', 'decrypt']
      )
      console.log('[用户恢复] 解密成功')
      return contentKey
    } catch (decryptError) {
      console.error('[用户恢复] 解密失败:', decryptError)
      return null
    }
  } catch (error) {
    console.error('[用户恢复] 恢复验证信息失败:', error)
    return null
  }
}