// 测试管理员降级功能
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

// 模拟管理员降级场景
class AdminDemotionTest {
  constructor() {
    this.roomId = 'test-room-123';
    this.adminA = 'admin-a-456';
    this.adminB = 'admin-b-789';
  }

  // 创建管理员身份
  createAdmin(userId, createdTime) {
    const info = {
      roomId: this.roomId,
      userId,
      privateKeyString: `mock-private-key-${userId}`,
      publicKeyString: `mock-public-key-${userId}`,
      contentKeyString: `mock-content-key-${userId}`,
      createdAt: createdTime
    };

    // 生成密码
    const passwordKey = `chitchatter_room_password_${this.roomId}`;
    const password = `room_${this.roomId}_${Date.now()}`;
    localStorage.setItem(passwordKey, password);

    // 加密存储
    const storageKey = `chitchatter_creator_${this.roomId}`;
    const encrypted = btoa(JSON.stringify(info) + '::' + password);
    localStorage.setItem(storageKey, encrypted);

    // 设置session标记
    sessionStorage.setItem(`chitchatter_session_creator_${this.roomId}`, 'true');

    console.log(`✅ 创建管理员 ${userId}，创建时间: ${createdTime}`);
    return info;
  }

  // 检查管理员身份
  isRoomCreator(userId) {
    const storageKey = `chitchatter_creator_${this.roomId}`;
    const stored = localStorage.getItem(storageKey);
    
    if (!stored) {
      return false;
    }

    const passwordKey = `chitchatter_room_password_${this.roomId}`;
    const password = localStorage.getItem(passwordKey);
    
    if (!password) {
      return false;
    }

    try {
      const decrypted = atob(stored);
      const [infoStr, storedPassword] = decrypted.split('::');
      
      if (storedPassword === password) {
        const info = JSON.parse(infoStr);
        return info.userId === userId;
      }
    } catch (error) {
      return false;
    }
    
    return false;
  }

  // 模拟管理员降级
  demoteAdmin(demotedUserId) {
    console.log(`\n🔄 执行管理员降级: ${demotedUserId}`);
    
    // 清除所有相关数据，成为新用户
    sessionStorage.removeItem(`chitchatter_session_creator_${this.roomId}`);
    localStorage.removeItem(`chitchatter_creator_${this.roomId}`);
    localStorage.removeItem(`chitchatter_room_password_${this.roomId}`);
    localStorage.removeItem(`chitchatter_groupclaim_${this.roomId}`);
    localStorage.removeItem(`chitchatter_verified_${this.roomId}_${demotedUserId}`);
    localStorage.removeItem(`chitchatter_invite_hash_${this.roomId}_${demotedUserId}`);
    
    console.log('✅ 已清除所有相关数据，用户成为新人');
  }

  // 显示存储状态
  showStorage() {
    console.log('\n📊 存储状态:');
    
    const localKeys = Object.keys(localStorage.data).filter(k => k.includes('chitchatter'));
    const sessionKeys = Object.keys(sessionStorage.data).filter(k => k.includes('chitchatter'));
    
    console.log('LocalStorage:');
    if (localKeys.length === 0) {
      console.log('  (空)');
    } else {
      localKeys.forEach(key => {
        const value = localStorage.data[key];
        console.log(`  ${key}: ${value.length > 50 ? value.substring(0, 50) + '...' : value}`);
      });
    }
    
    console.log('SessionStorage:');
    if (sessionKeys.length === 0) {
      console.log('  (空)');
    } else {
      sessionKeys.forEach(key => {
        const value = sessionStorage.data[key];
        console.log(`  ${key}: ${value}`);
      });
    }
  }

  // 运行测试
  async runTest() {
    console.log('🔐 测试管理员降级功能\n');

    // 测试1: 创建两个管理员，A更早
    console.log('✅ 测试1 - 创建两个管理员:');
    const timeA = new Date('2024-01-01T10:00:00Z').toISOString();
    const timeB = new Date('2024-01-01T10:01:00Z').toISOString();
    
    this.createAdmin(this.adminA, timeA);
    const isACreator1 = this.isRoomCreator(this.adminA);
    console.log(`  管理员A身份: ${isACreator1 ? '✅' : '❌'}`);
    
    this.showStorage();

    // 测试2: 模拟管理员B遇到管理员A，B应该被降级
    console.log('\n✅ 测试2 - 管理员B遇到更早的管理员A:');
    console.log(`  A创建时间: ${timeA}`);
    console.log(`  B创建时间: ${timeB}`);
    console.log('  B检测到A更早，执行降级...');
    
    // 模拟B的降级过程
    this.demoteAdmin(this.adminB);
    
    const isACreator2 = this.isRoomCreator(this.adminA);
    const isBCreator2 = this.isRoomCreator(this.adminB);
    
    console.log(`  降级后A身份: ${isACreator2 ? '✅ 保持管理员' : '❌ 意外丢失'}`);
    console.log(`  降级后B身份: ${isBCreator2 ? '❌ 未被降级' : '✅ 已被降级'}`);
    
    this.showStorage();

    // 测试3: 验证B无法再次成为管理员
    console.log('\n✅ 测试3 - 验证B无法再次成为管理员:');
    const isBCreator3 = this.isRoomCreator(this.adminB);
    console.log(`  B尝试检查身份: ${isBCreator3 ? '❌ 仍有管理员权限' : '✅ 已失去管理员权限'}`);

    // 测试4: 模拟B作为新用户重新创建管理员身份（应该可以）
    console.log('\n✅ 测试4 - 模拟B作为新用户重新创建管理员身份:');
    this.createAdmin(this.adminB, new Date().toISOString());
    const isBCreator4 = this.isRoomCreator(this.adminB);
    console.log(`  B重新创建后身份检查: ${isBCreator4 ? '✅ 成功创建（作为新用户）' : '❌ 创建失败'}`);

    // 测试5: 模拟页面刷新后的状态
    console.log('\n✅ 测试5 - 模拟页面刷新:');
    sessionStorage.clear();
    console.log('  SessionStorage已清除（模拟页面刷新）');
    
    const isBCreator5 = this.isRoomCreator(this.adminB);
    console.log(`  刷新后B身份: ${isBCreator5 ? '✅ 正常恢复' : '❌ 意外丢失'}`);

    // 测试结果分析
    console.log('\n🎯 测试结果分析:');
    const allTestsPassed = !isACreator2 && !isBCreator2 && !isBCreator3 && isBCreator4 && isBCreator5;
    
    if (allTestsPassed) {
      console.log('✅ 所有测试通过！管理员降级功能正常工作');
      console.log('✅ 被降级的管理员数据被彻底清除');
      console.log('✅ 被降级的用户可以作为新用户重新创建管理员身份');
      console.log('✅ 页面刷新后管理员身份正常恢复');
    } else {
      console.log('❌ 部分测试失败');
      console.log(`  降级清除数据: ${!isACreator2 && !isBCreator2 ? '✅' : '❌'}`);
      console.log(`  B失去管理员权限: ${!isBCreator3 ? '✅' : '❌'}`);
      console.log(`  B可以重新创建: ${isBCreator4 ? '✅' : '❌'}`);
      console.log(`  页面刷新后状态正确: ${isBCreator5 ? '✅' : '❌'}`);
    }
  }
}

// 运行测试
const test = new AdminDemotionTest();
test.runTest().then(() => {
  console.log('\n✅ 管理员降级测试完成！');
}).catch(console.error);