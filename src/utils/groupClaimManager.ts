// GroupClaim管理器 - 展示如何使用新的验证系统

import { GroupClaim, InviteKeyRecord, MessageType } from 'models/groupClaim'
import { sendGroupClaim } from 'utils/messageSender'
import { receiveMessage, messageStats } from 'utils/messageReceiver'
import { validateMessage, logValidation } from 'utils/messageValidation'

export class GroupClaimManager {
  private localGroupClaim: GroupClaim | null = null
  private sentMessageHashes = new Set<string>()
  private peerKnownMessages = new Map<string, Set<string>>()

  // 创建新的GroupClaim
  async createGroupClaim(
    roomId: string,
    creatorId: string,
    publicKey: string,
    privateKey: CryptoKey
  ): Promise<GroupClaim> {
    const now = new Date().toISOString()
    
    const groupClaim: GroupClaim = {
      createdAt: now,
      roomId,
      creatorId,
      version: 1,
      timestamp: now,
      publicKey,
      keyset: [],
      signature: '' // 将在签名后填充
    }

    // 签名
    groupClaim.signature = await this.signGroupClaim(groupClaim, privateKey)
    
    // 验证创建的消息
    const validation = validateMessage(MessageType.GROUP_CLAIM, groupClaim)
    logValidation(MessageType.GROUP_CLAIM, 'SEND', validation, groupClaim)
    
    if (!validation.isValid) {
      throw new Error(`创建的GroupClaim无效: ${validation.message}`)
    }

    this.localGroupClaim = groupClaim
    console.log('[GROUP_CLAIM_MANAGER] ✅ GroupClaim创建成功:', {
      roomId: roomId.substring(0, 8) + '...',
      creatorId: creatorId.substring(0, 8) + '...',
      version: groupClaim.version
    })

    return groupClaim
  }

  // 添加邀请码记录
  async addInviteKey(
    inviteKey: string,
    expiration: string,
    encryptedContentKey: { iv: string; ciphertext: string },
    privateKey: CryptoKey
  ): Promise<boolean> {
    if (!this.localGroupClaim) {
      console.error('[GROUP_CLAIM_MANAGER] ❌ 无本地GroupClaim，无法添加邀请码')
      return false
    }

    const { sha256 } = await import('services/Encryption')
    const hash = await sha256(inviteKey)
    
    const newRecord: InviteKeyRecord = {
      hash,
      expiration,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      creatorId: this.localGroupClaim.creatorId,
      roomId: this.localGroupClaim.roomId,
      sequence: this.localGroupClaim.keyset.length + 1,
      encryptedContentKey
    }

    // 更新GroupClaim
    const updatedGroupClaim: GroupClaim = {
      ...this.localGroupClaim,
      version: this.localGroupClaim.version + 1,
      timestamp: new Date().toISOString(),
      keyset: [...this.localGroupClaim.keyset, newRecord]
    }

    // 重新签名
    updatedGroupClaim.signature = await this.signGroupClaim(updatedGroupClaim, privateKey)

    // 验证更新后的消息
    const validation = validateMessage(MessageType.GROUP_CLAIM, updatedGroupClaim)
    logValidation(MessageType.GROUP_CLAIM, 'SEND', validation, updatedGroupClaim)
    
    if (!validation.isValid) {
      console.error('[GROUP_CLAIM_MANAGER] ❌ 更新的GroupClaim无效:', validation.message)
      return false
    }

    this.localGroupClaim = updatedGroupClaim
    console.log('[GROUP_CLAIM_MANAGER] ✅ 邀请码添加成功:', {
      sequence: newRecord.sequence,
      hash: hash.substring(0, 16) + '...',
      version: updatedGroupClaim.version
    })

    return true
  }

  // 智能发送GroupClaim
  async sendGroupClaimSmart(
    sendFunction: (data: GroupClaim, targetPeerId?: string) => Promise<void>,
    peerList: Array<{ peerId: string }>,
    targetPeerId?: string
  ): Promise<boolean> {
    if (!this.localGroupClaim) {
      console.error('[GROUP_CLAIM_MANAGER] ❌ 无本地GroupClaim，无法发送')
      return false
    }

    const messageHash = this.getMessageHash(this.localGroupClaim)

    if (targetPeerId) {
      // 点对点发送
      if (this.peerKnownMessages.get(targetPeerId)?.has(messageHash)) {
        console.log(`[GROUP_CLAIM_MANAGER] ⏭️ peer ${targetPeerId.substring(0, 8)}... 已知此消息，跳过发送`)
        return true
      }

      const success = await sendGroupClaim(this.localGroupClaim, sendFunction, targetPeerId)
      if (success) {
        this.markMessageSent(messageHash, targetPeerId)
        messageStats.recordSent(MessageType.GROUP_CLAIM, true)
      } else {
        messageStats.recordSent(MessageType.GROUP_CLAIM, false)
      }
      return success
    } else {
      // 智能广播 - 只发送给不知道的peer
      const unknownPeers = peerList.filter(peer => 
        !this.peerKnownMessages.get(peer.peerId)?.has(messageHash)
      )

      if (unknownPeers.length === 0) {
        console.log('[GROUP_CLAIM_MANAGER] ⏭️ 所有peer都已知此消息，跳过广播')
        return true
      }

      console.log(`[GROUP_CLAIM_MANAGER] 📡 智能广播到 ${unknownPeers.length} 个未知peer`)
      
      let successCount = 0
      for (const peer of unknownPeers) {
        const success = await sendGroupClaim(this.localGroupClaim, sendFunction, peer.peerId)
        if (success) {
          successCount++
          this.markMessageSent(messageHash, peer.peerId)
          messageStats.recordSent(MessageType.GROUP_CLAIM, true)
        } else {
          messageStats.recordSent(MessageType.GROUP_CLAIM, false)
        }
      }

      console.log(`[GROUP_CLAIM_MANAGER] 📡 广播完成: ${successCount}/${unknownPeers.length} 成功`)
      return successCount > 0
    }
  }

