import { useDebounce } from '@react-hook/debounce'
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { v4 as uuid } from 'uuid'

import { getPeerName, usePeerNameDisplay } from 'components/PeerNameDisplay'
import { RoomContextProps } from 'contexts/RoomContext'
import { SettingsContext } from 'contexts/SettingsContext'
import { ShellContext } from 'contexts/ShellContext'
import { usePeerAction } from 'hooks/usePeerAction'
import { Audio } from 'lib/Audio'
import {
  ActionNamespace,
  PeerHookType,
  PeerRoom,
  RoomConfig,
} from 'lib/PeerRoom'
import { time } from 'lib/Time'
import {
  AudioChannelName,
  AudioState,
  FileOfferMetadata,
  InlineMedia,
  isInlineMedia,
  isMessageReceived,
  Message,
  Peer,
  PeerVerificationState,
  ReceivedInlineMedia,
  ReceivedMessage,
  ScreenShareState,
  TypingStatus,
  UnsentInlineMedia,
  UnsentMessage,
  VideoState,
} from 'models/chat'
import { PeerAction } from 'models/network'
import { AllowedKeyType, encryption } from 'services/Encryption'
import { FileTransferService } from 'services/FileTransfer'
import { notification } from 'services/Notification'
import { saveVerifiedUser, loadVerifiedUser, createGroupClaim, restoreCreatorIdentity, isRoomCreator as checkIsRoomCreator } from 'services/GroupClaimService'
import { encryptMessageContent, decryptMessageContent, canSendMessage } from 'services/Authority/MessageEncryption'
import { decryptContentKeyWithKi } from 'services/Authority/Verification'
import { signAuthorityPackage, sha256 } from 'services/Encryption'
import { GroupClaim, JoinRequest, JoinResponse, StatusUpdateNotification, StatusUpdateAck, AdminPing, AdminPong, MessageType, InviteKeyRecord } from 'models/groupClaim'
import { sendGroupClaim, sendJoinRequest as sendJoinReq, sendJoinResponse as sendJoinResp } from 'utils/messageSender'
import { receiveMessage, messageStats } from 'utils/messageReceiver'

import { messageTranscriptSizeLimit } from 'config/messaging'

import { usePeerVerification } from './usePeerVerification'

interface UseRoomConfig {
  roomId: string
  userId: string
  publicKey: CryptoKey
  getUuid?: typeof uuid
  encryptionService?: typeof encryption
  timeService?: typeof time
  targetPeerId?: string | null
}

interface UserMetadata extends Record<string, any> {
  userId: string
  customUsername: string
  publicKeyString: string
}

