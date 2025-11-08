import { ColorMode, UserSettings } from 'models/settings'
import { AllowedKeyType, encryption } from 'services/Encryption'

export interface SerializedUserSettings
  extends Omit<UserSettings, 'publicKey' | 'privateKey'> {
  publicKey: string
  privateKey: string
}

export const isSerializedUserSettings = (
  data: any
): data is SerializedUserSettings => {
  return (
    typeof data === 'object' &&
    data !== null &&
    'colorMode' in data &&
    Object.values(ColorMode).includes(data.colorMode) &&
    'userId' in data &&
    typeof data.userId === 'string' &&
    'customUsername' in data &&
    typeof data.customUsername === 'string' &&
    'playSoundOnNewMessage' in data &&
    typeof data.playSoundOnNewMessage === 'boolean' &&
    'showNotificationOnNewMessage' in data &&
    typeof data.showNotificationOnNewMessage === 'boolean' &&
    'showActiveTypingStatus' in data &&
    typeof data.showActiveTypingStatus === 'boolean' &&
    'isEnhancedConnectivityEnabled' in data &&
    typeof data.isEnhancedConnectivityEnabled === 'boolean' &&
    'publicKey' in data &&
    typeof data.publicKey === 'string' &&
    'privateKey' in data &&
    typeof data.privateKey === 'string'
  )
}

export class SerializationService {
  serializeUserSettings = async (
    userSettings: UserSettings
  ): Promise<SerializedUserSettings> => {
    const {
      publicKey: publicCryptoKey,
      privateKey: privateCryptoKey,
      ...userSettingsRest
    } = userSettings

    const publicKey = await encryption.stringifyCryptoKey(publicCryptoKey)

    const privateKey = await encryption.stringifyCryptoKey(privateCryptoKey)

    return {
      ...userSettingsRest,
      publicKey,
      privateKey,
    }
  }

  deserializeUserSettings = async (
    serializedUserSettings: SerializedUserSettings
  ): Promise<UserSettings> => {
    const {
      publicKey: publicCryptoKeyString,
      privateKey: privateCryptoKeyString,
      ...userSettingsForIndexedDbRest
    } = serializedUserSettings

    const publicKey = await encryption.parseCryptoKeyString(
      publicCryptoKeyString,
      AllowedKeyType.PUBLIC
    )
    const privateKey = await encryption.parseCryptoKeyString(
      privateCryptoKeyString,
      AllowedKeyType.PRIVATE
    )

    return {
      ...userSettingsForIndexedDbRest,
      publicKey,
      privateKey,
    }
  }
}

export const serialization = new SerializationService()

// ============ 权限控制消息类型 ============

import { AuthorityPackage, EncryptedData } from 'models/authority'

/**
 * 加入验证请求
 */
export interface JoinRequestMessage {
  type: 'JOIN_REQUEST'
  hashKi: string
  peerId: string
}

/**
 * 加入验证响应
 */
export interface JoinResponseMessage {
  type: 'JOIN_RESPONSE'
  result: 'ALLOW' | 'DENY'
  reason?: string
  encryptedContentKey?: EncryptedData
}

/**
 * L 同步请求
 */
export interface HelloSyncMessage {
  type: 'HELLO_SYNC'
  version_local: number
  timestamp_local: string
  peerId: string
}

/**
 * L 同步状态响应
 */
export interface SyncStatusMessage {
  type: 'SYNC_STATUS'
  version_remote: number
  timestamp_remote: string
}

/**
 * 请求完整 L
 */
export interface GetLMessage {
  type: 'GET_L'
  want_version: number
}

/**
 * 返回完整 L
 */
export interface LDataMessage {
  type: 'L_DATA'
  L: AuthorityPackage
}

/**
 * 本地更新通知
 */
export interface LocalUpdateMessage {
  type: 'LOCAL_UPDATE'
  update: {
    hash: string
    status: 'USED' | 'REVOKED' | 'EXPIRED'
    usedBy: string | null
  }
}

export type AuthorityMessage =
  | JoinRequestMessage
  | JoinResponseMessage
  | HelloSyncMessage
  | SyncStatusMessage
  | GetLMessage
  | LDataMessage
  | LocalUpdateMessage
