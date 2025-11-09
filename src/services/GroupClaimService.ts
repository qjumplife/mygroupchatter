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
export const isRoomCreator = async (roomId: string, userId: string): Promise<boolean> => {
  try {
    // 检查是否有管理员数据存储
    const storageKey = `chitchatter_creator_${roomId}`
    const stored = localStorage.getItem(storageKey)
    if (!stored) {
      console.log('[isRoomCreator] 未找到管理员数据')
      return false
    }
    
    // 检查session标记（防止降级后恢复）
    const sessionCreator = sessionStorage.getItem(`chitchatter_session_creator_${roomId}`)
    if (sessionCreator !== 'true') {
      console.log('[isRoomCreator] session标记不存在或无效')
      return false
    }
    
    const creatorInfo = await loadCreatorInfo(roomId)
    const isCreator = creatorInfo?.userId === userId
    console.log('[isRoomCreator] 检查结果:', { isCreator, userId: userId?.substring(0, 8) + '...', creatorUserId: creatorInfo?.userId?.substring(0, 8) + '...' })
    return isCreator
  } catch (error) {
    console.error('[isRoomCreator] 检查失败:', error)
    return false
  }
}

/**
 * 保存管理员信息到localStorage（加密存储）
 */
const saveCreatorInfo = async (roomId: string, info: CreatorInfo): Promise<void> => {
  const storageKey = `chitchatter_creator_${roomId}`
  const passwordKey = `chitchatter_room_password_${roomId}`
  
  try {
    // 先尝试从sessionStorage获取密码
    let password = sessionStorage.getItem(passwordKey)
    
    // 如果sessionStorage没有，尝试从localStorage获取
    if (!password) {
      password = localStorage.getItem(passwordKey)
    }
    
    // 如果都没有，生成一个基于roomId的密码
    if (!password) {
      password = `room_${roomId}_${Date.now()}`
      localStorage.setItem(passwordKey, password)
      console.log('✅ 生成并保存房间密码')
    } else {
      // 确保密码也保存到localStorage
      localStorage.setItem(passwordKey, password)
    }
    
    const { encryptWithPassword } = await import('services/Encryption')
    const encrypted = await encryptWithPassword(
      JSON.stringify(info),
      password,
      `creator-${roomId}`
    )
    localStorage.setItem(storageKey, encrypted)
    
    // 设置session标记
    sessionStorage.setItem(`chitchatter_session_creator_${roomId}`, 'true')
    console.log('✅ 管理员信息已加密存储')
  } catch (error) {
    console.error('❌ 管理员信息存储失败:', error)
    throw error
  }
}

/**
 * 从localStorage加载管理员信息（解密）
 */
const loadCreatorInfo = async (roomId: string): Promise<CreatorInfo | null> => {
  try {
    const storageKey = `chitchatter_creator_${roomId}`
    const passwordKey = `chitchatter_room_password_${roomId}`
    const stored = localStorage.getItem(storageKey)
    
    if (!stored) {
      console.log('[管理员恢复] 未找到存储数据')
      return null
    }
    
    // 先尝试从localStorage获取密码
    let password = localStorage.getItem(passwordKey)
    
    // 如果localStorage没有，尝试从sessionStorage获取
    if (!password) {
      password = sessionStorage.getItem(passwordKey)
      if (password) {
        // 将密码保存到localStorage以便持久化
        localStorage.setItem(passwordKey, password)
      }
    }
    
    console.log('[管理员恢复] 密码状态:', password ? '存在' : '不存在')
    
    if (password) {
      try {
        const { decryptWithPassword } = await import('services/Encryption')
        const decrypted = await decryptWithPassword(stored, password, `creator-${roomId}`)
        const info = JSON.parse(decrypted)
        
        // 恢复session标记
        sessionStorage.setItem(`chitchatter_session_creator_${roomId}`, 'true')
        console.log('[管理员恢复] 解密成功，已恢复session标记')
        return info
      } catch (decryptError) {
        console.error('[管理员恢复] 解密失败:', decryptError)
        return null
      }
    } else {
      console.log('[管理员恢复] 无密码，无法解密')
      return null
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