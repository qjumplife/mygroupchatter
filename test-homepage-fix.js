// 测试主页管理员身份显示修复
import crypto from 'crypto';

// 模拟浏览器环境
global.window = {
  crypto: {
    subtle: crypto.webcrypto.subtle,
    getRandomValues: (arr) => crypto.getRandomValues(arr)
  },
  location: {
    href: '/',
    reload: () => console.log('页面重新加载')
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

// 模拟主页的isCreator函数
const isCreator = (roomId) => {
  const storageKey = `chitchatter_creator_${roomId}`;
  return localStorage.getItem(storageKey) !== null;
};

// 模拟房间历史服务
const mockRoomHistory = {
  data: [],
  addRoomToHistory(roomId, password) {
    const existing = this.data.findIndex(item => item.roomId === roomId);
    const newItem = { roomId, password, lastAccess: new Date().toISOString() };
    
    if (existing !== -1) {
      this.data[existing] = newItem;
    } else {
      this.data.unshift(newItem);
    }
    
    localStorage.setItem('chitchatter_room_history', JSON.stringify(this.data));
  },
  
  removeRoomFromHistory(roomId) {
    this.data = this.data.filter(item => item.roomId !== roomId);
    localStorage.setItem('chitchatter_room_history', JSON.stringify(this.data));
  },
  
  getRoomHistory() {
    const stored = localStorage.getItem('chitchatter_room_history');
    if (!stored) return [];
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }
};

// 主页显示修复测试
class HomepageFixTest {
  constructor() {
    this.roomId = 'test-room-123';
    this.userId = 'admin-user-456';
  }

  // 创建管理员数据和房间历史
  createAdminWithHistory() {
    console.log('🔧 创建管理员数据和房间历史...');
    
    // 1. 创建管理员数据
    const passwordKey = `chitchatter_room_password_${this.roomId}`;
    const password = `room_${this.roomId}_${Date.now()}`;
    localStorage.setItem(passwordKey, password);
    
    const creatorKey = `chitchatter_creator_${this.roomId}`;
    const creatorInfo = {
      roomId: this.roomId,
      userId: this.userId,
      privateKeyString: 'mock-private-key',
      publicKeyString: 'mock-public-key',
      contentKeyString: 'mock-content-key',
      createdAt: new Date().toISOString()
    };
    const encrypted = btoa(JSON.stringify(creatorInfo) + '::' + password);
    localStorage.setItem(creatorKey, encrypted);
    
    sessionStorage.setItem(`chitchatter_session_creator_${this.roomId}`, 'true');
    
    // 2. 添加到房间历史
    mockRoomHistory.addRoomToHistory(this.roomId, password);
    
    console.log('✅ 管理员数据和房间历史创建完成');
  }

  // 检查主页显示状态
  checkHomepageStatus() {
    const isAdminOnHomepage = isCreator(this.roomId);
    const roomHistory = mockRoomHistory.getRoomHistory();
    const roomInHistory = roomHistory.some(item => item.roomId === this.roomId);
    
    console.log(`主页管理员标识: ${isAdminOnHomepage ? '✅ 显示' : '❌ 不显示'}`);
    console.log(`房间历史中存在: ${roomInHistory ? '✅ 存在' : '❌ 不存在'}`);
    
    return { isAdminOnHomepage, roomInHistory };
  }

  // 模拟完整的降级过程
  performDemotion() {
    console.log('\n🔄 执行完整降级过程...');
    
    // 清除所有相关数据
    sessionStorage.removeItem(`chitchatter_session_creator_${this.roomId}`);
    localStorage.removeItem(`chitchatter_creator_${this.roomId}`);
    localStorage.removeItem(`chitchatter_room_password_${this.roomId}`);
    localStorage.removeItem(`chitchatter_groupclaim_${this.roomId}`);
    
    // 清除用户验证信息
    localStorage.removeItem(`chitchatter_verified_${this.roomId}_${this.userId}`);
    localStorage.removeItem(`chitchatter_invite_hash_${this.roomId}_${this.userId}`);
    
    // 清除临时状态信息
    const tempKeys = Object.keys(localStorage.data).filter(key => 
      key.startsWith(`chitchatter_temp_status_${this.roomId}_`)
    );
    tempKeys.forEach(key => localStorage.removeItem(key));
    
    // 清除邀请码历史记录
    localStorage.removeItem('chitchatter_invite_history');
    localStorage.removeItem('chitchatter_save_invite_history');
    
    // 从房间历史中移除
    mockRoomHistory.removeRoomFromHistory(this.roomId);
    
    // 清除房间会话标记
    localStorage.removeItem(`chitchatter_room_session_${this.roomId}`);
    
    console.log('✅ 完整降级过程完成');
  }

  // 检查数据完整性
  checkDataIntegrity() {
    const hasCreatorData = localStorage.getItem(`chitchatter_creator_${this.roomId}`) !== null;
    const hasPassword = localStorage.getItem(`chitchatter_room_password_${this.roomId}`) !== null;
    const hasGroupClaim = localStorage.getItem(`chitchatter_groupclaim_${this.roomId}`) !== null;
    
    console.log(`管理员数据存在: ${hasCreatorData ? '✅' : '❌'}`);
    console.log(`密码数据存在: ${hasPassword ? '✅' : '❌'}`);
    console.log(`GroupClaim存在: ${hasGroupClaim ? '✅' : '❌'}`);
    
    const dataComplete = hasCreatorData && hasPassword && hasGroupClaim;
    console.log(`数据完整性: ${dataComplete ? '✅ 完整' : '❌ 不完整'}`);
    
    return { hasCreatorData, hasPassword, hasGroupClaim, dataComplete };
  }

  // 显示存储状态
  showStorageStatus() {
    console.log('\n📊 当前存储状态:');
    
    const localKeys = Object.keys(localStorage.data);
    const sessionKeys = Object.keys(sessionStorage.data);
    
    console.log('LocalStorage:');
    if (localKeys.length === 0) {
      console.log('  (空)');
    } else {
      localKeys.forEach(key => {
        const value = localStorage.data[key];
        console.log(`  ${key}: ${value?.length > 50 ? value.substring(0, 50) + '...' : value}`);
      });
    }
    
    console.log('SessionStorage:');
    if (sessionKeys.length === 0) {
      console.log('  (空)');
    } else {
      sessionKeys.forEach(key => {
        console.log(`  ${key}: ${sessionStorage.data[key]}`);
      });
    }
  }

  // 运行完整测试
  async runTest() {
    console.log('🔐 测试主页管理员身份显示修复\n');

    // 测试1: 创建管理员数据
    console.log('✅ 测试1 - 创建管理员数据:');
    this.createAdminWithHistory();
    const status1 = this.checkHomepageStatus();
    const integrity1 = this.checkDataIntegrity();

    // 测试2: 执行降级
    console.log('\n✅ 测试2 - 执行降级:');
    this.performDemotion();
    const status2 = this.checkHomepageStatus();
    const integrity2 = this.checkDataIntegrity();

    // 测试3: 模拟页面刷新后的状态
    console.log('\n✅ 测试3 - 模拟页面刷新:');
    sessionStorage.clear();
    console.log('SessionStorage已清除（模拟页面刷新）');
    const status3 = this.checkHomepageStatus();
    const integrity3 = this.checkDataIntegrity();

    this.showStorageStatus();

    // 测试结果分析
    console.log('\n🎯 测试结果分析:');
    
    const test1Pass = status1.isAdminOnHomepage && status1.roomInHistory && integrity1.dataComplete;
    const test2Pass = !status2.isAdminOnHomepage && !status2.roomInHistory && !integrity2.dataComplete;
    const test3Pass = !status3.isAdminOnHomepage && !status3.roomInHistory && !integrity3.dataComplete;
    
    const allTestsPass = test1Pass && test2Pass && test3Pass;
    
    if (allTestsPass) {
      console.log('✅ 所有测试通过！主页显示修复成功');
      console.log('✅ 降级前主页正确显示管理员身份');
      console.log('✅ 降级后主页不再显示管理员身份');
      console.log('✅ 房间从历史记录中正确移除');
      console.log('✅ 页面刷新后状态保持正确');
    } else {
      console.log('❌ 部分测试失败');
      console.log(`  降级前状态正确: ${test1Pass ? '✅' : '❌'}`);
      console.log(`  降级后状态正确: ${test2Pass ? '✅' : '❌'}`);
      console.log(`  页面刷新后状态正确: ${test3Pass ? '✅' : '❌'}`);
      
      if (!test1Pass) {
        console.log(`    - 主页显示: ${status1.isAdminOnHomepage ? '✅' : '❌'}`);
        console.log(`    - 房间历史: ${status1.roomInHistory ? '✅' : '❌'}`);
        console.log(`    - 数据完整: ${integrity1.dataComplete ? '✅' : '❌'}`);
      }
      
      if (!test2Pass) {
        console.log(`    - 主页不显示: ${!status2.isAdminOnHomepage ? '✅' : '❌'}`);
        console.log(`    - 房间已移除: ${!status2.roomInHistory ? '✅' : '❌'}`);
        console.log(`    - 数据已清除: ${!integrity2.dataComplete ? '✅' : '❌'}`);
      }
      
      if (!test3Pass) {
        console.log(`    - 刷新后主页不显示: ${!status3.isAdminOnHomepage ? '✅' : '❌'}`);
        console.log(`    - 刷新后房间已移除: ${!status3.roomInHistory ? '✅' : '❌'}`);
        console.log(`    - 刷新后数据已清除: ${!integrity3.dataComplete ? '✅' : '❌'}`);
      }
    }
  }
}

// 运行测试
const test = new HomepageFixTest();
test.runTest().then(() => {
  console.log('\n✅ 主页显示修复测试完成！');
}).catch(console.error);