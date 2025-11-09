import { useState, useCallback, useContext } from 'react'
import { RoomContext } from 'contexts/RoomContext'
import { InviteKeyRecord, GroupClaim } from 'models/groupClaim'
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
    groupClaim,
    setGroupClaim,
    contentKey,
    creatorPrivateKey,
    isRoomCreator,
    broadcastGroupClaim,
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

      if (!contentKey || !creatorPrivateKey || !groupClaim) {
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
          usedBy: undefined,
          createdAt: new Date().toISOString(),
          creatorId: groupClaim.creatorId,
          roomId: groupClaim.roomId,
          sequence: groupClaim.keyset.length + 1,
          encryptedContentKey,
        }

        // 5. 更新 GroupClaim
        const newGroupClaim: GroupClaim = {
          ...groupClaim,
          version: groupClaim.version + 1,
          timestamp: new Date().toISOString(),
          keyset: [...groupClaim.keyset, newRecord],
          signature: '',
        }

        // 6. 签名
        newGroupClaim.signature = await signAuthorityPackage(newGroupClaim, creatorPrivateKey)

        // 7. 更新状态并广播
        setGroupClaim(newGroupClaim)
        
        // 保存到localStorage
        try {
          localStorage.setItem(`chitchatter_groupclaim_${groupClaim.roomId}`, JSON.stringify(newGroupClaim))
          console.log('[邀请码生成] GroupClaim已保存:', newGroupClaim.version)
        } catch (error) {
          console.error('[邀请码生成] 保存GroupClaim失败:', error)
        }
        
        broadcastGroupClaim(newGroupClaim)

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
      groupClaim,
      setGroupClaim,
      broadcastGroupClaim,
    ]
  )

  /**
   * 吊销密钥
   */
  const revokeKey = useCallback(
    async (hash: string): Promise<boolean> => {
      if (!isRoomCreator || !creatorPrivateKey || !groupClaim) {
        setError('无法吊销密钥')
        return false
      }

      setError(null)

      try {
        // 1. 找到记录并修改状态
        const newKeyset = groupClaim.keyset.map(record =>
          record.hash === hash ? { ...record, status: 'REVOKED' as const } : record
        )

        // 2. 更新 GroupClaim
        const newGroupClaim: GroupClaim = {
          ...groupClaim,
          version: groupClaim.version + 1,
          timestamp: new Date().toISOString(),
          keyset: newKeyset,
          signature: '',
        }

        // 3. 签名
        newGroupClaim.signature = await signAuthorityPackage(newGroupClaim, creatorPrivateKey)

        // 4. 更新状态并广播
        setGroupClaim(newGroupClaim)
        
        // 保存到localStorage
        try {
          localStorage.setItem(`chitchatter_groupclaim_${groupClaim.roomId}`, JSON.stringify(newGroupClaim))
          console.log('[邀请码吊销] GroupClaim已保存:', newGroupClaim.version)
        } catch (error) {
          console.error('[邀请码吊销] 保存GroupClaim失败:', error)
        }
        
        broadcastGroupClaim(newGroupClaim)

        return true
      } catch (err) {
        setError(`吊销密钥失败: ${err}`)
        return false
      }
    },
    [isRoomCreator, creatorPrivateKey, groupClaim, setGroupClaim, broadcastGroupClaim]
  )

  /**
   * 清理过期密钥
   */
  const cleanupExpiredKeys = useCallback(async (): Promise<number> => {
    if (!isRoomCreator || !creatorPrivateKey || !groupClaim) {
      return 0
    }

    setError(null)

    try {
      const now = Date.now()
      let count = 0

      const newKeyset = groupClaim.keyset.map(record => {
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

      const newGroupClaim: GroupClaim = {
        ...groupClaim,
        version: groupClaim.version + 1,
        timestamp: new Date().toISOString(),
        keyset: newKeyset,
        signature: '',
      }

      newGroupClaim.signature = await signAuthorityPackage(newGroupClaim, creatorPrivateKey)
      
      setGroupClaim(newGroupClaim)
      
      // 保存到localStorage
      try {
        localStorage.setItem(`chitchatter_groupclaim_${groupClaim.roomId}`, JSON.stringify(newGroupClaim))
        console.log('[清理过期] GroupClaim已保存:', newGroupClaim.version)
      } catch (error) {
        console.error('[清理过期] 保存GroupClaim失败:', error)
      }
      
      broadcastGroupClaim(newGroupClaim)

      return count
    } catch (err) {
      setError(`清理过期密钥失败: ${err}`)
      return 0
    }
  }, [isRoomCreator, creatorPrivateKey, groupClaim, setGroupClaim, broadcastGroupClaim])

  return {
    keys: groupClaim?.keyset || [],
    generateKey,
    revokeKey,
    cleanupExpiredKeys,
    isGenerating,
    error,
    isRoomCreator,
  }
}
