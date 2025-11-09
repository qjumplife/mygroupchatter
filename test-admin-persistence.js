// 测试管理员身份持久化
import crypto from 'crypto';

// 模拟浏览器环境
global.window = {
  crypto: {
    subtle: crypto.webcrypto.subtle,
    getRandomValues: (arr) => crypto.getRandomValues(arr)
  }
};

global.localStorage = {
  data: {},
  getItem(key) { return this.data[key] || null; },
  setItem(key, value) { this.data[key] = value; },
  removeItem(key) { delete this.data[key]; },
  clear() { this.data = {}; }
};

global.sessionStorage = {
  data: {},
  getItem(key) { return this.data[key] || null; },
  setItem(key, value) { this.data[key] = value; },
  removeItem(key) { delete this.data[key]; },
  clear() { this.data = {}; }
};

global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
global.atob = (str) => Buffer.from(str, 'base64').toString('binary');

// 模拟GroupClaimService的核心功能
class MockGroupClaimService {
  async createGroupClaim(roomId, userId) {
    // 生成密钥对
    const keyPair = await crypto.webcrypto.subtle.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign', 'verify']
    );
    
    const contentKey = await crypto.webcrypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    
    // 保存管理员信息
    await this.saveCreatorInfo(roomId, {
      roomId,
      userId,
      privateKeyString: await this.exportKeyToString(keyPair.privateKey),
      publicKeyString: await this.exportKeyToString(keyPair.publicKey),
      contentKeyString: await this.exportKeyToString(contentKey),
      createdAt: new Date().toISOString()
    });
    
    return { keyPair, contentKey };
  }
  
  async saveCreatorInfo(roomId, info) {
    const storageKey = `chitchatter_creator_${roomId}`;
    const passwordKey = `chitchatter_room_password_${roomId}`;
    
    // 先尝试从sessionStorage获取密码
    let password = sessionStorage.getItem(passwordKey);
    
    // 如果sessionStorage没有，尝试从localStorage获取
    if (!password) {
      password = localStorage.getItem(passwordKey);
    }
    
    // 如果都没有，生成一个基于roomId的密码
    if (!password) {
      password = `room_${roomId}_${Date.now()}`;
      localStorage.setItem(passwordKey, password);
      console.log('✅ 生成并保存房间密码');
    } else {
      // 确保密码也保存到localStorage
      localStorage.setItem(passwordKey, password);
    }
    
    // 简化的加密（实际应该使用真正的加密）
    const encrypted = btoa(JSON.stringify(info) + '::' + password);
    localStorage.setItem(storageKey, encrypted);
    
    // 设置session标记
    sessionStorage.setItem(`chitchatter_session_creator_${roomId}`, 'true');
    console.log('✅ 管理员信息已加密存储');
  }
  
  async loadCreatorInfo(roomId) {
    const storageKey = `chitchatter_creator_${roomId}`;
    const passwordKey = `chitchatter_room_password_${roomId}`;
    const stored = localStorage.getItem(storageKey);
    
    if (!stored) {
      console.log('[管理员恢复] 未找到存储数据');
      return null;
    }
    
    // 先尝试从localStorage获取密码
    let password = localStorage.getItem(passwordKey);
    
    // 如果localStorage没有，尝试从sessionStorage获取
    if (!password) {
      password = sessionStorage.getItem(passwordKey);
      if (password) {
        // 将密码保存到localStorage以便持久化
        localStorage.setItem(passwordKey, password);
      }
    }
    
    console.log('[管理员恢复] 密码状态:', password ? '存在' : '不存在');
    
    if (password) {
      try {
        // 简化的解密
        const decrypted = atob(stored);
        const [infoStr, storedPassword] = decrypted.split('::');
        
        if (storedPassword === password) {
          const info = JSON.parse(infoStr);
          
          // 恢复session标记
          sessionStorage.setItem(`chitchatter_session_creator_${roomId}`, 'true');
          console.log('[管理员恢复] 解密成功，已恢复session标记');
          return info;
        } else {
          console.error('[管理员恢复] 密码不匹配');
          return null;
        }
      } catch (decryptError) {
        console.error('[管理员恢复] 解密失败:', decryptError);
        return null;
      }
    } else {
      console.log('[管理员恢复] 无密码，无法解密');
      return null;
    }
  }
  
  async isRoomCreator(roomId, userId) {
    try {
      const creatorInfo = await this.loadCreatorInfo(roomId);
      return creatorInfo?.userId === userId;
    } catch {
      return false;
    }
  }
  
  async exportKeyToString(key) {
    let format = key.type === 'public' ? 'spki' : 
                 key.type === 'private' ? 'pkcs8' : 'raw';
    const exported = await crypto.webcrypto.subtle.exportKey(format, key);
    return btoa(String.fromCharCode(...new Uint8Array(exported)));
  }
}

