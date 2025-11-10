import { useState } from 'react'
import {
  createRoomAuthority,
  loadCreatorInfo,
  restoreCreatorAuthority,
  isCreator,
} from 'services/Authority'
import { verifyAuthorityPackage } from 'services/Encryption'

export const DebugAuthority = () => {
  const [log, setLog] = useState<string[]>([])
  const [testResult, setTestResult] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [roomId] = useState(`test-room-${Date.now()}`)
  const [password] = useState('test-password-123')
  const [userId] = useState(`test-user-${Date.now()}`)

  const addLog = (message: string) => {
    setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`])
  }

  const runTests = async () => {
    setLog([])
    setTestResult('running')
    
    try {
      addLog('🚀 开始测试房间创建...')
      addLog(`📝 房间 ID: ${roomId}`)
      addLog(`📝 密码: ${password}`)
      addLog(`📝 用户 ID: ${userId}`)
      
      // 测试 1: 创建房间
      addLog('📝 测试 1: 创建房间并初始化权限系统')
      const created = await createRoomAuthority(roomId, password, userId)
      addLog(`✅ Authority Package version: ${created.authorityPackage.version}`)
      addLog(`✅ Keyset 长度: ${created.authorityPackage.keyset.length}`)
      addLog(`✅ Content Key 类型: ${created.contentKey.type}`)
      addLog(`✅ 公钥类型: ${created.publicKey.type}`)
      addLog(`✅ 私钥类型: ${created.privateKey.type}`)
      
      // 测试 2: 验证签名
      addLog('📝 测试 2: 验证 Authority Package 签名')
      const valid = await verifyAuthorityPackage(created.authorityPackage, created.publicKey)
      addLog(`✅ 签名有效: ${valid}`)
      
      if (!valid) throw new Error('签名验证失败')
      
      // 测试 3: 检查 localStorage
      addLog('📝 测试 3: 检查 CreatorInfo 是否保存到 localStorage')
      const storageKey = `chitchatter_creator_${roomId}`
      const stored = localStorage.getItem(storageKey)
      addLog(`✅ localStorage 存在: ${stored !== null}`)
      
      if (!stored) throw new Error('CreatorInfo 未保存')
      
      // 测试 4: 检查创建者身份
      addLog('📝 测试 4: 检查是否识别为创建者')
      const isCreatorResult = isCreator(roomId)
      addLog(`✅ 是创建者: ${isCreatorResult}`)
      
      if (!isCreatorResult) throw new Error('未识别为创建者')
      
      // 测试 5: 加载 CreatorInfo
      addLog('📝 测试 5: 从 localStorage 加载 CreatorInfo')
      const loaded = await loadCreatorInfo(roomId, password)
      addLog(`✅ 加载成功: ${loaded !== null}`)
      addLog(`✅ 房间 ID: ${loaded?.roomId}`)
      addLog(`✅ 角色: ${loaded?.role}`)
      
      if (!loaded) throw new Error('加载 CreatorInfo 失败')
      
      // 测试 6: 错误密码
      addLog('📝 测试 6: 使用错误密码加载（应该失败）')
      const wrongPassword = await loadCreatorInfo(roomId, 'wrong-password')
      addLog(`✅ 错误密码返回 null: ${wrongPassword === null}`)
      
      if (wrongPassword !== null) throw new Error('错误密码应该返回 null')
      
      // 测试 7: 恢复权限
      addLog('📝 测试 7: 恢复创建者权限')
      const restored = await restoreCreatorAuthority(roomId, password)
      addLog(`✅ 恢复成功: ${restored !== null}`)
      addLog(`✅ Content Key 恢复: ${restored?.contentKey !== null}`)
      addLog(`✅ 公钥恢复: ${restored?.publicKey !== null}`)
      addLog(`✅ 私钥恢复: ${restored?.privateKey !== null}`)
      
      if (!restored) throw new Error('恢复权限失败')
      
      // 测试 8: 验证恢复的密钥可用
      addLog('📝 测试 8: 验证恢复的 Content Key 可用')
      const testMessage = 'Hello, Chitchatter!'
      const iv = window.crypto.getRandomValues(new Uint8Array(12))
      const encoded = new TextEncoder().encode(testMessage)
      
      const encrypted = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        restored.contentKey!,
        encoded
      )
      
      const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        restored.contentKey!,
        encrypted
      )
      
      const decryptedMessage = new TextDecoder().decode(decrypted)
      addLog(`✅ 加密/解密成功: ${decryptedMessage === testMessage}`)
      
      if (decryptedMessage !== testMessage) throw new Error('加密/解密失败')
      
      // 测试 9: 清理
      addLog('📝 测试 9: 清理 localStorage')
      localStorage.removeItem(storageKey)
      const cleanedIsCreator = isCreator(roomId)
      addLog(`✅ 清理后不再是创建者: ${!cleanedIsCreator}`)
      
      addLog('🎉 所有测试通过！')
      setTestResult('success')
      
    } catch (error) {
      addLog(`❌ 测试失败: ${error}`)
      setTestResult('error')
    }
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h2>🏠 房间创建调试面板</h2>
      
      <button
        onClick={runTests}
        disabled={testResult === 'running'}
        style={{
          padding: '10px 20px',
          fontSize: '16px',
          cursor: testResult === 'running' ? 'not-allowed' : 'pointer',
          backgroundColor: testResult === 'success' ? '#4caf50' : testResult === 'error' ? '#f44336' : '#2196f3',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          marginBottom: '20px',
        }}
      >
        {testResult === 'running' ? '测试中...' : testResult === 'success' ? '✅ 测试通过' : testResult === 'error' ? '❌ 测试失败' : '运行测试'}
      </button>
      
      <div style={{
        backgroundColor: '#1e1e1e',
        color: '#d4d4d4',
        padding: '15px',
        borderRadius: '4px',
        maxHeight: '500px',
        overflowY: 'auto',
        fontSize: '14px',
        lineHeight: '1.6',
      }}>
        {log.length === 0 ? (
          <div style={{ color: '#888' }}>点击"运行测试"开始...</div>
        ) : (
          log.map((line, index) => <div key={index}>{line}</div>)
        )}
      </div>
      
      <div style={{ marginTop: '20px', fontSize: '14px', color: '#666' }}>
        <h3>验证点：</h3>
        <ul>
          <li>✅ 创建房间时生成 Ed25519 密钥对</li>
          <li>✅ 创建房间时生成 Content Key</li>
          <li>✅ 初始化空的 L（version=1）</li>
          <li>✅ L 签名有效</li>
          <li>✅ CreatorInfo 加密存储到 localStorage</li>
          <li>✅ 识别为房间创建者</li>
          <li>✅ 可以加载 CreatorInfo</li>
          <li>✅ 错误密码无法加载</li>
          <li>✅ 可以恢复创建者权限</li>
          <li>✅ 恢复的密钥可用</li>
        </ul>
      </div>
    </div>
  )
}
