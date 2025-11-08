// NOTE: Much of what's here is derived from various ChatGPT responses:
//
//  - https://gist.github.com/jeremyckahn/cbb6107e7de6c83b620960a19266055e
//  - https://gist.github.com/jeremyckahn/c49ca17a849ecf35c5f957ffde956cf4

export enum AllowedKeyType {
  PUBLIC,
  PRIVATE,
}

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const binary = String.fromCharCode(...new Uint8Array(buffer))
  return btoa(binary)
}

const base64ToArrayBuffer = (base64: string) => {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  return bytes.buffer
}

const algorithmName = 'RSA-OAEP'

const algorithmHash = 'SHA-256'

export class EncryptionService {
  cryptoKeyStub: CryptoKey = {
    algorithm: { name: 'STUB-ALGORITHM' },
    extractable: false,
    type: 'private',
    usages: [],
  }

  // TODO: Make this configurable
  generateKeyPair = async (): Promise<CryptoKeyPair> => {
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: algorithmName,
        hash: algorithmHash,
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      },
      true,
      ['encrypt', 'decrypt']
    )

    return keyPair
  }

  encodePassword = async (roomId: string, password: string) => {
    const data = new TextEncoder().encode(`${roomId}_${password}`)
    const digest = await window.crypto.subtle.digest('SHA-256', data)
    const bytes = new Uint8Array(digest)
    const encodedPassword = window.btoa(String.fromCharCode(...bytes))

    return encodedPassword
  }

  stringifyCryptoKey = async (cryptoKey: CryptoKey) => {
    const exportedKey = await window.crypto.subtle.exportKey(
      cryptoKey.type === 'public' ? 'spki' : 'pkcs8',
      cryptoKey
    )

    const exportedKeyAsString = arrayBufferToBase64(exportedKey)

    return exportedKeyAsString
  }

  parseCryptoKeyString = async (keyString: string, type: AllowedKeyType) => {
    const importedKey = await window.crypto.subtle.importKey(
      type === AllowedKeyType.PUBLIC ? 'spki' : 'pkcs8',
      base64ToArrayBuffer(keyString),
      {
        name: algorithmName,
        hash: algorithmHash,
      },
      true,
      type === AllowedKeyType.PUBLIC ? ['encrypt'] : ['decrypt']
    )

    return importedKey
  }

  encryptString = async (publicKey: CryptoKey, plaintext: string) => {
    const encodedText = new TextEncoder().encode(plaintext)
    const encryptedData = await crypto.subtle.encrypt(
      algorithmName,
      publicKey,
      encodedText
    )

    return encryptedData
  }

  decryptString = async (privateKey: CryptoKey, encryptedData: ArrayBuffer) => {
    const decryptedArrayBuffer = await crypto.subtle.decrypt(
      algorithmName,
      privateKey,
      encryptedData
    )

    const decryptedString = new TextDecoder().decode(decryptedArrayBuffer)

    return decryptedString
  }
}

export const encryption = new EncryptionService()

// ============ 权限控制系统的加密工具 ============

import { EncryptedData } from 'models/authority'

/**
 * 生成 Ed25519 密钥对（用于签名 L）
 */
export const generateEd25519KeyPair = async (): Promise<CryptoKeyPair> => {
  return await window.crypto.subtle.generateKey(
    {
      name: 'Ed25519',
    },
    true,
    ['sign', 'verify']
  )
}

/**
 * 生成 Content Key（用于消息内容加密）
 */
export const generateContentKey = async (): Promise<CryptoKey> => {
  return await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )
}

/**
 * 计算 SHA-256 哈希
 */
export const sha256 = async (data: string): Promise<string> => {
  const encoder = new TextEncoder()
  const dataBuffer = encoder.encode(data)
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', dataBuffer)
  return arrayBufferToBase64(hashBuffer)
}

/**
 * 从 Ki 派生 AES-GCM 密钥
 */
export const deriveKeyFromKi = async (Ki: string): Promise<CryptoKey> => {
  const kiBytes = new TextEncoder().encode(Ki)
  
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    kiBytes,
    'PBKDF2',
    false,
    ['deriveKey']
  )
  
  return await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode('chitchatter-content-key-v1'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )
}

/**
 * 用 Ki 派生的密钥加密 Content Key
 */
export const encryptContentKey = async (
  contentKey: CryptoKey,
  Ki: string
): Promise<EncryptedData> => {
  const kiDerivedKey = await deriveKeyFromKi(Ki)
  
  // 导出 Content Key 为原始字节
  const contentKeyBytes = await window.crypto.subtle.exportKey('raw', contentKey)
  
  // 生成随机 IV
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  
  // 加密
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    kiDerivedKey,
    contentKeyBytes
  )
  
  return {
    iv: arrayBufferToBase64(iv),
    ciphertext: arrayBufferToBase64(encrypted),
  }
}

/**
 * 用 Ki 派生的密钥解密 Content Key
 */
