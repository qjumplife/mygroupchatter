import { renderHook, act } from '@testing-library/react'
import { createElement } from 'react'
import { vi } from 'vitest'
import { useInvitationKeys } from './useInvitationKeys'
import { RoomContext } from 'contexts/RoomContext'
import { createRoomAuthority } from 'services/Authority'
import { verifyAuthorityPackage } from 'services/Encryption'

const createWrapper = (contextValue: any) => {
  return ({ children }: { children: any }) =>
    createElement(RoomContext.Provider, { value: contextValue }, children)
}

describe('useInvitationKeys Hook 测试', () => {
  let roomAuthority: Awaited<ReturnType<typeof createRoomAuthority>>

  beforeEach(async () => {
    roomAuthority = await createRoomAuthority('test-room', 'test-password')
  })

  describe('生成邀请密钥', () => {
    test('应该能生成邀请密钥', async () => {
      const contextValue = {
        authorityPackage: roomAuthority.authorityPackage,
        setAuthorityPackage: vi.fn(),
        contentKey: roomAuthority.contentKey,
        creatorPrivateKey: roomAuthority.privateKey,
        isRoomCreator: true,
        creatorPublicKey: roomAuthority.publicKey,
        isPrivate: false,
        isMessageSending: false,
        isShowingMessages: true,
        setIsShowingMessages: vi.fn(),
        unreadMessages: 0,
        selfVideoStream: null,
        setSelfVideoStream: vi.fn(),
        peerVideoStreams: {},
        setPeerVideoStreams: vi.fn(),
        selfScreenStream: null,
        setSelfScreenStream: vi.fn(),
        peerScreenStreams: {},
        setPeerScreenStreams: vi.fn(),
        peerOfferedFileMetadata: {},
        setPeerOfferedFileMetadata: vi.fn(),
        fileTransferService: {} as any,
        setContentKey: vi.fn(),
        setIsRoomCreator: vi.fn(),
        setCreatorPublicKey: vi.fn(),
        setCreatorPrivateKey: vi.fn(),
      }

      const { result } = renderHook(() => useInvitationKeys(), {
        wrapper: createWrapper(contextValue),
      })

      expect(result.current.isRoomCreator).toBe(true)
      expect(result.current.keys).toHaveLength(0)

      let generatedKey: any

      await act(async () => {
        generatedKey = await result.current.generateKey(24)
      })

      expect(generatedKey).not.toBeNull()
      expect(generatedKey.plaintext).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
      expect(generatedKey.status).toBe('ACTIVE')
      expect(generatedKey.hash).toBeDefined()
      expect(generatedKey.encryptedContentKey).toBeDefined()

      expect(contextValue.setAuthorityPackage).toHaveBeenCalled()
    })

    test('非创建者不能生成密钥', async () => {
      const contextValue = {
        authorityPackage: roomAuthority.authorityPackage,
        setAuthorityPackage: vi.fn(),
        contentKey: roomAuthority.contentKey,
        creatorPrivateKey: roomAuthority.privateKey,
        isRoomCreator: false,
        creatorPublicKey: roomAuthority.publicKey,
        isPrivate: false,
        isMessageSending: false,
        isShowingMessages: true,
        setIsShowingMessages: vi.fn(),
        unreadMessages: 0,
        selfVideoStream: null,
        setSelfVideoStream: vi.fn(),
        peerVideoStreams: {},
        setPeerVideoStreams: vi.fn(),
        selfScreenStream: null,
        setSelfScreenStream: vi.fn(),
        peerScreenStreams: {},
        setPeerScreenStreams: vi.fn(),
        peerOfferedFileMetadata: {},
        setPeerOfferedFileMetadata: vi.fn(),
        fileTransferService: {} as any,
        setContentKey: vi.fn(),
        setIsRoomCreator: vi.fn(),
        setCreatorPublicKey: vi.fn(),
        setCreatorPrivateKey: vi.fn(),
      }

      const { result } = renderHook(() => useInvitationKeys(), {
        wrapper: createWrapper(contextValue),
      })

      let generatedKey: any

      await act(async () => {
        generatedKey = await result.current.generateKey(24)
      })

      expect(generatedKey).toBeNull()
      expect(result.current.error).toContain('只有房间创建者')
    })

    test('生成密钥后 L.version 应该递增', async () => {
      let currentL = roomAuthority.authorityPackage

      const contextValue = {
        authorityPackage: currentL,
        setAuthorityPackage: (newL: any) => {
          currentL = newL
        },
        contentKey: roomAuthority.contentKey,
        creatorPrivateKey: roomAuthority.privateKey,
        isRoomCreator: true,
        creatorPublicKey: roomAuthority.publicKey,
        isPrivate: false,
        isMessageSending: false,
        isShowingMessages: true,
        setIsShowingMessages: vi.fn(),
        unreadMessages: 0,
        selfVideoStream: null,
        setSelfVideoStream: vi.fn(),
        peerVideoStreams: {},
        setPeerVideoStreams: vi.fn(),
        selfScreenStream: null,
        setSelfScreenStream: vi.fn(),
        peerScreenStreams: {},
        setPeerScreenStreams: vi.fn(),
        peerOfferedFileMetadata: {},
        setPeerOfferedFileMetadata: vi.fn(),
        fileTransferService: {} as any,
        setContentKey: vi.fn(),
        setIsRoomCreator: vi.fn(),
        setCreatorPublicKey: vi.fn(),
        setCreatorPrivateKey: vi.fn(),
      }

      const { result, rerender } = renderHook(() => useInvitationKeys(), {
        wrapper: createWrapper(contextValue),
      })

      const initialVersion = result.current.keys.length === 0 ? 1 : currentL.version

      await act(async () => {
        await result.current.generateKey(24)
      })

      rerender()

      expect(currentL.version).toBe(initialVersion + 1)
      expect(currentL.keyset).toHaveLength(1)

      const valid = await verifyAuthorityPackage(currentL, roomAuthority.publicKey)
      expect(valid).toBe(true)
    })
  })

  describe('吊销密钥', () => {
    test('应该能吊销密钥', async () => {
      let currentL = roomAuthority.authorityPackage
      let hash: string

      const getContextValue = () => ({
        authorityPackage: currentL,
        setAuthorityPackage: (newL: any) => {
          currentL = newL
        },
        contentKey: roomAuthority.contentKey,
        creatorPrivateKey: roomAuthority.privateKey,
        isRoomCreator: true,
        creatorPublicKey: roomAuthority.publicKey,
        isPrivate: false,
        isMessageSending: false,
        isShowingMessages: true,
        setIsShowingMessages: vi.fn(),
        unreadMessages: 0,
        selfVideoStream: null,
        setSelfVideoStream: vi.fn(),
        peerVideoStreams: {},
        setPeerVideoStreams: vi.fn(),
        selfScreenStream: null,
        setSelfScreenStream: vi.fn(),
        peerScreenStreams: {},
        setPeerScreenStreams: vi.fn(),
        peerOfferedFileMetadata: {},
        setPeerOfferedFileMetadata: vi.fn(),
        fileTransferService: {} as any,
        setContentKey: vi.fn(),
        setIsRoomCreator: vi.fn(),
        setCreatorPublicKey: vi.fn(),
        setCreatorPrivateKey: vi.fn(),
      })

      const { result, rerender } = renderHook(() => useInvitationKeys(), {
        wrapper: createWrapper(getContextValue()),
      })

      await act(async () => {
        const key = await result.current.generateKey(24)
        hash = key!.hash
      })

      // 重新渲染以获取更新后的 context
      const { result: result2 } = renderHook(() => useInvitationKeys(), {
        wrapper: createWrapper(getContextValue()),
      })

      await act(async () => {
        await result2.current.revokeKey(hash)
      })

      const revokedKey = currentL.keyset.find(k => k.hash === hash)
      expect(revokedKey?.status).toBe('REVOKED')
    })
  })

  describe('清理过期密钥', () => {
    test('应该能清理过期密钥', async () => {
      let currentL = roomAuthority.authorityPackage

      const getContextValue = () => ({
        authorityPackage: currentL,
        setAuthorityPackage: (newL: any) => {
          currentL = newL
        },
        contentKey: roomAuthority.contentKey,
        creatorPrivateKey: roomAuthority.privateKey,
        isRoomCreator: true,
        creatorPublicKey: roomAuthority.publicKey,
        isPrivate: false,
        isMessageSending: false,
        isShowingMessages: true,
        setIsShowingMessages: vi.fn(),
        unreadMessages: 0,
        selfVideoStream: null,
        setSelfVideoStream: vi.fn(),
        peerVideoStreams: {},
        setPeerVideoStreams: vi.fn(),
        selfScreenStream: null,
        setSelfScreenStream: vi.fn(),
        peerScreenStreams: {},
        setPeerScreenStreams: vi.fn(),
        peerOfferedFileMetadata: {},
        setPeerOfferedFileMetadata: vi.fn(),
        fileTransferService: {} as any,
        setContentKey: vi.fn(),
        setIsRoomCreator: vi.fn(),
        setCreatorPublicKey: vi.fn(),
        setCreatorPrivateKey: vi.fn(),
      })

      const { result, rerender } = renderHook(() => useInvitationKeys(), {
        wrapper: createWrapper(getContextValue()),
      })

      await act(async () => {
        await result.current.generateKey(-1)
      })

      // 重新渲染以获取更新后的 context
      const { result: result2 } = renderHook(() => useInvitationKeys(), {
        wrapper: createWrapper(getContextValue()),
      })

      let count: number = 0

      await act(async () => {
        count = await result2.current.cleanupExpiredKeys()
      })

      expect(count).toBe(1)

      const expiredKey = currentL.keyset[0]
      expect(expiredKey.status).toBe('EXPIRED')
    })
  })
})