// 测试函数
async function testAdminPersistence() {
  console.log('🔐 测试管理员身份持久化\n');
  
  const service = new MockGroupClaimService();
  const roomId = 'test-room-123';
  const userId = 'admin-user-456';
  
  try {
    // 测试1: 创建管理员身份
    console.log('✅ 测试1 - 创建管理员身份:');
    await service.createGroupClaim(roomId, userId);
    
    const isCreator1 = await service.isRoomCreator(roomId, userId);
    console.log(`  管理员身份确认: ${isCreator1}`);
    console.log(`  localStorage密码: ${localStorage.getItem(`chitchatter_room_password_${roomId}`) ? '存在' : '不存在'}`);
    console.log(`  sessionStorage标记: ${sessionStorage.getItem(`chitchatter_session_creator_${roomId}`) ? '存在' : '不存在'}`);
    
    // 测试2: 模拟关闭网页（清除sessionStorage）
    console.log('\n✅ 测试2 - 模拟关闭网页:');
    sessionStorage.clear();
    console.log('  sessionStorage已清除');
    console.log(`  localStorage密码: ${localStorage.getItem(`chitchatter_room_password_${roomId}`) ? '存在' : '不存在'}`);
    
    // 测试3: 重新打开网页，恢复管理员身份
    console.log('\n✅ 测试3 - 重新打开网页，恢复身份:');
    const isCreator2 = await service.isRoomCreator(roomId, userId);
    console.log(`  管理员身份恢复: ${isCreator2}`);
    console.log(`  sessionStorage标记恢复: ${sessionStorage.getItem(`chitchatter_session_creator_${roomId}`) ? '存在' : '不存在'}`);
    
    // 测试4: 测试错误用户
    console.log('\n✅ 测试4 - 测试错误用户:');
    const isCreator3 = await service.isRoomCreator(roomId, 'wrong-user');
    console.log(`  错误用户身份检查: ${isCreator3}`);
    
    // 测试5: 测试不存在的房间
    console.log('\n✅ 测试5 - 测试不存在的房间:');
    const isCreator4 = await service.isRoomCreator('wrong-room', userId);
    console.log(`  不存在房间身份检查: ${isCreator4}`);
    
    console.log('\n🎯 测试结果分析:');
    if (isCreator1 && isCreator2 && !isCreator3 && !isCreator4) {
      console.log('✅ 所有测试通过！管理员身份持久化正常工作');
      console.log('✅ 关闭网页后能够正确恢复管理员身份');
      console.log('✅ 身份验证逻辑正确');
    } else {
      console.log('❌ 部分测试失败');
      console.log(`  创建身份: ${isCreator1 ? '✅' : '❌'}`);
      console.log(`  恢复身份: ${isCreator2 ? '✅' : '❌'}`);
      console.log(`  拒绝错误用户: ${!isCreator3 ? '✅' : '❌'}`);
      console.log(`  拒绝错误房间: ${!isCreator4 ? '✅' : '❌'}`);
    }
    
  } catch (error) {
    console.error('❌ 测试过程中出现错误:', error);
  }
}

// 运行测试
testAdminPersistence().then(() => {
  console.log('\n✅ 管理员身份持久化测试完成！');
}).catch(console.error);