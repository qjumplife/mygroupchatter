import { useState } from 'react'
import {
  generateEd25519KeyPair,
  generateContentKey,
  sha256,
  generateInviteKey,
  encryptContentKey,
  decryptContentKey,
  encryptMessage,
  decryptMessage,
  exportKey,
  signAuthorityPackage,
  verifyAuthorityPackage,
} from 'services/Encryption'

export const DebugEncryption = () => {
  const [log, setLog] = useState<string[]>([])
  const [testResult, setTestResult] = useState<'idle' | 'running' | 'success' | 'error'>('idle')

  const addLog = (message: string) => {
    setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`])
  }

  const runTests = async () => {
    setLog([])
    setTestResult('running')
    
    try {
      addLog('🚀 开始测试加密工具...')
      
      addLog('📝 测试 1: 生成 Ed25519 密钥对')
      const keypair = await generateEd25519KeyPair()
      addLog(`✅ 公钥类型: ${keypair.publicKey.type}`)
      addLog(`✅ 私钥类型: ${keypair.privateKey.type}`)
      
      addLog('📝 测试 2: 生成 Content Key')
      const contentKey = await generateContentKey()
      addLog(`✅ Content Key 类型: ${contentKey.type}`)
      
      addLog('📝 测试 3: 生成邀请密钥')
      const Ki = generateInviteKey()
      addLog(`✅ 邀请密钥: ${Ki}`)
      
      addLog('📝 测试 4: 计算 SHA-256 哈希')
      const hash = await sha256(Ki)
      addLog(`✅ 哈希值: ${hash.substring(0, 20)}...`)
      
      addLog('📝 测试 5: 用 Ki 加密 Content Key')
      const encrypted = await encryptContentKey(contentKey, Ki)
      addLog(`✅ IV: ${encrypted.iv.substring(0, 20)}...`)
      addLog(`✅ 密文: ${encrypted.ciphertext.substring(0, 20)}...`)
      
      addLog('📝 测试 6: 用 Ki 解密 Content Key')
      const decrypted = await decryptContentKey(encrypted, Ki)
      const originalExported = await exportKey(contentKey)
      const decryptedExported = await exportKey(decrypted)
      const match = originalExported === decryptedExported
      addLog(`✅ 解密成功: ${match}`)
      
      if (!match) throw new Error('Content Key 解密失败')
      
      addLog('📝 测试 7: 用 Content Key 加密消息')
      const message = 'Hello, Chitchatter!'
      const encryptedMsg = await encryptMessage(contentKey, message)
      addLog(`✅ 消息密文: ${encryptedMsg.ciphertext.substring(0, 20)}...`)
      
      addLog('📝 测试 8: 用 Content Key 解密消息')
      const decryptedMsg = await decryptMessage(contentKey, encryptedMsg)
      addLog(`✅ 解密消息: ${decryptedMsg}`)
      
      if (decryptedMsg !== message) throw new Error('消息解密失败')
      
      addLog('📝 测试 9: 签名 Authority Package')
      const L = {
        version: 1,
        timestamp: new Date().toISOString(),
        keyset: [{
          hash,
          expiration: new Date(Date.now() + 86400000).toISOString(),
          status: 'ACTIVE' as const,
          usedBy: null,
          createdAt: new Date().toISOString(),
          encryptedContentKey: encrypted,
        }],
      }
      const signature = await signAuthorityPackage(L, keypair.privateKey)
      addLog(`✅ 签名: ${signature.substring(0, 20)}...`)
      
      addLog('📝 测试 10: 验证 Authority Package 签名')
      const valid = await verifyAuthorityPackage({ ...L, signature }, keypair.publicKey)
      addLog(`✅ 签名有效: ${valid}`)
      
      if (!valid) throw new Error('签名验证失败')
      
      addLog('🎉 所有测试通过！')
      setTestResult('success')
      
    } catch (error) {
      addLog(`❌ 测试失败: ${error}`)
      setTestResult('error')
    }
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h2>🔐 加密工具调试面板</h2>
      
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
          <li>✅ Ed25519 密钥对生成</li>
          <li>✅ Content Key 生成</li>
          <li>✅ 邀请密钥生成（格式：XXXX-XXXX-XXXX-XXXX）</li>
          <li>✅ SHA-256 哈希计算</li>
          <li>✅ Content Key 加密/解密（用 Ki）</li>
          <li>✅ 消息加密/解密（用 Content Key）</li>
          <li>✅ Authority Package 签名/验证</li>
        </ul>
      </div>
    </div>
  )
}
