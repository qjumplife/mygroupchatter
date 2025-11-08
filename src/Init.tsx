import { lazy, Suspense, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { v4 as uuid } from 'uuid'

import { encryption } from 'services/Encryption'
import {
  EnvironmentUnsupportedDialog,
  isEnvironmentSupported,
} from 'components/Shell/EnvironmentUnsupportedDialog'
import { WholePageLoading } from 'components/Loading/Loading'
import { ColorMode, UserSettings } from 'models/settings'

import { DEFAULT_SOUND } from 'config/soundNames'

import type { BootstrapProps } from './Bootstrap'

const Bootstrap = lazy(() => import('./Bootstrap'))

export interface InitProps extends Omit<BootstrapProps, 'initialUserSettings'> {
  getUuid?: typeof uuid
}

// NOTE: This is meant to be a thin layer around the Bootstrap component that
// only handles asynchronous creation of the public/private keys that Bootstrap
// requires.
const Init = ({ getUuid = uuid, ...props }: InitProps) => {
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      if (userSettings !== null) return

      try {
        const { publicKey, privateKey } = await encryption.generateKeyPair()
        
        // 使用公钥指纹作为 userId（唯一且不可伪造）
        const publicKeyString = await encryption.stringifyCryptoKey(publicKey)
        const { sha256 } = await import('services/Encryption')
        const publicKeyHash = await sha256(publicKeyString)
        const userId = publicKeyHash.substring(0, 16) // 取前16位作为 userId

        setUserSettings({
          userId,
          customUsername: '',
          colorMode: ColorMode.DARK,
          playSoundOnNewMessage: true,
          showNotificationOnNewMessage: true,
          showActiveTypingStatus: true,
          isEnhancedConnectivityEnabled: true,
          publicKey,
          privateKey,
          selectedSound: DEFAULT_SOUND,
        })
      } catch (e) {
        console.error(e)
        setErrorMessage(
          'Chitchatter was unable to boot up. Please check the browser console.'
        )
      }
    })()
  }, [getUuid, userSettings])

  if (!isEnvironmentSupported) {
    return <EnvironmentUnsupportedDialog />
  }

  if (errorMessage) {
    return (
      <Box
        sx={{
          display: 'flex',
          height: '100vh',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Typography>{errorMessage}</Typography>
      </Box>
    )
  }

  if (userSettings === null) {
    return <WholePageLoading />
  }

  return (
    <Suspense fallback={<WholePageLoading />}>
      <Bootstrap {...props} initialUserSettings={userSettings} />
    </Suspense>
  )
}

export default Init
