import { FileOfferMetadata } from 'models/chat'
import { AuthorityPackage } from 'models/authority'
import { createContext, Dispatch, SetStateAction } from 'react'
import { FileTransferService } from 'services/FileTransfer'

export interface RoomContextProps {
  isPrivate: boolean
  isMessageSending: boolean
  isShowingMessages: boolean
  setIsShowingMessages: Dispatch<SetStateAction<boolean>>
  unreadMessages: number
  selfVideoStream: MediaStream | null
  setSelfVideoStream: Dispatch<SetStateAction<MediaStream | null>>
  peerVideoStreams: Record<string, MediaStream>
  setPeerVideoStreams: Dispatch<SetStateAction<Record<string, MediaStream>>>
  selfScreenStream: MediaStream | null
  setSelfScreenStream: Dispatch<SetStateAction<MediaStream | null>>
  peerScreenStreams: Record<string, MediaStream>
  setPeerScreenStreams: Dispatch<SetStateAction<Record<string, MediaStream>>>
  peerOfferedFileMetadata: Record<string, FileOfferMetadata>
  setPeerOfferedFileMetadata: Dispatch<
    SetStateAction<Record<string, FileOfferMetadata>>
  >
  fileTransferService: FileTransferService
  
  // 🆕 权限控制相关
  authorityPackage: AuthorityPackage | null
  setAuthorityPackage: Dispatch<SetStateAction<AuthorityPackage | null>>
  contentKey: CryptoKey | null
  setContentKey: Dispatch<SetStateAction<CryptoKey | null>>
  isRoomCreator: boolean
  setIsRoomCreator: Dispatch<SetStateAction<boolean>>
  creatorPublicKey: CryptoKey | null
  setCreatorPublicKey: Dispatch<SetStateAction<CryptoKey | null>>
  creatorPrivateKey: CryptoKey | null
  setCreatorPrivateKey: Dispatch<SetStateAction<CryptoKey | null>>
  broadcastAuthorityPackage: (pkg: AuthorityPackage) => void
}

export const RoomContext = createContext<RoomContextProps>({
  isPrivate: false,
  isMessageSending: false,
  isShowingMessages: true,
  setIsShowingMessages: () => {},
  unreadMessages: 0,
  selfVideoStream: null,
  setSelfVideoStream: () => {},
  peerVideoStreams: {},
  setPeerVideoStreams: () => {},
  selfScreenStream: null,
  setSelfScreenStream: () => {},
  peerScreenStreams: {},
  setPeerScreenStreams: () => {},
  peerOfferedFileMetadata: {},
  setPeerOfferedFileMetadata: () => {},
  fileTransferService: new FileTransferService({}),
  
  // 🆕 权限控制默认值
  authorityPackage: null,
  setAuthorityPackage: () => {},
  contentKey: null,
  setContentKey: () => {},
  isRoomCreator: false,
  setIsRoomCreator: () => {},
  creatorPublicKey: null,
  setCreatorPublicKey: () => {},
  creatorPrivateKey: null,
  setCreatorPrivateKey: () => {},
  broadcastAuthorityPackage: () => {},
})
