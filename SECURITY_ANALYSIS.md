# 浏览器本地存储数据安全分析

## 当前存储的敏感数据

### 1. ✅ **已加密** - 创建者信息 (CreatorInfo)
**存储键**: `chitchatter_creator_${roomId}`

**包含内容**:
- `privateKey`: Ed25519 私钥（用于签名 AuthorityPackage）
- `publicKey`: Ed25519 公钥
- `contentKey`: AES-GCM 密钥（用于消息加密/解密）
- `roomId`, `userId`, `createdAt`, `sequence`, `claimHash`

**加密方式**:
- 使用 AES-GCM 256 位加密
- 密钥派生: PBKDF2 (100,000 次迭代) 从房间密码派生
- Salt: `chitchatter-creator-${roomId}`
- 随机 IV (12 字节)

**安全性**: ✅ 高 - 需要房间密码才能解密

---

### 2. ⚠️ **未加密** - 验证用户信息 (VerifiedUser)
**存储键**: `chitchatter_verified_${roomId}_${userId}`

**包含内容**:
```json
{
  "roomId": "房间ID",
  "userId": "用户ID",
  "contentKey": "导出的 AES-GCM 密钥（JWK 格式）",
  "verifiedAt": 1234567890,
  "inviteKeyHash": "邀请码哈希"
}
```

**风险**: ⚠️ **高风险** - contentKey 以明文 JWK 格式存储
- 任何能访问 localStorage 的脚本都能读取
- 可以解密所有房间消息
- 可以冒充用户发送加密消息

**建议**: 🔒 **需要加密**

---

### 3. ⚠️ **未加密** - 权限包 (AuthorityPackage)
**存储键**: `chitchatter_authority_${roomId}`

**包含内容**:
```json
{
  "version": 1,
  "timestamp": "2024-01-01T00:00:00.000Z",
  "keyset": [
    {
      "hash": "邀请码哈希",
      "expiration": "过期时间",
      "status": "ACTIVE|USED|REVOKED|EXPIRED",
      "usedBy": "用户ID",
      "createdAt": "创建时间",
      "encryptedContentKey": "加密的 contentKey"
    }
  ],
  "signature": "Ed25519 签名"
}
```

**风险**: ⚠️ **中等风险**
- 包含所有邀请码的哈希值
- 包含加密的 contentKey（需要邀请码才能解密）
- 可以看到房间的访问历史和状态

**建议**: 🔒 **建议加密**（虽然 encryptedContentKey 已加密，但元数据仍然敏感）

---

### 4. ⚠️ **未加密** - 邀请码哈希
**存储键**: `chitchatter_invite_hash_${roomId}_${userId}`

**包含内容**: 邀请码的 SHA-256 哈希值

**风险**: ⚠️ **低风险**
- 只是哈希值，无法反推原始邀请码
- 用于检测吊销状态

**建议**: ✅ 可以保持明文（哈希值本身是安全的）

---

### 5. ⚠️ **未加密** - 会话标记
**存储键**: `chitchatter_session_creator_${roomId}`

**包含内容**: `"true"` 字符串

**风险**: ⚠️ **低风险**
- 仅标记当前标签页是否为管理员
- 刷新页面后需要重新验证

**建议**: ✅ 可以保持明文

---

### 6. ⚠️ **临时存储** - 邀请码明文
**存储键**: `invite_key_${roomId}` (sessionStorage)

**包含内容**: 邀请码明文

**风险**: ⚠️ **高风险**
- 邀请码明文存储在 sessionStorage
- 验证成功后会删除，但在验证期间可被读取

**建议**: 🔒 **需要加密或缩短存储时间**

---

## 加密建议优先级

### 🔴 高优先级（必须加密）

#### 1. 验证用户的 contentKey
```typescript
// 当前代码（不安全）
localStorage.setItem(storageKey, JSON.stringify({
  contentKey: await exportKey(contentKey), // ❌ 明文 JWK
  // ...
}))

// 建议改进
const encryptedContentKey = await encryptWithPassword(
  await exportKey(contentKey),
  password, // 使用房间密码
  roomId
)
localStorage.setItem(storageKey, JSON.stringify({
  contentKey: encryptedContentKey, // ✅ 加密后的数据
  // ...
}))
```

#### 2. sessionStorage 中的邀请码
```typescript
// 当前代码（不安全）
sessionStorage.setItem(`invite_key_${roomId}`, inviteKey) // ❌ 明文

// 建议改进
// 方案 1: 加密存储
const encryptedInviteKey = await encryptWithPassword(inviteKey, roomId, roomId)
sessionStorage.setItem(`invite_key_${roomId}`, encryptedInviteKey)

// 方案 2: 不存储，直接使用后丢弃（更安全）
// 在内存中保持，不写入 sessionStorage
```

---

### 🟡 中优先级（建议加密）

#### 3. AuthorityPackage
虽然 encryptedContentKey 已加密，但元数据（邀请码哈希、使用者、时间戳）仍然敏感。

```typescript
// 建议加密整个 AuthorityPackage
const encryptedPackage = await encryptWithPassword(
  JSON.stringify(authorityPackage),
  password,
  roomId
)
localStorage.setItem(`chitchatter_authority_${roomId}`, encryptedPackage)
```

---

## 推荐的加密工具函数

```typescript
/**
 * 使用密码加密数据
 */
export const encryptWithPassword = async (
  data: string,
  password: string,
  salt: string
): Promise<string> => {
  const encryptionKey = await deriveEncryptionKeyFromPassword(password, salt)
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(data)
  
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    encryptionKey,
    encoded
  )
  
  return JSON.stringify({
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
  })
}

/**
 * 使用密码解密数据
 */
export const decryptWithPassword = async (
  encryptedData: string,
  password: string,
  salt: string
): Promise<string> => {
  const { iv, data } = JSON.parse(encryptedData)
  const encryptionKey = await deriveEncryptionKeyFromPassword(password, salt)
  
  const ivArray = Uint8Array.from(atob(iv), c => c.charCodeAt(0))
  const dataArray = Uint8Array.from(atob(data), c => c.charCodeAt(0))
  
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivArray },
    encryptionKey,
    dataArray
  )
  
  return new TextDecoder().decode(decrypted)
}
```

---

## 总结

| 数据类型 | 当前状态 | 风险等级 | 建议 |
|---------|---------|---------|------|
| CreatorInfo | ✅ 已加密 | 低 | 保持现状 |
| VerifiedUser contentKey | ❌ 明文 | 🔴 高 | **必须加密** |
| AuthorityPackage | ❌ 明文 | 🟡 中 | 建议加密 |
| 邀请码哈希 | ❌ 明文 | 🟢 低 | 可保持明文 |
| 会话标记 | ❌ 明文 | 🟢 低 | 可保持明文 |
| sessionStorage 邀请码 | ❌ 明文 | 🔴 高 | **必须加密或不存储** |

---

## 实施建议

1. **立即修复**: 加密 VerifiedUser 的 contentKey
2. **短期改进**: 加密或移除 sessionStorage 中的邀请码
3. **长期优化**: 加密 AuthorityPackage
4. **安全审计**: 定期检查是否有新的敏感数据存储