export function useRoom(
  { password, ...roomConfig }: RoomConfig,
  {
    roomId,
    userId,
    publicKey,
    targetPeerId = null,
    getUuid = uuid,
    encryptionService = encryption,
    timeService = time,
  }: UseRoomConfig
) {
  const isPrivate = password !== undefined

  const isDirectMessageRoom = typeof targetPeerId === 'string'
  const namespace = isDirectMessageRoom
    ? ActionNamespace.DIRECT_MESSAGE
    : ActionNamespace.GROUP

  const {
    peerList,
    setPeerList,
    setPeerConnectionTypes,
    tabHasFocus,
    showAlert,
    setRoomId,
    setPassword,
    customUsername,
    updatePeer,
    peerRoomRef,
    messageLog: shellMessageLog,
    setMessageLog: shellSetMessageLog,
  } = useContext(ShellContext)

  const messageLog = isDirectMessageRoom
    ? (shellMessageLog.directMessageLog[targetPeerId] ?? [])
    : (Array.isArray(shellMessageLog.groupMessageLog) ? shellMessageLog.groupMessageLog : [])

  const [peerRoom] = useState(() => {
    if (peerRoomRef.current) {
      return peerRoomRef.current
    }
    const newPeerRoom = new PeerRoom({ password: password ?? roomId, ...roomConfig }, roomId)
    peerRoomRef.current = newPeerRoom
    return newPeerRoom
  })

  const settingsContext = useContext(SettingsContext)
  const { showActiveTypingStatus } = settingsContext.getUserSettings()
  const [isMessageSending, setIsMessageSending] = useState(false)

  const { selectedSound } = settingsContext.getUserSettings()
  const [newMessageAudio] = useState(() => new Audio(selectedSound))

  const { getDisplayUsername } = usePeerNameDisplay()

  const fileTransferService = useMemo(
    () => new FileTransferService(roomConfig.rtcConfig!),
    [roomConfig.rtcConfig]
  )

  const setMessageLog = (messages: Array<Message | InlineMedia>) => {
    // 确保 messages是数组
    if (!Array.isArray(messages)) {
      console.error('setMessageLog received non-array:', messages)
      return
    }

    if (messages.length > messageTranscriptSizeLimit) {
      const evictedMessages = messages.slice(
        0,
        messages.length - messageTranscriptSizeLimit
      )

      for (const message of evictedMessages) {
        if (
          isInlineMedia(message) &&
          fileTransferService.fileTransfer.isOffering(message.magnetURI)
        ) {
          fileTransferService.fileTransfer.rescind(message.magnetURI)
        }
      }
    }

    shellSetMessageLog(
      messages.slice(-messageTranscriptSizeLimit),
      targetPeerId
    )
  }

  const [isShowingMessages, setIsShowingMessages] = useState(true)
  const [unreadMessages, setUnreadMessages] = useState(0)

  const [selfVideoStream, setSelfVideoStream] = useState<MediaStream | null>(
    null
  )
  const [peerVideoStreams, setPeerVideoStreams] = useState<
    Record<string, MediaStream>
  >({})

  const [selfScreenStream, setSelfScreenStream] = useState<MediaStream | null>(
    null
  )
  const [peerScreenStreams, setPeerScreenStreams] = useState<
    Record<string, MediaStream>
  >({})

  const [peerOfferedFileMetadata, setPeerOfferedFileMetadata] = useState<
    Record<string, FileOfferMetadata>
  >({})

  // 权限控制状态
  const [groupClaim, setGroupClaim] = useState<GroupClaim | null>(null)
  const [contentKey, setContentKey] = useState<CryptoKey | null>(null)
  const [isRoomCreator, setIsRoomCreator] = useState(false)
  const [creatorPrivateKey, setCreatorPrivateKey] = useState<CryptoKey | null>(null)
  const [isInitializing, setIsInitializing] = useState(true) // 初始化状态
  const contentKeyRef = useRef<CryptoKey | null>(null)
  const sendGroupClaimRef = useRef<((gc: GroupClaim) => void) | null>(null)
  const processedDirectMessageIds = useRef<Set<string>>(new Set())
  const [waitingForGroupClaim, setWaitingForGroupClaim] = useState(false)
  const [competitionTimer, setCompetitionTimer] = useState<NodeJS.Timeout | null>(null)
  const competitionStartedRef = useRef(false)
  
  useEffect(() => {
    contentKeyRef.current = contentKey
  }, [contentKey])

  const roomContextValue: RoomContextProps = useMemo(
    () => ({
      isPrivate,
      isMessageSending,
      isShowingMessages,
      setIsShowingMessages,
      unreadMessages,
      selfVideoStream,
      setSelfVideoStream,
      peerVideoStreams,
      setPeerVideoStreams,
      selfScreenStream,
      setSelfScreenStream,
      peerScreenStreams,
      setPeerScreenStreams,
      peerOfferedFileMetadata,
      setPeerOfferedFileMetadata,
      fileTransferService,
      groupClaim,
      setGroupClaim,
      contentKey,
      setContentKey,
      isRoomCreator,
      setIsRoomCreator,
      creatorPrivateKey,
      setCreatorPrivateKey,
      isInitializing,
      broadcastGroupClaim: (gc: GroupClaim) => {
        console.log('[broadcastGroupClaim] 广播 GroupClaim:', {
          version: gc.version,
          timestamp: gc.timestamp,
          roomId: gc.roomId?.substring(0, 8) + '...',
          creatorId: gc.creatorId?.substring(0, 8) + '...',
          keysetLength: gc.keyset?.length
        })
        if (sendGroupClaimRef.current) {
          sendGroupClaimRef.current(gc)
        }
      },
    }),
    [
      isPrivate,
      isMessageSending,
      isShowingMessages,
      setIsShowingMessages,
      unreadMessages,
      selfVideoStream,
      setSelfVideoStream,
      peerVideoStreams,
      setPeerVideoStreams,
      selfScreenStream,
      setSelfScreenStream,
      peerScreenStreams,
      setPeerScreenStreams,
      peerOfferedFileMetadata,
      setPeerOfferedFileMetadata,
      fileTransferService,
      groupClaim,
      setGroupClaim,
      contentKey,
      setContentKey,
      isRoomCreator,
      setIsRoomCreator,
      creatorPrivateKey,
      setCreatorPrivateKey,
      isInitializing,
    ]
  )

  const [sendTypingStatusChange] = usePeerAction<TypingStatus>({
    namespace,
    peerAction: PeerAction.TYPING_STATUS_CHANGE,
    peerRoom,
    onReceive: (typingStatus, peerId) => {
      const { isTyping } = typingStatus

      updatePeer(peerId, {
        isTypingGroupMessage: isTyping && !isDirectMessageRoom,
        isTypingDirectMessage: isTyping && isDirectMessageRoom,
      })
    },
  })

  const [isTyping, setIsTypingDebounced, setIsTyping] = useDebounce(
    false,
    2000,
    true
  )

  useEffect(() => {
    if (!showActiveTypingStatus) return

    sendTypingStatusChange({ isTyping }, targetPeerId)
  }, [
    isDirectMessageRoom,
    isTyping,
    sendTypingStatusChange,
    showActiveTypingStatus,
    targetPeerId,
  ])

  useEffect(() => {
    return () => {
      sendTypingStatusChange({ isTyping: false }, targetPeerId)
      
      if (!isDirectMessageRoom) {
        peerRoom.leaveRoom()
        peerRoomRef.current = null
        setPeerList([])
        shellSetMessageLog([], targetPeerId)
      }
    }
  }, [
    peerRoom,
    setPeerList,
    sendTypingStatusChange,
    peerRoomRef,
    isDirectMessageRoom,
    shellSetMessageLog,
    targetPeerId,
  ])

  useEffect(() => {
    setPassword(password)

    return () => {
      setPassword(undefined)
    }
  }, [password, setPassword])

  useEffect(() => {
    if (isDirectMessageRoom) {
      return
    }

    setRoomId(roomId)
    
    // 公共房间直接添加到历史（无需特殊权限）
    if (!isPrivate) {
      ;(async () => {
        const { addRoomToHistory } = await import('services/RoomHistory')
        addRoomToHistory(roomId)
      })()
    }

    return () => {
      setRoomId(undefined)
    }
  }, [roomId, setRoomId, isDirectMessageRoom, isPrivate])

  useEffect(() => {
    if (isShowingMessages) setUnreadMessages(0)
  }, [isShowingMessages, setUnreadMessages])

  const [sendPeerMetadata] = usePeerAction<UserMetadata>({
    namespace,
    peerAction: PeerAction.PEER_METADATA,
    peerRoom,
    onReceive: async (
      {
        userId: peerUserId,
        customUsername: peerCustomUsername,
        publicKeyString,
      },
      peerId: string
    ) => {
      const parsedPublicKey = await encryptionService.parseCryptoKeyString(
        publicKeyString,
        AllowedKeyType.PUBLIC
      )

      const peerIndex = peerList.findIndex(peer => peer.peerId === peerId)
      const duplicateUserIndex = peerList.findIndex(peer => peer.userId === peerUserId)

      // 检测跨浏览器重复用户（同一个 userId 但不同 peerId）
      if (duplicateUserIndex !== -1 && peerList[duplicateUserIndex].peerId !== peerId) {
        showAlert(`用户 ${getPeerName(peerUserId)} 已在房间中，拒绝重复登录`, { severity: 'warning' })
        // 拒绝新连接，不添加到 peerList，保留先进入的
        return
      }

      if (peerIndex === -1) {
        const newPeer: Peer = {
          peerId,
          userId: peerUserId,
          publicKey: parsedPublicKey,
          customUsername: peerCustomUsername,
          audioChannelState: {
            [AudioChannelName.MICROPHONE]: AudioState.STOPPED,
            [AudioChannelName.SCREEN_SHARE]: AudioState.STOPPED,
          },
          videoState: VideoState.STOPPED,
          screenShareState: ScreenShareState.NOT_SHARING,
          offeredFileId: null,
          isTypingGroupMessage: false,
          isTypingDirectMessage: false,
          verificationToken: getUuid(),
          encryptedVerificationToken: new ArrayBuffer(0),
          verificationState: PeerVerificationState.VERIFYING,
          verificationTimer: null,
        }

        setPeerList(prev => [...prev, newPeer])
        sendTypingStatusChange({ isTyping }, peerId)
        verifyPeer(newPeer)
      } else {
        const oldUsername =
          peerList[peerIndex].customUsername || getPeerName(peerUserId)
        const newUsername = peerCustomUsername || getPeerName(peerUserId)

        setPeerList(prev => {
          const newPeerList = [...prev]
          const newPeer = {
            ...newPeerList[peerIndex],
            userId: peerUserId,
            customUsername: peerCustomUsername,
          }
          newPeerList[peerIndex] = newPeer

          return newPeerList
        })

        if (oldUsername !== newUsername) {
          showAlert(`${oldUsername} is now ${newUsername}`)
        }
      }
    },
  })

  const [sendMessageTranscript] = usePeerAction<
    Array<ReceivedMessage | ReceivedInlineMedia>
  >({
    namespace,
    peerAction: PeerAction.MESSAGE_TRANSCRIPT,
    peerRoom,
    onReceive: transcript => {
      if (messageLog.length) return

      setMessageLog(transcript)
    },
  })

  const handlePeerMessage = useCallback(async (message: UnsentMessage, peerId: string) => {
    if (isDirectMessageRoom && peerId !== targetPeerId) {
      return
    }

    const userSettings = settingsContext.getUserSettings()

    // 解密消息内容
    let displayText = message.text
    if (isPrivate) {
      if (contentKeyRef.current) {
        try {
          displayText = await decryptMessageContent(contentKeyRef.current, message.text)
        } catch (error) {
          console.error('[handlePeerMessage] 解密失败:', error)
          displayText = '[🔒 解密失败]'
        }
      } else {
        // 检查是否有邀请码正在验证
        const storedInviteKey = sessionStorage.getItem(`invite_key_${roomId}`)
        if (storedInviteKey) {
          console.log('[handlePeerMessage] 正在验证邀请码...')
          displayText = '[🔒 正在验证...]'
        } else {
          console.log('[handlePeerMessage] contentKey 为空，无法解密')
          displayText = '[🔒 加密消息 - 需要验证]'
        }
      }
    }

    if (!isShowingMessages) {
      setUnreadMessages(prev => prev + 1)
    }

    if (!tabHasFocus || !isShowingMessages) {
      if (userSettings.playSoundOnNewMessage) {
        newMessageAudio.play()
      }

      if (userSettings.showNotificationOnNewMessage) {
        const displayUsername = getDisplayUsername(message.authorId)
        const notificationText = displayText.startsWith('[🔒') ? '发送了加密消息' : displayText
        notification.showNotification(`${displayUsername}: ${notificationText}`)
      }
    }

    const newMessage = { ...message, text: displayText, timeReceived: timeService.now() }
    const currentLog = isDirectMessageRoom 
      ? (shellMessageLog.directMessageLog?.[targetPeerId] ?? []) 
      : (Array.isArray(shellMessageLog.groupMessageLog) ? shellMessageLog.groupMessageLog : [])
    
    setMessageLog([...currentLog, newMessage])
    
    updatePeer(peerId, { isTypingGroupMessage: false })
  }, [isDirectMessageRoom, targetPeerId, isPrivate, isShowingMessages, tabHasFocus, newMessageAudio, getDisplayUsername, updatePeer, settingsContext, timeService, shellSetMessageLog])

  const [sendPeerMessage] = usePeerAction<UnsentMessage>({
    namespace,
    peerAction: PeerAction.MESSAGE,
    peerRoom,
    onReceive: handlePeerMessage,
  })
  
  // 同时监听私聊消息（即使在群聊中）
  const [sendDirectMessage] = usePeerAction<UnsentMessage>({
    namespace: ActionNamespace.DIRECT_MESSAGE,
    peerAction: PeerAction.MESSAGE,
    peerRoom,
    onReceive: async (message, peerId) => {
      // 如果当前就在私聊窗口，不重复处理
      if (isDirectMessageRoom) {
        return
      }
      
      // 检查消息是否已处理过
      if (processedDirectMessageIds.current.has(message.id)) {
        console.log('[私聊消息] 已处理，忽略:', message.id)
        return
      }
      
      processedDirectMessageIds.current.add(message.id)
      console.log('[私聊消息] 收到:', { message, peerId })
      
      const userSettings = settingsContext.getUserSettings()
      const displayUsername = getDisplayUsername(message.authorId)
      
      // 显示通知
      if (userSettings.showNotificationOnNewMessage) {
        notification.showNotification(`[私聊] ${displayUsername}: ${message.text}`)
      }
      
      if (userSettings.playSoundOnNewMessage) {
        newMessageAudio.play()
      }
      
      // 保存到私聊消息记录
      const currentLog = shellMessageLog.directMessageLog?.[peerId] ?? []
      const newMessage = { ...message, timeReceived: timeService.now() }
      shellSetMessageLog([...currentLog, newMessage], peerId)
      
      showAlert(`收到 ${displayUsername} 的私聊消息`, { severity: 'info' })
    },
  })

  const [sendPeerInlineMedia] = usePeerAction<UnsentInlineMedia>({
    namespace,
    peerAction: PeerAction.MEDIA_MESSAGE,
    peerRoom,
    onReceive: inlineMedia => {
      const userSettings = settingsContext.getUserSettings()

      if (!tabHasFocus) {
        if (userSettings.playSoundOnNewMessage) {
          newMessageAudio.play()
        }

        if (userSettings.showNotificationOnNewMessage) {
          notification.showNotification(
            `${getDisplayUsername(inlineMedia.authorId)} shared media`
          )
        }
      }

      setMessageLog([
        ...messageLog,
        { ...inlineMedia, timeReceived: timeService.now() },
      ])
    },
  })

  // P2P 验证消息
  const [sendJoinRequest] = usePeerAction<JoinRequest>({
    namespace,
    peerAction: PeerAction.JOIN_REQUEST,
    peerRoom,
    onReceive: async (request, peerId) => {
      receiveMessage(request, peerId, {
        onJoinRequest: async (joinRequest, fromPeerId) => {
          console.log('[JOIN_REQUEST] 收到验证请求:', { joinRequest, fromPeerId, isRoomCreator, hasGroupClaim: !!groupClaim })
          
          if (!groupClaim) {
            console.log('[JOIN_REQUEST] 没有 GroupClaim，忽略')
            return
          }
          
          // 查找邀请码记录
          const record = groupClaim.keyset.find(k => k.hash === joinRequest.hashKi)
          if (!record) {
            await sendJoinResp({
              type: 'JOIN_RESPONSE',
              result: 'DENY',
              reason: 'INVALID_KEY'
            }, sendJoinResponse, fromPeerId)
            return
          }
          
          if (record.status !== 'ACTIVE') {
            await sendJoinResp({
              type: 'JOIN_RESPONSE',
              result: 'DENY',
              reason: `KEY_${record.status}`
            }, sendJoinResponse, fromPeerId)
            return
          }
          
          if (new Date(record.expiration).getTime() < Date.now()) {
            await sendJoinResp({
              type: 'JOIN_RESPONSE',
              result: 'DENY',
              reason: 'KEY_EXPIRED'
            }, sendJoinResponse, fromPeerId)
            return
          }
          
          // 只有管理员才能更新 GroupClaim
          if (isRoomCreator && creatorPrivateKey) {
            console.log('[JOIN_REQUEST] 管理员更新 GroupClaim，标记为已使用')
            const updatedKeyset = groupClaim.keyset.map(k => 
              k.hash === joinRequest.hashKi 
                ? { ...k, status: 'USED' as const, usedBy: joinRequest.userId }
                : k
            )
            
            const updatedGroupClaim: GroupClaim = {
              ...groupClaim,
              version: groupClaim.version + 1,
              timestamp: new Date().toISOString(),
              keyset: updatedKeyset,
              signature: ''
            }
            
            updatedGroupClaim.signature = await signAuthorityPackage(updatedGroupClaim, creatorPrivateKey)
            setGroupClaim(updatedGroupClaim)
            
            // 广播更新的 GroupClaim
            await sendGroupClaim(updatedGroupClaim, sendGroupClaimAction)
          }
          
          // 发送成功响应
          await sendJoinResp({
            type: 'JOIN_RESPONSE',
            result: 'ALLOW',
            encryptedContentKey: record.encryptedContentKey,
            groupClaim: groupClaim
          }, sendJoinResponse, fromPeerId)
        }
      })
    },
  })

  const [sendJoinResponse] = usePeerAction<JoinResponse>({
    namespace,
    peerAction: PeerAction.JOIN_RESPONSE,
    peerRoom,
    onReceive: async (response, peerId) => {
      receiveMessage(response, peerId, {
        onJoinResponse: async (joinResponse, fromPeerId) => {
          console.log('[JOIN_RESPONSE] 收到验证响应:', { joinResponse, fromPeerId })
          
          if (joinResponse.result === 'DENY') {
            console.log('[JOIN_RESPONSE] 验证被拒绝:', joinResponse.reason)
            sessionStorage.removeItem(`invite_key_${roomId}`)
            showAlert(`验证失败: ${joinResponse.reason || '无效的邀请密钥'}`, { severity: 'error' })
            return
          }

          if (joinResponse.encryptedContentKey && joinResponse.groupClaim) {
            const storedInviteKey = sessionStorage.getItem(`invite_key_${roomId}`)
            if (!storedInviteKey) return

            try {
              const decryptedContentKey = await decryptContentKeyWithKi(
                joinResponse.encryptedContentKey,
                storedInviteKey
              )
              setContentKey(decryptedContentKey)
              setGroupClaim(joinResponse.groupClaim)
              
              // 保存验证信息到本地
              const inviteKeyHash = await sha256(storedInviteKey)
              await saveVerifiedUser(roomId, userId, decryptedContentKey, inviteKeyHash)
              

              
              // 存储临时信息，等待管理员上线时发送
              const tempInfo = {
                hashKi: inviteKeyHash,
                usedBy: userId,
                timestamp: new Date().toISOString(),
                roomId
              }
              localStorage.setItem(`chitchatter_temp_status_${roomId}_${inviteKeyHash}`, JSON.stringify(tempInfo))
              
              sessionStorage.removeItem(`invite_key_${roomId}`)
              showAlert('验证成功！', { severity: 'success' })
              
              // 立即检测管理员是否在线
              checkAndNotifyAdmin(roomId, tempInfo)
              
            } catch (error) {
              showAlert('密钥错误', { severity: 'error' })
            }
          }
        }
      })
    },
  })

  // GroupClaim 广播和处理
  const [sendGroupClaimAction] = usePeerAction<GroupClaim>({
    namespace,
    peerAction: PeerAction.GROUP_CLAIM,
    peerRoom,
    onReceive: async (receivedGroupClaim, peerId) => {
      receiveMessage(receivedGroupClaim, peerId, {
        onGroupClaim: async (groupClaimData, fromPeerId) => {
          console.log('[GROUP_CLAIM] 收到:', {
            isRoomCreator,
            hasMyGroupClaim: !!groupClaim,
            myVersion: groupClaim?.version,
            receivedVersion: groupClaimData.version,
            myCreatorId: groupClaim?.creatorId,
            receivedCreatorId: groupClaimData.creatorId,
            fromPeerId
          })
          
          // 验证 roomId
          if (groupClaimData.roomId !== roomId) {
            console.warn('[GROUP_CLAIM] 忽略不同房间的消息')
            return
          }
          
          // 清除竞争状态
          if (waitingForGroupClaim) {
            setWaitingForGroupClaim(false)
            if (competitionTimer) {
              clearTimeout(competitionTimer)
              setCompetitionTimer(null)
            }
          }
          
          // 如果我是管理员且有本地 GroupClaim
          if (isRoomCreator && groupClaim) {
            if (groupClaimData.creatorId === groupClaim.creatorId) {
              // 同一创建者，比较版本
              if (groupClaimData.version > groupClaim.version) {
                setGroupClaim(groupClaimData)
                console.log('[GROUP_CLAIM] 更新到更新版本')
              }
            } else {
              // 不同创建者，比较创建时间
              const myCreatedTime = new Date(groupClaim.createdAt).getTime()
              const receivedCreatedTime = new Date(groupClaimData.createdAt).getTime()
              
              if (receivedCreatedTime < myCreatedTime) {
                console.log('[GROUP_CLAIM] 对方更早，主动降级')
                
                // 彻底清除管理员身份和数据
                setIsRoomCreator(false)
                setCreatorPrivateKey(null)
                setContentKey(null)
                setGroupClaim(groupClaimData)
                
                // 清除所有本地存储的相关数据
                sessionStorage.removeItem(`chitchatter_session_creator_${roomId}`)
                localStorage.removeItem(`chitchatter_creator_${roomId}`)
                localStorage.removeItem(`chitchatter_room_password_${roomId}`)
                localStorage.removeItem(`chitchatter_groupclaim_${roomId}`)
                
                // 清除用户验证信息（如果存在）
                localStorage.removeItem(`chitchatter_verified_${roomId}_${userId}`)
                localStorage.removeItem(`chitchatter_invite_hash_${roomId}_${userId}`)
                
                // 清除临时状态信息
                const tempKeys = Object.keys(localStorage).filter(key => 
                  key.startsWith(`chitchatter_temp_status_${roomId}_`)
                )
                tempKeys.forEach(key => localStorage.removeItem(key))
                
                // 清除邀请码历史记录
                localStorage.removeItem('chitchatter_invite_history')
                localStorage.removeItem('chitchatter_save_invite_history')
                
                // 从房间历史中移除该房间（因为现在是群外人）
                ;(async () => {
                  try {
                    const { removeRoomFromHistory } = await import('services/RoomHistory')
                    removeRoomFromHistory(roomId)
                    console.log('[GROUP_CLAIM] 已从房间历史中移除')
                  } catch (error) {
                    console.error('[GROUP_CLAIM] 移除房间历史失败:', error)
                  }
                })()
                
                console.log('[GROUP_CLAIM] 已清除所有本地数据，成为群外新人')
                console.log('[GROUP_CLAIM] 降级操作完成，即将跳转到主页')
                
                // 立即检查主页isCreator状态
                const { isCreator } = await import('services/Authority')
                console.log('[GROUP_CLAIM] 主页isCreator状态:', isCreator(roomId))
                
                // 立即停止当前组件的所有操作
                setIsInitializing(false)
                showAlert('检测到更早的管理员，已降级为群外新人', { severity: 'warning' })
                
                // 立即跳转到主页，避免继续操作
                setTimeout(() => {
                  window.location.href = '/'
                }, 500)
              }
            }
            return
          }
          
          // 非管理员或无本地 GroupClaim
          if (!groupClaim) {
            // 本地无数据，保存接收到的
            setGroupClaim(groupClaimData)
            console.log('[GROUP_CLAIM] 保存接收到的 GroupClaim')
          } else {
            // 本地有数据，比较更新
            if (groupClaimData.creatorId === groupClaim.creatorId) {
              if (groupClaimData.version > groupClaim.version) {
                setGroupClaim(groupClaimData)
                console.log('[GROUP_CLAIM] 更新到更新版本')
              }
            } else {
              const myCreatedTime = new Date(groupClaim.createdAt).getTime()
              const receivedCreatedTime = new Date(groupClaimData.createdAt).getTime()
              
              if (receivedCreatedTime < myCreatedTime) {
                setGroupClaim(groupClaimData)
                console.log('[GROUP_CLAIM] 替换为更早的 GroupClaim')
                
                // 如果当前用户曾经是管理员但现在不是，清除相关数据
                const wasCreator = sessionStorage.getItem(`chitchatter_session_creator_${roomId}`) === 'true'
                if (wasCreator && groupClaimData.creatorId !== userId) {
                  console.log('[GROUP_CLAIM] 检测到管理员身份变更，清除本地数据')
                  sessionStorage.removeItem(`chitchatter_session_creator_${roomId}`)
                  localStorage.removeItem(`chitchatter_creator_${roomId}`)
                  localStorage.removeItem(`chitchatter_room_password_${roomId}`)
                  
                  // 从房间历史中移除
                  ;(async () => {
                    try {
                      const { removeRoomFromHistory } = await import('services/RoomHistory')
                      removeRoomFromHistory(roomId)
                    } catch (error) {
                      console.error('[GROUP_CLAIM] 移除房间历史失败:', error)
                    }
                  })()
                }
              }
            }
          }
          
          // 检查是否被吊销
          if (!isRoomCreator && contentKey) {
            const storedHash = localStorage.getItem(`chitchatter_invite_hash_${roomId}_${userId}`)
            if (storedHash) {
              const record = groupClaimData.keyset.find(k => k.hash === storedHash)
              if (record && record.status === 'REVOKED') {
                setContentKey(null)
                showAlert('你的访问权限已被吊销', { severity: 'error' })
              }
            }
          }
        }
      })
    },
  })
  
  // 管理员检测和状态更新
  const [sendStatusNotification] = usePeerAction<StatusUpdateNotification>({
    namespace,
    peerAction: PeerAction.STATUS_NOTIFY,
    peerRoom,
    onReceive: async (notification, peerId) => {
      if (!isRoomCreator || !creatorPrivateKey || !groupClaim) return
      
      console.log('[管理员] 收到状态更新通知:', notification)
      
      // 更新GroupClaim
      const updatedKeyset = groupClaim.keyset.map(k => 
        k.hash === notification.hashKi 
          ? { ...k, status: notification.newStatus, usedBy: notification.usedBy }
          : k
      )
      
      const updatedGroupClaim: GroupClaim = {
        ...groupClaim,
        version: groupClaim.version + 1,
        timestamp: new Date().toISOString(),
        keyset: updatedKeyset,
        signature: ''
      }
      
      updatedGroupClaim.signature = await signAuthorityPackage(updatedGroupClaim, creatorPrivateKey)
      setGroupClaim(updatedGroupClaim)
      localStorage.setItem(`chitchatter_groupclaim_${roomId}`, JSON.stringify(updatedGroupClaim))
      
      // 广播更新的GroupClaim
      await sendGroupClaim(updatedGroupClaim, sendGroupClaimAction)
      
      // 发送确认
      const ack: StatusUpdateAck = {
        type: 'STATUS_UPDATE_ACK',
        hashKi: notification.hashKi,
        timestamp: new Date().toISOString()
      }
      await sendStatusAck(ack, peerId)
    },
  })
  
  const [sendStatusAck] = usePeerAction<StatusUpdateAck>({
    namespace,
    peerAction: PeerAction.STATUS_ACK,
    peerRoom,
    onReceive: async (ack, peerId) => {
      console.log('[用户] 收到管理员确认:', ack)
      // 删除临时信息
      localStorage.removeItem(`chitchatter_temp_status_${roomId}_${ack.hashKi}`)
    },
  })
  
  const [sendAdminPing] = usePeerAction<AdminPing>({
    namespace,
    peerAction: PeerAction.ADMIN_PING,
    peerRoom,
    onReceive: async (ping, peerId) => {
      if (!isRoomCreator) return
      
      const pong: AdminPong = {
        type: 'ADMIN_PONG',
        roomId: ping.roomId,
        timestamp: new Date().toISOString()
      }
      await sendAdminPong(pong, peerId)
    },
  })
  
  const [sendAdminPong] = usePeerAction<AdminPong>({
    namespace,
    peerAction: PeerAction.ADMIN_PONG,
    peerRoom,
    onReceive: async (pong, peerId) => {
      console.log('[用户] 管理员在线，发送临时信息')
      sendPendingStatusUpdates(roomId, peerId)
    },
  })
  
  // 检测管理员并发送临时信息
  const checkAndNotifyAdmin = async (roomId: string, tempInfo: any) => {
    const ping: AdminPing = {
      type: 'ADMIN_PING',
      roomId,
      timestamp: new Date().toISOString()
    }
    
    // 广播 ping
    for (const peer of peerList) {
      await sendAdminPing(ping, peer.peerId)
    }
  }
  
  // 发送待处理的状态更新
  const sendPendingStatusUpdates = async (roomId: string, adminPeerId: string) => {
    const keys = Object.keys(localStorage)
    const tempKeys = keys.filter(key => key.startsWith(`chitchatter_temp_status_${roomId}_`))
    
    for (const key of tempKeys) {
      try {
        const tempInfo = JSON.parse(localStorage.getItem(key) || '{}')
        const notification: StatusUpdateNotification = {
          type: 'STATUS_UPDATE_NOTIFICATION',
          hashKi: tempInfo.hashKi,
          newStatus: 'USED',
          usedBy: tempInfo.usedBy,
          timestamp: tempInfo.timestamp
        }
        
        await sendStatusNotification(notification, adminPeerId)
      } catch (error) {
        console.error('发送临时信息失败:', error)
      }
    }
  }
  
  // 更新 ref
  useEffect(() => {
    sendGroupClaimRef.current = sendGroupClaimAction
  }, [sendGroupClaimAction])
  
  // 管理员上线时检查临时信息
  useEffect(() => {
    if (!isPrivate) return
    
    const checkPendingUpdates = () => {
      if (!isRoomCreator) {
        // 普通用户检测管理员
        checkAndNotifyAdmin(roomId, {})
      }
    }
    
    // 延迟检查，等待连接建立
    const timer = setTimeout(checkPendingUpdates, 2000)
    return () => clearTimeout(timer)
  }, [isPrivate, isRoomCreator, roomId, peerList.length])

  const { privateKey } = settingsContext.getUserSettings()

  const { verifyPeer } = usePeerVerification({
    peerRoom,
    privateKey,
    encryptionService,
    isDirectMessageRoom,
  })

  const sendMessage = async (message: string) => {
    if (isMessageSending) return

    // 权限控制：检查是否可以发送消息
    if (isPrivate && !canSendMessage(contentKey)) {
      showAlert('需要验证才能发送消息', { severity: 'error' })
      return
    }

    // 加密消息内容（如果是私有房间且有 contentKey）
    let messageText = message
    if (isPrivate && contentKey) {
      try {
        messageText = await encryptMessageContent(contentKey, message)
      } catch (error) {
        console.error('消息加密失败:', error)
        showAlert('消息加密失败', { severity: 'error' })
        return
      }
    }

    const unsentMessage: UnsentMessage = {
      authorId: userId,
      text: messageText,
      timeSent: timeService.now(),
      id: getUuid(),
    }

    setIsTyping(false)
    setIsMessageSending(true)

    // 本地显示明文
    const localMessage = { ...unsentMessage, text: message, timeReceived: timeService.now() }
    setMessageLog([...messageLog, localMessage])

    await sendPeerMessage(unsentMessage, targetPeerId)

    setIsMessageSending(false)
  }

  if (!isDirectMessageRoom) {
    peerRoom.onPeerJoin(PeerHookType.NEW_PEER, (peerId: string) => {
      showAlert(`Someone has joined the room`, {
        severity: 'success',
      })
      ;(async () => {
        try {
          const publicKeyString =
            await encryptionService.stringifyCryptoKey(publicKey)

          const promises: Promise<any>[] = [
            sendPeerMetadata(
              { userId, customUsername, publicKeyString },
              peerId
            ),
          ]

          if (!isPrivate) {
            promises.push(
              sendMessageTranscript(
                messageLog.filter(isMessageReceived),
                peerId
              )
            )
          }

          await Promise.all(promises)

          // 私有房间：如果我有 GroupClaim，发送给新 peer
          if (isPrivate && groupClaim) {
            console.log('[onPeerJoin] 发送 GroupClaim 给新 peer:', {
              roomId: groupClaim.roomId?.substring(0, 8) + '...',
              creatorId: groupClaim.creatorId?.substring(0, 8) + '...',
              version: groupClaim.version
            })
            await sendGroupClaim(groupClaim, sendGroupClaimAction, peerId)
          }

          // 私有房间：新用户需要验证
          if (isPrivate && !isRoomCreator && !contentKey) {
            const storedInviteKey = sessionStorage.getItem(`invite_key_${roomId}`)
            console.log('[onPeerJoin] 检查验证:', { isPrivate, isRoomCreator, contentKey, storedInviteKey })
            
            if (!storedInviteKey) {
              console.log('[onPeerJoin] 没有邀请码，弹窗输入')
              const inviteKey = prompt('请输入邀请密钥：')
              if (inviteKey) {
                sessionStorage.setItem(`invite_key_${roomId}`, inviteKey)
                const hashKi = await sha256(inviteKey)
                const joinRequest: JoinRequest = {
                  type: 'JOIN_REQUEST',
                  hashKi,
                  userId
                }
                
                console.log('[onPeerJoin] 发送验证请求到新peer:', { hashKi: hashKi.substring(0, 16) + '...', userId: userId.substring(0, 8) + '...', peerId: peerId.substring(0, 8) + '...' })
                await sendJoinReq(joinRequest, sendJoinRequest, peerId)
                
                // 向所有已连接的其他peer也发送验证请求
                for (const peer of peerList) {
                  if (peer.peerId !== peerId) {
                    console.log('[onPeerJoin] 发送验证请求到已有peer:', { targetPeerId: peer.peerId.substring(0, 8) + '...' })
                    await sendJoinReq(joinRequest, sendJoinRequest, peer.peerId)
                  }
                }
              }
            } else {
              const hashKi = await sha256(storedInviteKey)
              const joinRequest: JoinRequest = {
                type: 'JOIN_REQUEST',
                hashKi,
                userId
              }
              console.log('[onPeerJoin] 使用已存储的邀请码发送验证请求')
              await sendJoinReq(joinRequest, sendJoinRequest, peerId)
            }
          } else {
            console.log('[onPeerJoin] 跳过验证:', { isPrivate, isRoomCreator, hasContentKey: !!contentKey })
          }

        } catch (e) {
          console.error(e)
        }
      })()
    })

    peerRoom.onPeerLeave(PeerHookType.NEW_PEER, (peerId: string) => {
      const peerIndex = peerList.findIndex(peer => peer.peerId === peerId)
      const doesPeerExist = peerIndex !== -1

      showAlert(
        `${
          doesPeerExist
            ? getDisplayUsername(peerList[peerIndex].userId)
            : 'Someone'
        } has left the room`,
        {
          severity: 'warning',
        }
      )

      if (doesPeerExist) {
        setPeerList(prev => {
          const peerListClone = [...prev]
          peerListClone.splice(peerIndex, 1)

          return peerListClone
        })
      }
    })
  }

  const showVideoDisplay = Boolean(
    selfVideoStream ||
      selfScreenStream ||
      Object.values({ ...peerVideoStreams, ...peerScreenStreams }).length > 0
  )

  if (!showVideoDisplay && !isShowingMessages) setIsShowingMessages(true)

  const handleInlineMediaUpload = async (files: File[]) => {
    const fileOfferId = await fileTransferService.fileTransfer.offer(
      files,
      roomId
    )

    const unsentInlineMedia: UnsentInlineMedia = {
      authorId: userId,
      magnetURI: fileOfferId,
      timeSent: timeService.now(),
      id: getUuid(),
    }

    setIsMessageSending(true)
    setMessageLog([...messageLog, unsentInlineMedia])

    await sendPeerInlineMedia(unsentInlineMedia)

    setMessageLog([
      ...messageLog,
      { ...unsentInlineMedia, timeReceived: timeService.now() },
    ])
    setIsMessageSending(false)
  }

  const handleMessageChange = () => {
    if (isTyping) {
      setIsTypingDebounced(true)
    } else {
      setIsTyping(true)
    }

    // This queues up the expiration of the typing state. It is effectively
    // cancelled once this message change handler is called again.
    setIsTypingDebounced(false)
  }

  useEffect(() => {
    ;(async () => {
      if (isDirectMessageRoom) return

      const publicKeyString =
        await encryptionService.stringifyCryptoKey(publicKey)

      sendPeerMetadata({
        customUsername,
        userId,
        publicKeyString,
      })
    })()
  }, [
    customUsername,
    userId,
    sendPeerMetadata,
    publicKey,
    encryptionService,
    isDirectMessageRoom,
  ])

  useEffect(() => {
    ;(async () => {
      setPeerConnectionTypes(await peerRoom.getPeerConnectionTypes())
    })()
  }, [peerList, peerRoom, setPeerConnectionTypes])

  // 初始化权限控制系统
  useEffect(() => {
    if (!isPrivate) {
      setIsInitializing(false)
      return
    }

    ;(async () => {
      try {
        // 保存到房间历史（只有在成功初始化后才添加）
        // 这里不添加，等待初始化成功后再添加
        
        // 确保房间密码已保存到sessionStorage用于加密存储
        if (password && !sessionStorage.getItem(`chitchatter_room_password_${roomId}`)) {
          sessionStorage.setItem(`chitchatter_room_password_${roomId}`, password)
        }
        
        // 1. 检查是否是管理员，尝试恢复管理员身份
        // 只有在数据完整的情况下才尝试恢复
        const hasCreatorData = localStorage.getItem(`chitchatter_creator_${roomId}`) !== null
        const hasPassword = localStorage.getItem(`chitchatter_room_password_${roomId}`) !== null
        const hasGroupClaim = localStorage.getItem(`chitchatter_groupclaim_${roomId}`) !== null
        
        if (hasCreatorData && hasPassword && hasGroupClaim) {
          const isCreator = await checkIsRoomCreator(roomId, userId)
          if (isCreator) {
            // 确保房间密码已保存到sessionStorage
            if (!sessionStorage.getItem(`chitchatter_room_password_${roomId}`) && password) {
              sessionStorage.setItem(`chitchatter_room_password_${roomId}`, password)
            }
            
            const restored = await restoreCreatorIdentity(roomId, userId)
            if (restored) {
              setContentKey(restored.contentKey)
              setCreatorPrivateKey(restored.privateKey)
              setIsRoomCreator(true)
              
              // 恢复GroupClaim
              const storedGroupClaim = localStorage.getItem(`chitchatter_groupclaim_${roomId}`)
              if (storedGroupClaim) {
                try {
                  const parsedGroupClaim = JSON.parse(storedGroupClaim)
                  setGroupClaim(parsedGroupClaim)
                  console.log('[管理员恢复] GroupClaim已恢复:', parsedGroupClaim.version)
                } catch (error) {
                  console.error('[管理员恢复] GroupClaim恢复失败:', error)
                }
              }
              
              showAlert('管理员身份已恢复', { severity: 'success' })
              setIsInitializing(false)
              return
            } else {
              console.warn('[管理员恢复] 恢复失败，可能是密码问题')
            }
          }
        } else {
          console.log('[初始化] 管理员数据不完整，跳过恢复')
        }
        
        // 2. 检查普通用户验证信息
        const verifiedContentKey = await loadVerifiedUser(roomId, userId)
        if (verifiedContentKey) {
          setContentKey(verifiedContentKey)
          
          // 尝试恢复已存在的GroupClaim
          const storedGroupClaim = localStorage.getItem(`chitchatter_groupclaim_${roomId}`)
          if (storedGroupClaim) {
            try {
              const parsedGroupClaim = JSON.parse(storedGroupClaim)
              setGroupClaim(parsedGroupClaim)
              console.log('[用户恢复] GroupClaim已恢复:', parsedGroupClaim.version)
            } catch (error) {
              console.error('[用户恢复] GroupClaim恢复失败:', error)
            }
          }
          
          showAlert('欢迎回来！已自动登录', { severity: 'success' })
        }
      } catch (error) {
        console.error('初始化权限系统失败:', error)
      } finally {
        setIsInitializing(false)
      }
    })()
  }, [roomId, password, isPrivate, userId, showAlert])

  // 10秒竞争机制 - 只在初始化时执行一次
  useEffect(() => {
    if (!isPrivate) return

    let competitionStarted = false
    
    const startCompetition = async () => {
      // 防止重复启动
      if (competitionStarted) return
      
      // 检查是否已经是管理员
      const isCreator = await checkIsRoomCreator(roomId, userId)
      if (isCreator) {
        console.log('[竞争] 已是管理员，跳过竞争')
        return
      }
      
      // 检查是否已有验证信息
      const hasVerified = await loadVerifiedUser(roomId, userId)
      if (hasVerified) {
        console.log('[竞争] 已验证用户，跳过竞争')
        return
      }
      
      // 检查是否有邀请码
      const storedInviteKey = sessionStorage.getItem(`invite_key_${roomId}`)
      if (storedInviteKey) {
        console.log('[竞争] 已有邀请码，跳过竞争')
        return
      }
      
      competitionStarted = true
      console.log('[竞争] 开始 10 秒竞争期')
      setWaitingForGroupClaim(true)
      
      const timer = setTimeout(async () => {
        // 再次检查状态，防止在等待期间状态改变
        if (isRoomCreator || contentKey || groupClaim) {
          console.log('[竞争] 状态已改变，取消成为管理员')
          setWaitingForGroupClaim(false)
          return
        }
        
        console.log('[竞争] 10 秒内无 GroupClaim，成为管理员')
        
        try {
          // 创建 GroupClaim
          const { groupClaim: newGroupClaim, contentKey: contentKeyObj, privateKey } = await createGroupClaim(roomId, userId)
          
          setGroupClaim(newGroupClaim)
          setContentKey(contentKeyObj)
          setCreatorPrivateKey(privateKey)
          setIsRoomCreator(true)
          setWaitingForGroupClaim(false)
          
          // 保存到本地
          sessionStorage.setItem(`chitchatter_session_creator_${roomId}`, 'true')
          
          // 保存GroupClaim到localStorage
          localStorage.setItem(`chitchatter_groupclaim_${roomId}`, JSON.stringify(newGroupClaim))
          
          // 广播 GroupClaim
          await sendGroupClaim(newGroupClaim, sendGroupClaimAction)
          
          showAlert('你是房间管理员', { severity: 'success' })
        } catch (error) {
          console.error('[竞争] 创建管理员失败:', error)
          setWaitingForGroupClaim(false)
        }
      }, 10000)
      
      setCompetitionTimer(timer)
    }
    
    // 延迟启动竞争，给管理员恢复时间
    const initTimer = setTimeout(startCompetition, 100)
    
    return () => {
      clearTimeout(initTimer)
      if (competitionTimer) {
        clearTimeout(competitionTimer)
        setCompetitionTimer(null)
      }
    }
  }, [roomId, isPrivate]) // 只依赖 roomId 和 isPrivate

  return {
    isDirectMessageRoom,
    isPrivate,
    handleInlineMediaUpload,
    handleMessageChange,
    isMessageSending,
    messageLog,
    peerRoom,
    roomContextValue,
    sendMessage,
    showVideoDisplay,
  }
}
