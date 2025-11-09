import { GroupClaim, JoinRequest, JoinResponse, MessageType } from 'models/groupClaim'
import { validateMessage, logValidation } from 'utils/messageValidation'

// 接收GroupClaim的包装器
export const receiveGroupClaim = (
  data: any,
  fromPeerId: string,
  handler: (groupClaim: GroupClaim, fromPeerId: string) => Promise<void>
): Promise<boolean> => {
  console.log(`[RECEIVE] 收到GroupClaim from ${fromPeerId.substring(0, 8)}...`)
  
  // 接收时验证
  const validation = validateMessage(MessageType.GROUP_CLAIM, data)
  logValidation(MessageType.GROUP_CLAIM, 'RECEIVE', validation, data)
  
  if (!validation.isValid) {
    console.error(`[RECEIVE_ERROR] GroupClaim验证失败 from ${fromPeerId.substring(0, 8)}...:`, validation.message)
    console.error('[RECEIVE_ERROR] 原始数据:', data)
    return Promise.resolve(false)
  }

  try {
    handler(data as GroupClaim, fromPeerId)
    console.log(`[RECEIVE_SUCCESS] GroupClaim处理完成 from ${fromPeerId.substring(0, 8)}...`)
    return Promise.resolve(true)
  } catch (error) {
    console.error(`[RECEIVE_ERROR] GroupClaim处理失败 from ${fromPeerId.substring(0, 8)}...:`, error)
    return Promise.resolve(false)
  }
}

// 接收JoinRequest的包装器
export const receiveJoinRequest = (
  data: any,
  fromPeerId: string,
  handler: (joinRequest: JoinRequest, fromPeerId: string) => Promise<void>
): Promise<boolean> => {
  console.log(`[RECEIVE] 收到JoinRequest from ${fromPeerId.substring(0, 8)}...`)
  
  // 接收时验证
  const validation = validateMessage(MessageType.JOIN_REQUEST, data)
  logValidation(MessageType.JOIN_REQUEST, 'RECEIVE', validation, data)
  
  if (!validation.isValid) {
    console.error(`[RECEIVE_ERROR] JoinRequest验证失败 from ${fromPeerId.substring(0, 8)}...:`, validation.message)
    console.error('[RECEIVE_ERROR] 原始数据:', data)
    return Promise.resolve(false)
  }

  try {
    handler(data as JoinRequest, fromPeerId)
    console.log(`[RECEIVE_SUCCESS] JoinRequest处理完成 from ${fromPeerId.substring(0, 8)}...`)
    return Promise.resolve(true)
  } catch (error) {
    console.error(`[RECEIVE_ERROR] JoinRequest处理失败 from ${fromPeerId.substring(0, 8)}...:`, error)
    return Promise.resolve(false)
  }
}

// 接收JoinResponse的包装器
export const receiveJoinResponse = (
  data: any,
  fromPeerId: string,
  handler: (joinResponse: JoinResponse, fromPeerId: string) => Promise<void>
): Promise<boolean> => {
  console.log(`[RECEIVE] 收到JoinResponse from ${fromPeerId.substring(0, 8)}...`)
  
  // 接收时验证
  const validation = validateMessage(MessageType.JOIN_RESPONSE, data)
  logValidation(MessageType.JOIN_RESPONSE, 'RECEIVE', validation, data)
  
  if (!validation.isValid) {
    console.error(`[RECEIVE_ERROR] JoinResponse验证失败 from ${fromPeerId.substring(0, 8)}...:`, validation.message)
    console.error('[RECEIVE_ERROR] 原始数据:', data)
    return Promise.resolve(false)
  }

  try {
    handler(data as JoinResponse, fromPeerId)
    console.log(`[RECEIVE_SUCCESS] JoinResponse处理完成 from ${fromPeerId.substring(0, 8)}...`)
    return Promise.resolve(true)
  } catch (error) {
    console.error(`[RECEIVE_ERROR] JoinResponse处理失败 from ${fromPeerId.substring(0, 8)}...:`, error)
    return Promise.resolve(false)
  }
}

// 通用消息接收器（根据消息内容自动识别类型）
export const receiveMessage = (
  data: any,
  fromPeerId: string,
  handlers: {
    onGroupClaim?: (groupClaim: GroupClaim, fromPeerId: string) => Promise<void>
    onJoinRequest?: (joinRequest: JoinRequest, fromPeerId: string) => Promise<void>
    onJoinResponse?: (joinResponse: JoinResponse, fromPeerId: string) => Promise<void>
  }
): Promise<boolean> => {
  console.log(`[RECEIVE] 收到消息 from ${fromPeerId.substring(0, 8)}..., 识别类型中...`)
  
  // 根据消息特征识别类型
  if (data?.type === 'JOIN_REQUEST' && handlers.onJoinRequest) {
    return receiveJoinRequest(data, fromPeerId, handlers.onJoinRequest)
  }
  
  if (data?.type === 'JOIN_RESPONSE' && handlers.onJoinResponse) {
    return receiveJoinResponse(data, fromPeerId, handlers.onJoinResponse)
  }
  
  // 如果有createdAt, roomId, creatorId等字段，认为是GroupClaim
  if (data?.createdAt && data?.roomId && data?.creatorId && handlers.onGroupClaim) {
    return receiveGroupClaim(data, fromPeerId, handlers.onGroupClaim)
  }
  
  console.warn(`[RECEIVE_WARNING] 无法识别消息类型 from ${fromPeerId.substring(0, 8)}...:`, data)
  return Promise.resolve(false)
}

// 消息统计工具
export class MessageStats {
  private stats = {
    groupClaim: { sent: 0, received: 0, failed: 0 },
    joinRequest: { sent: 0, received: 0, failed: 0 },
    joinResponse: { sent: 0, received: 0, failed: 0 }
  }

  recordSent(messageType: MessageType, success: boolean) {
    const key = this.getStatsKey(messageType)
    if (success) {
      this.stats[key].sent++
    } else {
      this.stats[key].failed++
    }
  }

  recordReceived(messageType: MessageType) {
    const key = this.getStatsKey(messageType)
    this.stats[key].received++
  }

  private getStatsKey(messageType: MessageType): keyof typeof this.stats {
    switch (messageType) {
      case MessageType.GROUP_CLAIM: return 'groupClaim'
      case MessageType.JOIN_REQUEST: return 'joinRequest'
      case MessageType.JOIN_RESPONSE: return 'joinResponse'
      default: return 'groupClaim'
    }
  }

  getStats() {
    return { ...this.stats }
  }

  logStats() {
    console.log('[MESSAGE_STATS] 消息统计:', this.stats)
  }
}

// 全局消息统计实例
export const messageStats = new MessageStats()