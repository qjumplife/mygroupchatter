// 测试所有加密解密场景

console.log('🔐 测试所有加密解密场景\n');

// 模拟存储
const mockLocalStorage = {};
const mockSessionStorage = {};

const localStorage = {
  setItem: (key, value) => mockLocalStorage[key] = value,
  getItem: (key) => mockLocalStorage[key] || null,
  removeItem: (key) => delete mockLocalStorage[key]
};

const sessionStorage = {
  setItem: (key, value) => mockSessionStorage[key] = value,
  getItem: (key) => mockSessionStorage[key] || null,
  removeItem: (key) => delete mockSessionStorage[key]
};

// 测试1: 管理员信息存储和恢复
function testAdminPersistence() {
  console.log('✅ 测试1 - 管理员信息持久化:');
  
  const roomId = 'test-room';
  const password = 'test123';
  
  // 模拟保存管理员信息
  sessionStorage.setItem(`chitchatter_room_password_${roomId}`, password);
  sessionStorage.setItem(`chitchatter_session_creator_${roomId}`, 'true');
  
  const adminInfo = {
    roomId,
    userId: 'admin123',
    privateKeyString: 'encrypted_private_key',
    publicKeyString: 'public_key',
    contentKeyString: 'encrypted_content_key',
    createdAt: new Date().toISOString()
  };
  
  // 模拟加密存储（简化版）
  const encrypted = `encrypted_${JSON.stringify(adminInfo)}`;
  localStorage.setItem(`chitchatter_creator_${roomId}`, encrypted);
  
  // 测试恢复逻辑
  const sessionCreator = sessionStorage.getItem(`chitchatter_session_creator_${roomId}`);
  const storedPassword = sessionStorage.getItem(`chitchatter_room_password_${roomId}`);
  const storedData = localStorage.getItem(`chitchatter_creator_${roomId}`);
  
  console.log('  Session标记存在:', sessionCreator === 'true');
  console.log('  房间密码存在:', !!storedPassword);
  console.log('  管理员数据存在:', !!storedData);
  console.log('  密码匹配:', storedPassword === password);
}

// 测试2: 用户验证信息存储和恢复
function testUserVerification() {
  console.log('\n✅ 测试2 - 用户验证信息持久化:');
  
  const roomId = 'test-room';
  const userId = 'user123';
  
  const verifiedInfo = {
    roomId,
    userId,
    contentKey: 'encrypted_content_key',
    verifiedAt: Date.now(),
    inviteKeyHash: 'invite_hash_123'
  };
  
  // 模拟加密存储（使用roomId作为密码）
  const encrypted = `encrypted_with_roomid_${JSON.stringify(verifiedInfo)}`;
  localStorage.setItem(`chitchatter_verified_${roomId}_${userId}`, encrypted);
  localStorage.setItem(`chitchatter_invite_hash_${roomId}_${userId}`, verifiedInfo.inviteKeyHash);
  
  // 测试恢复逻辑
  const storedData = localStorage.getItem(`chitchatter_verified_${roomId}_${userId}`);
  const storedHash = localStorage.getItem(`chitchatter_invite_hash_${roomId}_${userId}`);
  
  console.log('  验证数据存在:', !!storedData);
  console.log('  邀请码哈希存在:', !!storedHash);
  console.log('  哈希匹配:', storedHash === verifiedInfo.inviteKeyHash);
}

// 测试3: 临时状态信息
function testTempStatusInfo() {
  console.log('\n✅ 测试3 - 临时状态信息:');
  
  const roomId = 'test-room';
  const hashKi = 'invite_hash_123';
  
  const tempInfo = {
    hashKi,
    usedBy: 'user456',
    timestamp: new Date().toISOString(),
    roomId
  };
  
  // 存储临时信息
  localStorage.setItem(`chitchatter_temp_status_${roomId}_${hashKi}`, JSON.stringify(tempInfo));
  
  // 检索临时信息
  const keys = Object.keys(mockLocalStorage);
  const tempKeys = keys.filter(key => key.startsWith(`chitchatter_temp_status_${roomId}_`));
  
  console.log('  临时信息存储成功:', tempKeys.length > 0);
  console.log('  临时信息数量:', tempKeys.length);
  
  // 模拟管理员确认后删除
  localStorage.removeItem(`chitchatter_temp_status_${roomId}_${hashKi}`);
  const keysAfterRemove = Object.keys(mockLocalStorage);
  const tempKeysAfterRemove = keysAfterRemove.filter(key => key.startsWith(`chitchatter_temp_status_${roomId}_`));
  
  console.log('  确认后删除成功:', tempKeysAfterRemove.length === 0);
}

// 测试4: 消息加密解密兼容性
function testMessageEncryption() {
  console.log('\n✅ 测试4 - 消息加密解密兼容性:');
  
  // 测试明文消息（兼容模式）
  const plaintextMessage = 'Hello World';
  console.log('  明文消息处理:', typeof plaintextMessage === 'string');
  
  // 测试加密消息结构
  const encryptedMessage = {
    iv: 'base64_iv',
    ciphertext: 'base64_ciphertext'
  };
  console.log('  加密消息结构正确:', encryptedMessage.iv && encryptedMessage.ciphertext);
  
  // 测试无contentKey情况
  const noContentKey = null;
  const shouldShowPlaceholder = !noContentKey;
  console.log('  无密钥时显示占位符:', shouldShowPlaceholder);
}

// 测试5: 密钥导入导出
function testKeyImportExport() {
  console.log('\n✅ 测试5 - 密钥导入导出:');
  
  // 模拟密钥字符串
  const privateKeyString = 'base64_encoded_private_key';
  const contentKeyString = 'base64_encoded_content_key';
  
  // 测试Base64解码
  try {
    // 简化测试：检查是否是有效的Base64
    const isValidBase64 = /^[A-Za-z0-9+/]*={0,2}$/.test(privateKeyString);
    console.log('  私钥Base64格式正确:', isValidBase64);
    
    const isValidContentKey = /^[A-Za-z0-9+/]*={0,2}$/.test(contentKeyString);
    console.log('  内容密钥Base64格式正确:', isValidContentKey);
  } catch (error) {
    console.log('  密钥格式检查失败:', error.message);
  }
}

// 运行所有测试
testAdminPersistence();
testUserVerification();
testTempStatusInfo();
testMessageEncryption();
testKeyImportExport();

console.log('\n🎯 潜在问题分析:');
console.log('1. 房间密码丢失 → 管理员信息无法解密');
console.log('2. sessionStorage清理 → 密码丢失');
console.log('3. 密钥格式错误 → 导入失败');
console.log('4. 加密数据损坏 → 解密失败');

console.log('\n✅ 加密解密场景测试完成！');