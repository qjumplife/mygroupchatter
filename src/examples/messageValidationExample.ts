// 消息验证系统使用示例

import { GroupClaim, JoinRequest, JoinResponse, MessageType } from 'models/groupClaim'
import { sendGroupClaim, sendJoinRequest, sendJoinResponse } from 'utils/messageSender'
import { receiveMessage, messageStats } from 'utils/messageReceiver'
import { GroupClaimManager } from 'utils/groupClaimManager'

// 示例1: 发送GroupClaim时的验证
async function exampleSendGroupClaim() {
  const groupClaim: GroupClaim = {
    createdAt: '2025-11-09T10:00:00.000Z',
    roomId: 'room-123',
    creatorId: 'user-456',
    version: 1,
    timestamp: '2025-11-09T10:00:00.000Z',
    publicKey: 'MCowBQYDK2VwAyEAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    keyset: [],
    signature: 'signature-here'
  }

  // 模拟发送函数
  const mockSendFunction = async (data: GroupClaim, targetPeerId?: string) => {
    console.log('实际发送GroupClaim:', data)
  }

  // 使用验证包装器发送
  const success = await sendGroupClaim(groupClaim, mockSendFunction, 'peer-123')
  
  if (success) {
    console.log('✅ GroupClaim发送成功')
  } else {
    console.log('❌ GroupClaim发送失败')
  }
}

// 示例2: 接收消息时的验证
async function exampleReceiveMessage() {
  // 模拟接收到的数据
  const receivedData = {
    createdAt: '2025-11-09T10:00:00.000Z',
    roomId: 'room-123',
    creatorId: 'user-456',
    version: 1,
    timestamp: '2025-11-09T10:00:00.000Z',
    publicKey: 'MCowBQYDK2VwAyEAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    keyset: [],
    signature: 'signature-here'
  }

  // 处理函数
  const handlers = {
    onGroupClaim: async (groupClaim: GroupClaim, fromPeerId: string) => {
      console.log('处理GroupClaim:', groupClaim)
      console.log('来自peer:', fromPeerId)
    },
    onJoinRequest: async (joinRequest: JoinRequest, fromPeerId: string) => {
      console.log('处理JoinRequest:', joinRequest)
    },
    onJoinResponse: async (joinResponse: JoinResponse, fromPeerId: string) => {
      console.log('处理JoinResponse:', joinResponse)
    }
  }

  // 使用验证包装器接收
  const success = await receiveMessage(receivedData, 'peer-456', handlers)
  
  if (success) {
    console.log('✅ 消息接收和处理成功')
  } else {
    console.log('❌ 消息接收或处理失败')
  }
}

// 示例3: 使用GroupClaimManager
async function exampleGroupClaimManager() {
  const manager = new GroupClaimManager()

  // 创建GroupClaim
  const mockPrivateKey = {} as CryptoKey // 实际使用时需要真实的私钥
  
  try {
    const groupClaim = await manager.createGroupClaim(
      'room-123',
      'user-456', 
      'MCowBQYDK2VwAyEAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      mockPrivateKey
    )
    console.log('✅ GroupClaim创建成功')

    // 添加邀请码
    const success = await manager.addInviteKey(
      'ABCD-EFGH-IJKL-MNOP',
      '2025-11-16T10:00:00.000Z',
      { iv: 'iv-here', ciphertext: 'ciphertext-here' },
      mockPrivateKey
    )

    if (success) {
      console.log('✅ 邀请码添加成功')
    }

    // 智能发送
    const mockSendFunction = async (data: GroupClaim, targetPeerId?: string) => {
      console.log('发送GroupClaim到:', targetPeerId || '广播')
    }

    const mockPeerList = [
      { peerId: 'peer-1' },
      { peerId: 'peer-2' },
      { peerId: 'peer-3' }
    ]

    await manager.sendGroupClaimSmart(mockSendFunction, mockPeerList)

    // 查看统计
    console.log('统计信息:', manager.getStats())
    
  } catch (error) {
    console.error('❌ GroupClaimManager操作失败:', error)
  }
}

// 导出示例函数供测试使用
export {
  exampleSendGroupClaim,
  exampleReceiveMessage,
  exampleGroupClaimManager
}