  // 接收GroupClaim处理
  async handleReceivedGroupClaim(groupClaim: GroupClaim, fromPeerId: string): Promise<void> {
    console.log(`[GROUP_CLAIM_MANAGER] 📥 处理收到的GroupClaim from ${fromPeerId.substring(0, 8)}...`)
    
    const messageHash = this.getMessageHash(groupClaim)
    
    // 标记发送者已知此消息
    if (!this.peerKnownMessages.has(fromPeerId)) {
      this.peerKnownMessages.set(fromPeerId, new Set())
    }
    this.peerKnownMessages.get(fromPeerId)!.add(messageHash)
    
    messageStats.recordReceived(MessageType.GROUP_CLAIM)

    // 处理逻辑（根据改造方向文档）
    if (!this.localGroupClaim) {
      // 本地无数据，保存接收到的
      this.localGroupClaim = groupClaim
      console.log('[GROUP_CLAIM_MANAGER] 💾 保存接收到的GroupClaim（本地无数据）')
      return
    }

    // 本地有数据，需要比较
    if (groupClaim.roomId !== this.localGroupClaim.roomId) {
      console.warn('[GROUP_CLAIM_MANAGER] ⚠️ 房间ID不匹配，忽略')
      return
    }

    if (groupClaim.creatorId === this.localGroupClaim.creatorId) {
      // 同一创建者，比较版本号
      if (groupClaim.version > this.localGroupClaim.version) {
        this.localGroupClaim = groupClaim
        console.log('[GROUP_CLAIM_MANAGER] 🔄 更新到更新版本:', groupClaim.version)
      }
    } else {
      // 不同创建者，比较创建时间
      const localCreatedTime = new Date(this.localGroupClaim.createdAt).getTime()
      const receivedCreatedTime = new Date(groupClaim.createdAt).getTime()
      
      if (receivedCreatedTime < localCreatedTime) {
        console.log('[GROUP_CLAIM_MANAGER] 🔄 检测到更早的管理员，立即降级')
        
        // 彻底清除所有数据
        const roomId = this.localGroupClaim.roomId
        const creatorId = this.localGroupClaim.creatorId
        
        // 清除本地GroupClaim
        this.localGroupClaim = null
        
        // 清除所有localStorage数据
        const allKeys = Object.keys(localStorage)
        allKeys.forEach(key => {
          if (key.includes(roomId)) {
            localStorage.removeItem(key)
            console.log('[GROUP_CLAIM_MANAGER] 清除localStorage键:', key)
          }
        })
        
        // 清除所有sessionStorage数据
        const sessionKeys = Object.keys(sessionStorage)
        sessionKeys.forEach(key => {
          if (key.includes(roomId)) {
            sessionStorage.removeItem(key)
            console.log('[GROUP_CLAIM_MANAGER] 清除sessionStorage键:', key)
          }
        })
        
        // 从房间历史中移除
        try {
          const { removeRoomFromHistory } = await import('services/RoomHistory')
          removeRoomFromHistory(roomId)
          console.log('[GROUP_CLAIM_MANAGER] 已从房间历史中移除')
        } catch (error) {
          console.error('[GROUP_CLAIM_MANAGER] 移除房间历史失败:', error)
        }
        
        // 显示警告并立即跳转
        alert('检测到更早的管理员，你已被降级为群外新人！')
        
        // 立即跳转到主页
        window.location.href = '/'
        
        // 如果跳转失败，强制刷新
        setTimeout(() => {
          window.location.reload()
        }, 100)
        
        return // 立即返回，不执行后续逻辑
      } else {
        console.log('[GROUP_CLAIM_MANAGER] ⏭️ 保留本地更早的GroupClaim')
      }
    }
  }

  // 获取消息哈希
  private getMessageHash(groupClaim: GroupClaim): string {
    return `${groupClaim.roomId}-${groupClaim.creatorId}-${groupClaim.version}`
  }

  // 标记消息已发送
  private markMessageSent(messageHash: string, peerId: string) {
    this.sentMessageHashes.add(messageHash)
    if (!this.peerKnownMessages.has(peerId)) {
      this.peerKnownMessages.set(peerId, new Set())
    }
    this.peerKnownMessages.get(peerId)!.add(messageHash)
  }

  // 签名GroupClaim
  private async signGroupClaim(groupClaim: Omit<GroupClaim, 'signature'>, privateKey: CryptoKey): Promise<string> {
    const { signAuthorityPackage } = await import('services/Encryption')
    return await signAuthorityPackage(groupClaim, privateKey)
  }

  // 获取当前GroupClaim
  getLocalGroupClaim(): GroupClaim | null {
    return this.localGroupClaim
  }

  // 获取统计信息
  getStats() {
    return {
      localGroupClaim: this.localGroupClaim ? {
        version: this.localGroupClaim.version,
        keysetCount: this.localGroupClaim.keyset.length
      } : null,
      sentMessages: this.sentMessageHashes.size,
      knownPeers: this.peerKnownMessages.size,
      messageStats: messageStats.getStats()
    }
  }
}