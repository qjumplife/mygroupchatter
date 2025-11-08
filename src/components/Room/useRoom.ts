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
import { createRoomAuthority, isCreator, restoreCreatorAuthority, createCreatorClaim, verifyCreatorClaim, compareCreatorClaims, saveVerifiedUser, loadVerifiedUser } from 'services/Authority'
import { encryptMessageContent, decryptMessageContent, canSendMessage } from 'services/Authority/MessageEncryption'
import { verifyInviteKey, markKeyAsUsed, decryptContentKeyWithKi } from 'services/Authority/Verification'
import { signAuthorityPackage, sha256 } from 'services/Encryption'
import { AuthorityPackage, CreatorClaim } from 'models/authority'
import { JoinRequestMessage, JoinResponseMessage } from 'services/Serialization'

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
  const [authorityPackage, setAuthorityPackage] = useState<AuthorityPackage | null>(null)
  const [contentKey, setContentKey] = useState<CryptoKey | null>(null)
  const [isRoomCreator, setIsRoomCreator] = useState(false)
  const [creatorPublicKey, setCreatorPublicKey] = useState<CryptoKey | null>(null)
  const [creatorPrivateKey, setCreatorPrivateKey] = useState<CryptoKey | null>(null)
  const [myCreatorClaim, setMyCreatorClaim] = useState<CreatorClaim | null>(null)
  const [winningClaim, setWinningClaim] = useState<CreatorClaim | null>(null)
  const winningClaimRef = useRef<CreatorClaim | null>(null)
  const myClaimRef = useRef<CreatorClaim | null>(null)
  const contentKeyRef = useRef<CryptoKey | null>(null)
  const sendAuthorityPackageRef = useRef<((pkg: AuthorityPackage) => void) | null>(null)
  const processedDirectMessageIds = useRef<Set<string>>(new Set())
  
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
      authorityPackage,
      setAuthorityPackage,
      contentKey,
      setContentKey,
      isRoomCreator,
      setIsRoomCreator,
      creatorPublicKey,
      setCreatorPublicKey,
      creatorPrivateKey,
      setCreatorPrivateKey,
      broadcastAuthorityPackage: (pkg: AuthorityPackage) => {
        console.log('[broadcastAuthorityPackage] 广播 AuthorityPackage:', pkg)
        if (sendAuthorityPackageRef.current) {
          sendAuthorityPackageRef.current(pkg)
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
      authorityPackage,
      setAuthorityPackage,
      contentKey,
      setContentKey,
      isRoomCreator,
      setIsRoomCreator,
      creatorPublicKey,
      setCreatorPublicKey,
      creatorPrivateKey,
      setCreatorPrivateKey,
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
    
    // 保存公共房间到历史
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
  const [sendJoinRequest] = usePeerAction<JoinRequestMessage>({
    namespace,
    peerAction: PeerAction.JOIN_REQUEST,
    peerRoom,
    onReceive: async (request, peerId) => {
      console.log('[JOIN_REQUEST] 收到验证请求:', { request, peerId, isRoomCreator, hasAuthorityPackage: !!authorityPackage })
      
      // 只要有 authorityPackage 就可以验证，不仅限于管理员
      if (!authorityPackage) {
        console.log('[JOIN_REQUEST] 没有 authorityPackage，忽略')
        return
      }
      
      // 只有管理员才能更新 authorityPackage（标记为已使用）
      const canUpdatePackage = isRoomCreator && creatorPrivateKey

      console.log('[JOIN_REQUEST] 开始验证邀请码:', request.hashKi)
      const result = await verifyInviteKey(
        request.hashKi,
        authorityPackage,
        creatorPublicKey || undefined
      )
      console.log('[JOIN_REQUEST] 验证结果:', result)

      if (!result.success) {
        console.log('[JOIN_REQUEST] 验证失败，发送 DENY')
        await sendJoinResponse(
          {
            type: 'JOIN_RESPONSE',
            result: 'DENY',
            reason: result.reason,
          },
          peerId
        )
        return
      }

      // 只有管理员才更新 authorityPackage
      if (canUpdatePackage) {
        console.log('[JOIN_REQUEST] 管理员更新 AuthorityPackage，使用者 userId:', request.userId)
        const updatedL = markKeyAsUsed(authorityPackage, request.hashKi, request.userId)
        const signature = await signAuthorityPackage(updatedL, creatorPrivateKey!)
        const newAuthorityPackage = { ...updatedL, signature }
        setAuthorityPackage(newAuthorityPackage)
        sendAuthorityPackage(newAuthorityPackage)
      } else {
        console.log('[JOIN_REQUEST] 非管理员，不更新 AuthorityPackage')
      }

      console.log('[JOIN_REQUEST] 发送 ALLOW 响应:', result.record!.encryptedContentKey)
      await sendJoinResponse(
        {
          type: 'JOIN_RESPONSE',
          result: 'ALLOW',
          encryptedContentKey: result.record!.encryptedContentKey,
        },
        peerId
      )
      console.log('[JOIN_REQUEST] 响应已发送')
    },
  })

  const [sendJoinResponse] = usePeerAction<JoinResponseMessage>({
    namespace,
    peerAction: PeerAction.JOIN_RESPONSE,
    peerRoom,
    onReceive: async (response, peerId) => {
      console.log('[JOIN_RESPONSE] 收到验证响应:', { response, peerId })
      if (response.result === 'DENY') {
        console.log('[JOIN_RESPONSE] 验证被拒绝:', response.reason)
        sessionStorage.removeItem(`invite_key_${roomId}`)
        showAlert(`验证失败: ${response.reason || '无效的邀请密钥'}`, { severity: 'error' })
        return
      }

      if (response.encryptedContentKey) {
        const storedInviteKey = sessionStorage.getItem(`invite_key_${roomId}`)
        if (!storedInviteKey) return

        try {
          const decryptedContentKey = await decryptContentKeyWithKi(
            response.encryptedContentKey,
            storedInviteKey
          )
          setContentKey(decryptedContentKey)
          
          // 保存验证信息到本地
          const inviteKeyHash = await sha256(storedInviteKey)
          await saveVerifiedUser(roomId, userId, decryptedContentKey, inviteKeyHash)
          
          // 保存邀请码哈希（用于后续验证吊销）
          localStorage.setItem(`chitchatter_invite_hash_${roomId}_${userId}`, inviteKeyHash)
          
          sessionStorage.removeItem(`invite_key_${roomId}`)
          showAlert('验证成功！', { severity: 'success' })
          
          // 3秒后提示刷新
          setTimeout(() => {
            if (window.confirm('验证成功！是否刷新页面以查看完整消息？')) {
              window.location.reload()
            }
          }, 1000)
        } catch (error) {
          showAlert('密钥错误', { severity: 'error' })
        }
      }
    },
  })

  // 创建者声明广播和共识
  const [sendCreatorClaim] = usePeerAction<CreatorClaim>({
    namespace,
    peerAction: PeerAction.CREATOR_CLAIM,
    peerRoom,
    onReceive: async (claim, peerId) => {
      const isValid = await verifyCreatorClaim(claim)
      if (!isValid) return

      // 如果我是管理员，忽略所有声明（管理员不能被降级）
      if (isRoomCreator) {
        return
      }

      const currentWinner = winningClaimRef.current || myClaimRef.current
      if (!currentWinner) {
        winningClaimRef.current = claim
        setWinningClaim(claim)
        return
      }

      const winner = compareCreatorClaims(currentWinner, claim)
      winningClaimRef.current = winner
      setWinningClaim(winner)
    },
  })

  // AuthorityPackage 广播（邀请码列表）
  const [sendAuthorityPackage, , authorityPackageProgress] = usePeerAction<AuthorityPackage>({
    namespace,
    peerAction: PeerAction.AUTHORITY_PACKAGE,
    peerRoom,
    onReceive: async (receivedPackage, peerId) => {
      console.log('[AuthorityPackage] 收到:', {
        isRoomCreator,
        hasMyPackage: !!authorityPackage,
        myTimestamp: authorityPackage?.timestamp,
        receivedTimestamp: receivedPackage.timestamp,
        peerId
      })

      // 如果我是管理员
      if (isRoomCreator && authorityPackage) {
        // 检查是不是自己的包
        if (receivedPackage.creatorId === authorityPackage.creatorId) {
          // 是自己的包，检查版本号，只接受更新的
          if (receivedPackage.version > authorityPackage.version) {
            console.log('[AuthorityPackage] 接收自己的更新包')
            setAuthorityPackage(receivedPackage)
            if (password) {
              const { encryptWithPassword } = await import('services/Encryption')
              const encrypted = await encryptWithPassword(
                JSON.stringify(receivedPackage),
                password,
                `authority-${roomId}`
              )
              localStorage.setItem(`chitchatter_authority_${roomId}`, encrypted)
            }
          }
          return
        }
        
        // 不是自己的包，比较 createdAt
        const myCreatedTime = new Date(authorityPackage.createdAt || authorityPackage.timestamp).getTime()
        const receivedCreatedTime = new Date(receivedPackage.createdAt || receivedPackage.timestamp).getTime()
        
        if (receivedCreatedTime < myCreatedTime) {
          console.log('[降级] 对方更早，主动降级')
          setIsRoomCreator(false)
          setCreatorPrivateKey(null)
          setContentKey(null)
          myClaimRef.current = null
          setMyCreatorClaim(null)
          localStorage.removeItem(`chitchatter_creator_${roomId}`)
          localStorage.removeItem(`chitchatter_authority_${roomId}`)
          sessionStorage.removeItem(`chitchatter_session_creator_${roomId}`)
          showAlert('检测到更早的管理员，退出房间', { severity: 'error' })
          setTimeout(() => {
            peerRoom.leaveRoom()
            window.location.href = window.location.pathname
          }, 1500)
          return
        }
        console.log('[AuthorityPackage] 我更早，丢弃对方的包')
        return
      }

      // 收到 AuthorityPackage 说明已有管理员
      // 如果我正在竞争，立即放弃
      if (myClaimRef.current) {
        myClaimRef.current = null
        setMyCreatorClaim(null)
      }

      if (creatorPublicKey) {
        const { verifyAuthorityPackage } = await import('services/Encryption')
        const isValid = await verifyAuthorityPackage(receivedPackage, creatorPublicKey)
        if (!isValid) return
      }

      if (authorityPackage) {
        // 如果是同一个管理员的包，检查版本号
        if (receivedPackage.creatorId === authorityPackage.creatorId) {
          if (receivedPackage.version <= authorityPackage.version) return
        } else {
          // 不同管理员，比较 createdAt，只接受更早的
          const myCreatedTime = new Date(authorityPackage.createdAt || authorityPackage.timestamp).getTime()
          const receivedCreatedTime = new Date(receivedPackage.createdAt || receivedPackage.timestamp).getTime()
          if (receivedCreatedTime >= myCreatedTime) return
        }
      }

      setAuthorityPackage(receivedPackage)
      // 持久化 authorityPackage（加密）
      if (password) {
        const { encryptWithPassword } = await import('services/Encryption')
        const encrypted = await encryptWithPassword(
          JSON.stringify(receivedPackage),
          password,
          `authority-${roomId}`
        )
        localStorage.setItem(`chitchatter_authority_${roomId}`, encrypted)
      } else {
        localStorage.setItem(`chitchatter_authority_${roomId}`, JSON.stringify(receivedPackage))
      }

      // 检查是否被吊销
      if (!isRoomCreator && contentKey) {
        const storedHash = localStorage.getItem(`chitchatter_invite_hash_${roomId}_${userId}`)
        if (storedHash) {
          const record = receivedPackage.keyset.find(k => k.hash === storedHash)
          if (record && record.status === 'REVOKED') {
            setContentKey(null)
            localStorage.removeItem(`chitchatter_verified_${roomId}_${userId}`)
            localStorage.removeItem(`chitchatter_invite_hash_${roomId}_${userId}`)
            showAlert('你的访问权限已被吊销', { severity: 'error' })
          }
        }
      }
    },
  })
  
  // 更新 ref
  useEffect(() => {
    sendAuthorityPackageRef.current = sendAuthorityPackage
  }, [sendAuthorityPackage])

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

          // 私有房间：如果我有 AuthorityPackage，主动发送给新 peer（管理员或普通成员）
          if (isPrivate && authorityPackage) {
            console.log('[onPeerJoin] 发送 AuthorityPackage 给新 peer')
            sendAuthorityPackage(authorityPackage)
            if (isRoomCreator && myClaimRef.current) {
              sendCreatorClaim(myClaimRef.current)
            }
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
                console.log('[onPeerJoin] 发送验证请求:', { hashKi, userId })
                await sendJoinRequest(
                  {
                    type: 'JOIN_REQUEST',
                    hashKi,
                    peerId: userId,
                    userId,
                  },
                  peerId
                )
              }
            } else {
              const hashKi = await sha256(storedInviteKey)
              console.log('[onPeerJoin] 使用已存储的邀请码发送验证请求:', { hashKi, userId })
              await sendJoinRequest(
                {
                  type: 'JOIN_REQUEST',
                  hashKi,
                  peerId: userId,
                  userId,
                },
                peerId
              )
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
    if (!isPrivate) return

    ;(async () => {
      try {
        // 保存密码到 sessionStorage（用于加密 localStorage 数据）
        if (password) {
          sessionStorage.setItem(`chitchatter_room_password_${roomId}`, password)
        }
        
        // 保存到房间历史
        const { addRoomToHistory } = await import('services/RoomHistory')
        addRoomToHistory(roomId, password)
        
        // 检查当前标签页是否已经是管理员
        const sessionCreator = sessionStorage.getItem(`chitchatter_session_creator_${roomId}`)
        
        // 1. 检查本地是否有创建者信息且当前标签页是管理员
        if (sessionCreator === 'true' && isCreator(roomId)) {
          const restored = await restoreCreatorAuthority(roomId, password!)
          if (restored && restored.contentKey) {
            setContentKey(restored.contentKey)
            setCreatorPublicKey(restored.publicKey)
            setCreatorPrivateKey(restored.privateKey)
            setIsRoomCreator(true)
            
            const claim = await createCreatorClaim(1, userId, restored.publicKey, restored.privateKey)
            myClaimRef.current = claim
            setMyCreatorClaim(claim)
            
            // 恢复或创建 authorityPackage
            const storedAuthority = localStorage.getItem(`chitchatter_authority_${roomId}`)
            let authorityPkg: AuthorityPackage
            if (storedAuthority) {
              try {
                const { decryptWithPassword } = await import('services/Encryption')
                const decrypted = await decryptWithPassword(storedAuthority, password!, `authority-${roomId}`)
                authorityPkg = JSON.parse(decrypted)
              } catch {
                authorityPkg = JSON.parse(storedAuthority)
              }
            } else {
              const now = new Date().toISOString()
              authorityPkg = {
                version: 1,
                timestamp: now,
                createdAt: now,
                creatorId: userId,
                keyset: [],
                signature: '',
              }
            }
            // 确保旧数据有 createdAt 和 creatorId
            if (!authorityPkg.createdAt) {
              authorityPkg.createdAt = authorityPkg.timestamp
            }
            if (!authorityPkg.creatorId) {
              authorityPkg.creatorId = userId
            }
            setAuthorityPackage(authorityPkg)
            sendAuthorityPackage(authorityPkg)
            sendCreatorClaim(claim)
            // 更新房间历史
            const { addRoomToHistory } = await import('services/RoomHistory')
            addRoomToHistory(roomId, password)
            return
          }
        }

        // 2. 检查本地是否有验证过的用户信息
        const verifiedContentKey = await loadVerifiedUser(roomId, userId)
        if (verifiedContentKey) {
          setContentKey(verifiedContentKey)
          // 恢复 authorityPackage，普通成员也要广播
          const storedAuthority = localStorage.getItem(`chitchatter_authority_${roomId}`)
          if (storedAuthority && password) {
            try {
              const { decryptWithPassword } = await import('services/Encryption')
              const decrypted = await decryptWithPassword(storedAuthority, password, `authority-${roomId}`)
              const authorityPkg = JSON.parse(decrypted)
              setAuthorityPackage(authorityPkg)
              sendAuthorityPackage(authorityPkg)
            } catch {
              const authorityPkg = JSON.parse(storedAuthority)
              setAuthorityPackage(authorityPkg)
              sendAuthorityPackage(authorityPkg)
            }
          }
          showAlert('欢迎回来！已自动登录', { severity: 'success' })
          return
        }

        // 3. 无本地信息，等待 5 秒看是否有管理员
      } catch (error) {
        console.error('初始化权限系统失败:', error)
      }
    })()
  }, [roomId, password, isPrivate, userId, showAlert, sendAuthorityPackage, sendCreatorClaim])

  // 创建者竞争：无本地信息时等待 5 秒
  useEffect(() => {
    if (!isPrivate || contentKey || myCreatorClaim || isRoomCreator) return

    const storedInviteKey = sessionStorage.getItem(`invite_key_${roomId}`)
    if (storedInviteKey) return

    // 检查是否有本地创建者或验证信息
    ;(async () => {
      const hasCreator = isCreator(roomId)
      const hasVerified = await loadVerifiedUser(roomId, userId)
      
      // 有本地信息则不竞争
      if (hasCreator || hasVerified) return

      // 无本地信息，等待 5 秒接收 AuthorityPackage
      const authority = await createRoomAuthority(roomId, password!, userId)
      myClaimRef.current = authority.claim
      setMyCreatorClaim(authority.claim)
      sendCreatorClaim(authority.claim)

      setTimeout(() => {
        // 如果收到了 AuthorityPackage，说明已有管理员，不成为管理员
        if (authorityPackage && authorityPackage.keyset !== undefined) {
          myClaimRef.current = null
          setMyCreatorClaim(null)
          showAlert('房间已有管理员，需要邀请码才能加入', { severity: 'info' })
          return
        }

        // 如果被其他声明击败
        if (!myClaimRef.current) {
          showAlert('房间已有管理员，需要邀请码才能加入', { severity: 'info' })
          return
        }

        // 5 秒内没收到任何信息，成为管理员
        const finalWinner = winningClaimRef.current || authority.claim
        if (finalWinner.claimHash === authority.claim.claimHash) {
          setAuthorityPackage(authority.authorityPackage)
          setContentKey(authority.contentKey)
          setCreatorPublicKey(authority.publicKey)
          setCreatorPrivateKey(authority.privateKey)
          setIsRoomCreator(true)
          // 标记当前标签页为管理员
          sessionStorage.setItem(`chitchatter_session_creator_${roomId}`, 'true')
          // 更新房间历史
          ;(async () => {
            const { addRoomToHistory } = await import('services/RoomHistory')
            addRoomToHistory(roomId, password)
          })()
          // 持久化 authorityPackage（加密）
          ;(async () => {
            if (password) {
              const { encryptWithPassword } = await import('services/Encryption')
              const encrypted = await encryptWithPassword(
                JSON.stringify(authority.authorityPackage),
                password,
                `authority-${roomId}`
              )
              localStorage.setItem(`chitchatter_authority_${roomId}`, encrypted)
            }
          })()
          sendAuthorityPackage(authority.authorityPackage)
          showAlert('你是房间管理员', { severity: 'success' })
        } else {
          showAlert('房间已有管理员，需要邀请码才能加入', { severity: 'info' })
        }
      }, 5000)
    })()
  }, [isPrivate, contentKey, myCreatorClaim, isRoomCreator, roomId, password, userId, sendCreatorClaim, authorityPackage, sendAuthorityPackage, showAlert])

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
