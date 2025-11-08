import { useState, useCallback, useContext } from 'react'
import { RoomContext } from 'contexts/RoomContext'
import { InviteKeyRecord, AuthorityPackage } from 'models/authority'
import {
  generateInviteKey,
  sha256,
  encryptContentKey,
  signAuthorityPackage,
} from 'services/Encryption'

export interface InviteKeyWithPlaintext extends InviteKeyRecord {
  plaintext?: string // 仅在生成时显示一次
}

export const useInvitationKeys = () => {
  const {
    authorityPackage,
    setAuthorityPackage,
    contentKey,
    creatorPrivateKey,
    isRoomCreator,
    broadcastAuthorityPackage,
  } = useContext(RoomContext)

  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * 生成新的邀请密钥
   */
  const generateKey = useCallback(
    async (ttlHours: number = 24): Promise<InviteKeyWithPlaintext | null> => {
      if (!isRoomCreator) {
        setError('只有房间创建者可以生成邀请密钥')
        return null
      }

      if (!contentKey || !creatorPrivateKey || !authorityPackage) {
        setError('缺少必要的密钥或权限信息')
        return null
      }

      setIsGenerating(true)
      setError(null)

      try {
        // 1. 生成随机邀请密钥
        const Ki = generateInviteKey()

        // 2. 计算哈希
        const hash = await sha256(Ki)

        // 3. 用 Ki 加密 Content Key
        const encryptedContentKey = await encryptContentKey(contentKey, Ki)

        // 4. 创建新记录
        const newRecord: InviteKeyRecord = {
          hash,
          expiration: new Date(Date.now() + ttlHours * 3600000).toISOString(),
          status: 'ACTIVE',
          usedBy: null,
          createdAt: new Date().toISOString(),
          encryptedContentKey,
        }

        // 5. 更新 L
        const newL = {
          version: authorityPackage.version + 1,
          timestamp: new Date().toISOString(),
          keyset: [...authorityPackage.keyset, newRecord],
        }

        // 6. 签名
        const signature = await signAuthorityPackage(newL, creatorPrivateKey)

        const newAuthorityPackage: AuthorityPackage = {
          ...newL,
          signature,
        }

        // 7. 更新状态并广播
        setAuthorityPackage(newAuthorityPackage)
        // 持久化到 localStorage（加密）
        const roomId = window.location.pathname.split('/').pop() || ''
        if (roomId && authorityPackage) {
          try {
            const password = sessionStorage.getItem(`chitchatter_room_password_${roomId}`)
            if (password) {
              const { encryptWithPassword } = await import('services/Encryption')
              const encrypted = await encryptWithPassword(
                JSON.stringify(newAuthorityPackage),
                password,
                `authority-${roomId}`
              )
              localStorage.setItem(`chitchatter_authority_${roomId}`, encrypted)
            } else {
              localStorage.setItem(`chitchatter_authority_${roomId}`, JSON.stringify(newAuthorityPackage))
            }
          } catch {
            localStorage.setItem(`chitchatter_authority_${roomId}`, JSON.stringify(newAuthorityPackage))
          }
        }
        broadcastAuthorityPackage(newAuthorityPackage)

        // 8. 返回（包含明文密钥，仅显示一次）
        return {
          ...newRecord,
          plaintext: Ki,
        }
      } catch (err) {
        setError(`生成密钥失败: ${err}`)
        return null
      } finally {
        setIsGenerating(false)
      }
    },
    [
      isRoomCreator,
      contentKey,
      creatorPrivateKey,
      authorityPackage,
      setAuthorityPackage,
    ]
  )

  /**
   * 吊销密钥
   */
  const revokeKey = useCallback(
    async (hash: string): Promise<boolean> => {
      if (!isRoomCreator || !creatorPrivateKey || !authorityPackage) {
        setError('无法吊销密钥')
        return false
      }

      setError(null)

      try {
        // 1. 找到记录并修改状态
        const newKeyset = authorityPackage.keyset.map(record =>
          record.hash === hash ? { ...record, status: 'REVOKED' as const } : record
        )

        // 2. 更新 L
        const newL = {
          version: authorityPackage.version + 1,
          timestamp: new Date().toISOString(),
          keyset: newKeyset,
        }

        // 3. 签名
        const signature = await signAuthorityPackage(newL, creatorPrivateKey)

        const newAuthorityPackage: AuthorityPackage = {
          ...newL,
          signature,
        }

        // 4. 更新状态并广播
        setAuthorityPackage(newAuthorityPackage)
        // 持久化到 localStorage（加密）
        const roomId = window.location.pathname.split('/').pop() || ''
        if (roomId && authorityPackage) {
          try {
            const password = sessionStorage.getItem(`chitchatter_room_password_${roomId}`)
            if (password) {
              const { encryptWithPassword } = await import('services/Encryption')
              const encrypted = await encryptWithPassword(
                JSON.stringify(newAuthorityPackage),
                password,
                `authority-${roomId}`
              )
              localStorage.setItem(`chitchatter_authority_${roomId}`, encrypted)
            } else {
              localStorage.setItem(`chitchatter_authority_${roomId}`, JSON.stringify(newAuthorityPackage))
            }
          } catch {
            localStorage.setItem(`chitchatter_authority_${roomId}`, JSON.stringify(newAuthorityPackage))
          }
        }
        broadcastAuthorityPackage(newAuthorityPackage)

        return true
      } catch (err) {
        setError(`吊销密钥失败: ${err}`)
        return false
      }
    },
    [isRoomCreator, creatorPrivateKey, authorityPackage, setAuthorityPackage]
  )

  /**
   * 清理过期密钥
   */
  const cleanupExpiredKeys = useCallback(async (): Promise<number> => {
    if (!isRoomCreator || !creatorPrivateKey || !authorityPackage) {
      return 0
    }

    setError(null)

    try {
      const now = Date.now()
      let count = 0

      const newKeyset = authorityPackage.keyset.map(record => {
        if (
          record.status === 'ACTIVE' &&
          new Date(record.expiration).getTime() < now
        ) {
          count++
          return { ...record, status: 'EXPIRED' as const }
        }
        return record
      })

      if (count === 0) return 0

      const newL = {
        version: authorityPackage.version + 1,
        timestamp: new Date().toISOString(),
        keyset: newKeyset,
      }

      const signature = await signAuthorityPackage(newL, creatorPrivateKey)

      const newAuthorityPackage = {
        ...newL,
        signature,
      }
      
      setAuthorityPackage(newAuthorityPackage)
      // 持久化到 localStorage（加密）
      const roomId = window.location.pathname.split('/').pop() || ''
      if (roomId && authorityPackage) {
        try {
          const password = sessionStorage.getItem(`chitchatter_room_password_${roomId}`)
          if (password) {
            const { encryptWithPassword } = await import('services/Encryption')
            const encrypted = await encryptWithPassword(
              JSON.stringify(newAuthorityPackage),
              password,
              `authority-${roomId}`
            )
            localStorage.setItem(`chitchatter_authority_${roomId}`, encrypted)
          } else {
            localStorage.setItem(`chitchatter_authority_${roomId}`, JSON.stringify(newAuthorityPackage))
          }
        } catch {
          localStorage.setItem(`chitchatter_authority_${roomId}`, JSON.stringify(newAuthorityPackage))
        }
      }
      broadcastAuthorityPackage(newAuthorityPackage)

      return count
    } catch (err) {
      setError(`清理过期密钥失败: ${err}`)
      return 0
    }
  }, [isRoomCreator, creatorPrivateKey, authorityPackage, setAuthorityPackage])

  return {
    keys: authorityPackage?.keyset || [],
    generateKey,
    revokeKey,
    cleanupExpiredKeys,
    isGenerating,
    error,
    isRoomCreator,
  }
}
