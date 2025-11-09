import { GroupClaim, JoinRequest, JoinResponse, MessageType } from 'models/groupClaim'
import { validateMessage, logValidation } from 'utils/messageValidation'

// 发送GroupClaim的包装器
export const sendGroupClaim = async (
  groupClaim: GroupClaim,
  sendFunction: (data: GroupClaim, targetPeerId?: string) => Promise<void>,
  targetPeerId?: string
): Promise<boolean> => {
  // 发送前验证
  const validation = validateMessage(MessageType.GROUP_CLAIM, groupClaim)
  logValidation(MessageType.GROUP_CLAIM, 'SEND', validation, groupClaim)
  
  if (!validation.isValid) {
    console.error('[SEND_ERROR] GroupClaim验证失败，取消发送:', validation.message)
    return false
  }

  try {
    await sendFunction(groupClaim, targetPeerId)
    console.log(`[SEND_SUCCESS] GroupClaim已发送${targetPeerId ? ` 到 ${targetPeerId.substring(0, 8)}...` : ' (广播)'}`)
    return true
  } catch (error) {
    console.error('[SEND_ERROR] GroupClaim发送失败:', error)
    return false
  }
}

// 发送JoinRequest的包装器
export const sendJoinRequest = async (
  joinRequest: JoinRequest,
  sendFunction: (data: JoinRequest, targetPeerId: string) => Promise<void>,
  targetPeerId: string
): Promise<boolean> => {
  // 发送前验证
  const validation = validateMessage(MessageType.JOIN_REQUEST, joinRequest)
  logValidation(MessageType.JOIN_REQUEST, 'SEND', validation, joinRequest)
  
  if (!validation.isValid) {
    console.error('[SEND_ERROR] JoinRequest验证失败，取消发送:', validation.message)
    return false
  }

  try {
    await sendFunction(joinRequest, targetPeerId)
    console.log(`[SEND_SUCCESS] JoinRequest已发送到 ${targetPeerId.substring(0, 8)}...`)
    return true
  } catch (error) {
    console.error('[SEND_ERROR] JoinRequest发送失败:', error)
    return false
  }
}

// 发送JoinResponse的包装器
export const sendJoinResponse = async (
  joinResponse: JoinResponse,
  sendFunction: (data: JoinResponse, targetPeerId: string) => Promise<void>,
  targetPeerId: string
): Promise<boolean> => {
  // 发送前验证
  const validation = validateMessage(MessageType.JOIN_RESPONSE, joinResponse)
  logValidation(MessageType.JOIN_RESPONSE, 'SEND', validation, joinResponse)
  
  if (!validation.isValid) {
    console.error('[SEND_ERROR] JoinResponse验证失败，取消发送:', validation.message)
    return false
  }

  try {
    await sendFunction(joinResponse, targetPeerId)
    console.log(`[SEND_SUCCESS] JoinResponse(${joinResponse.result})已发送到 ${targetPeerId.substring(0, 8)}...`)
    return true
  } catch (error) {
    console.error('[SEND_ERROR] JoinResponse发送失败:', error)
    return false
  }
}

// 批量发送GroupClaim（智能广播）
export const sendGroupClaimToMultiple = async (
  groupClaim: GroupClaim,
  sendFunction: (data: GroupClaim, targetPeerId: string) => Promise<void>,
  targetPeerIds: string[]
): Promise<{ success: number; failed: number }> => {
  // 发送前验证
  const validation = validateMessage(MessageType.GROUP_CLAIM, groupClaim)
  logValidation(MessageType.GROUP_CLAIM, 'SEND', validation, groupClaim)
  
  if (!validation.isValid) {
    console.error('[SEND_ERROR] GroupClaim验证失败，取消批量发送:', validation.message)
    return { success: 0, failed: targetPeerIds.length }
  }

  let success = 0
  let failed = 0

  console.log(`[BATCH_SEND] 开始批量发送GroupClaim到 ${targetPeerIds.length} 个peer`)

  for (const peerId of targetPeerIds) {
    try {
      await sendFunction(groupClaim, peerId)
      success++
      console.log(`[BATCH_SEND] ✅ 发送成功到 ${peerId.substring(0, 8)}...`)
    } catch (error) {
      failed++
      console.error(`[BATCH_SEND] ❌ 发送失败到 ${peerId.substring(0, 8)}...:`, error)
    }
  }

  console.log(`[BATCH_SEND] 批量发送完成: 成功 ${success}, 失败 ${failed}`)
  return { success, failed }
}