export const decryptContentKey = async (
  encryptedData: EncryptedData,
  Ki: string
): Promise<CryptoKey> => {
  const kiDerivedKey = await deriveKeyFromKi(Ki)
  
  // 解码 IV 和密文
  const iv = new Uint8Array(base64ToArrayBuffer(encryptedData.iv))
  const ciphertext = new Uint8Array(base64ToArrayBuffer(encryptedData.ciphertext))
  
  // 解密
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    kiDerivedKey,
    ciphertext
  )
  
  // 导入为 CryptoKey
  return await window.crypto.subtle.importKey(
    'raw',
    decrypted,
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt']
  )
}

/**
 * 用 Content Key 加密消息内容
 */
export const encryptMessage = async (
  contentKey: CryptoKey,
  plaintext: string
): Promise<EncryptedData> => {
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    contentKey,
    encoded
  )
  
  return {
    iv: arrayBufferToBase64(iv),
    ciphertext: arrayBufferToBase64(encrypted),
  }
}

/**
 * 用 Content Key 解密消息内容
 */
export const decryptMessage = async (
  contentKey: CryptoKey,
  encryptedData: EncryptedData
): Promise<string> => {
  const iv = new Uint8Array(base64ToArrayBuffer(encryptedData.iv))
  const ciphertext = new Uint8Array(base64ToArrayBuffer(encryptedData.ciphertext))
  
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    contentKey,
    ciphertext
  )
  
  return new TextDecoder().decode(decrypted)
}

/**
 * 导出 CryptoKey 为 Base64 字符串
 */
export const exportKey = async (key: CryptoKey): Promise<string> => {
  let format: 'raw' | 'spki' | 'pkcs8'
  
  if (key.type === 'public') {
    format = 'spki'
  } else if (key.type === 'private') {
    format = 'pkcs8'
  } else {
    format = 'raw'
  }
  
  const exported = await window.crypto.subtle.exportKey(format, key)
  return arrayBufferToBase64(exported)
}

/**
 * 从 Base64 字符串导入 CryptoKey
 */
export const importKey = async (
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
  
  const keyBuffer = new Uint8Array(base64ToArrayBuffer(keyString))
  
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
 * 签名 Authority Package
 */
export const signAuthorityPackage = async (
  L: Omit<import('models/authority').AuthorityPackage, 'signature'>,
  privateKey: CryptoKey
): Promise<string> => {
  const data = JSON.stringify({
    version: L.version,
    timestamp: L.timestamp,
    keyset: L.keyset,
  })
  
  const encoded = new TextEncoder().encode(data)
  const signature = await window.crypto.subtle.sign('Ed25519', privateKey, encoded)
  
  return arrayBufferToBase64(signature)
}

/**
 * 验证 Authority Package 签名
 */
export const verifyAuthorityPackage = async (
  L: import('models/authority').AuthorityPackage,
  publicKey: CryptoKey
): Promise<boolean> => {
  const data = JSON.stringify({
    version: L.version,
    timestamp: L.timestamp,
    keyset: L.keyset,
  })
  
  const encoded = new TextEncoder().encode(data)
  const signature = new Uint8Array(base64ToArrayBuffer(L.signature))
  
  try {
    return await window.crypto.subtle.verify('Ed25519', publicKey, signature, encoded)
  } catch (error) {
    console.error('签名验证失败:', error)
    return false
  }
}

/**
 * 生成随机邀请密钥
 */
export const generateInviteKey = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 去除易混淆字符
  const segments = 4
  const segmentLength = 4
  
  const result: string[] = []
  
  for (let i = 0; i < segments; i++) {
    let segment = ''
    for (let j = 0; j < segmentLength; j++) {
      const randomIndex = Math.floor(Math.random() * chars.length)
      segment += chars[randomIndex]
    }
    result.push(segment)
  }
  
  return result.join('-')
}

/**
 * 使用密码加密数据（用于本地存储）
 */
export const encryptWithPassword = async (
  data: string,
  password: string,
  salt: string
): Promise<string> => {
  const passwordBytes = new TextEncoder().encode(password)
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    passwordBytes,
    'PBKDF2',
    false,
    ['deriveKey']
  )
  
  const encryptionKey = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode(`chitchatter-${salt}`),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  )
  
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(data)
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    encryptionKey,
    encoded
  )
  
  return JSON.stringify({
    iv: arrayBufferToBase64(iv),
    data: arrayBufferToBase64(encrypted),
  })
}

/**
 * 使用密码解密数据（用于本地存储）
 */
export const decryptWithPassword = async (
  encryptedData: string,
  password: string,
  salt: string
): Promise<string> => {
  const { iv, data } = JSON.parse(encryptedData)
  
  const passwordBytes = new TextEncoder().encode(password)
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    passwordBytes,
    'PBKDF2',
    false,
    ['deriveKey']
  )
  
  const encryptionKey = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode(`chitchatter-${salt}`),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )
  
  const ivArray = new Uint8Array(base64ToArrayBuffer(iv))
  const dataArray = new Uint8Array(base64ToArrayBuffer(data))
  
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivArray },
    encryptionKey,
    dataArray
  )
  
  return new TextDecoder().decode(decrypted)
}
