# 部署到 GitHub Pages 指南

## 前提条件
- GitHub 账号
- Git 已安装
- Node.js 20.19.5 和 npm 10.8.2

## 步骤 1: 初始化 Git 仓库

```bash
cd c:\Users\tc\Documents\develop\lifebook\chitchatter\chitchatter
git init
git add .
git commit -m "Initial commit: Chitchatter with enhanced security"
```

## 步骤 2: 在 GitHub 创建仓库

1. 访问 https://github.com/new
2. 仓库名称：`chitchatter`（或你喜欢的名字）
3. 设置为 Public（公开）
4. **不要**勾选 "Add a README file"
5. 点击 "Create repository"

## 步骤 3: 修改 package.json

将 `homepage` 改为你的 GitHub Pages 地址：

```json
{
  "homepage": "https://你的用户名.github.io/chitchatter/"
}
```

例如：
```json
{
  "homepage": "https://tc.github.io/chitchatter/"
}
```

**重要**: 末尾必须有 `/`

## 步骤 4: 修改 vite.config.ts（如果使用子路径）

如果你的仓库名不是你的用户名，需要设置 base：

```typescript
export default defineConfig({
  base: '/chitchatter/',  // 你的仓库名
  // ...
})
```

## 步骤 5: 连接到 GitHub 仓库

```bash
git remote add origin https://github.com/你的用户名/chitchatter.git
git branch -M main
git push -u origin main
```

## 步骤 6: 设置 GitHub Actions 部署密钥

### 方法 A: 使用 GitHub Token（推荐，简单）

1. 访问 https://github.com/settings/tokens
2. 点击 "Generate new token" → "Generate new token (classic)"
3. 勾选 `repo` 和 `workflow` 权限
4. 生成并复制 token
5. 在你的仓库设置中：
   - Settings → Secrets and variables → Actions
   - 点击 "New repository secret"
   - Name: `GITHUB_TOKEN`
   - Value: 粘贴你的 token
   - 点击 "Add secret"

### 方法 B: 使用 SSH 密钥（更安全）

```bash
# 生成 SSH 密钥对
ssh-keygen -t ed25519 -C "github-actions" -f github-actions-key

# 添加公钥到 GitHub
# 1. 复制公钥内容
cat github-actions-key.pub

# 2. 访问仓库 Settings → Deploy keys → Add deploy key
# 3. Title: "GitHub Actions Deploy Key"
# 4. Key: 粘贴公钥内容
# 5. 勾选 "Allow write access"
# 6. 点击 "Add key"

# 添加私钥到 GitHub Secrets
# 1. 复制私钥内容
cat github-actions-key

# 2. 访问仓库 Settings → Secrets and variables → Actions
# 3. 点击 "New repository secret"
# 4. Name: DEPLOY_KEY
# 5. Value: 粘贴私钥内容
# 6. 点击 "Add secret"
```

## 步骤 7: 创建 GitHub Actions 工作流

创建文件 `.github/workflows/deploy.yml`：

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]
  workflow_dispatch:

permissions:
  contents: write
  pages: write
  id-token: write

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout
      uses: actions/checkout@v4
      
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20.19.5'
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Build
      run: npm run build
      
    - name: Deploy to GitHub Pages
      uses: peaceiris/actions-gh-pages@v4
      with:
        github_token: ${{ secrets.GITHUB_TOKEN }}
        publish_dir: ./dist
        cname: chitchatter.im  # 如果有自定义域名，否则删除此行
```

## 步骤 8: 提交并推送

```bash
git add .
git commit -m "Add GitHub Actions deployment workflow"
git push
```

## 步骤 9: 配置 GitHub Pages

1. 访问仓库 Settings → Pages
2. Source: 选择 "Deploy from a branch"
3. Branch: 选择 `gh-pages` 分支，目录选择 `/ (root)`
4. 点击 "Save"

## 步骤 10: 等待部署完成

1. 访问 Actions 标签页
2. 查看部署进度
3. 部署成功后，访问 `https://你的用户名.github.io/chitchatter/`

## 自定义域名（可选）

如果你有自己的域名：

1. 在域名提供商添加 DNS 记录：
   ```
   类型: CNAME
   名称: chitchatter (或 @)
   值: 你的用户名.github.io
   ```

2. 在仓库 Settings → Pages → Custom domain 输入你的域名

3. 勾选 "Enforce HTTPS"

## 故障排查

### 构建失败
- 检查 Node.js 版本是否正确
- 运行 `npm ci` 确保依赖安装正确
- 本地运行 `npm run build` 测试

### 页面 404
- 确认 `homepage` 路径正确
- 确认 `vite.config.ts` 中的 `base` 设置正确
- 检查 GitHub Pages 设置中的分支是否为 `gh-pages`

### 资源加载失败
- 确认 `homepage` 末尾有 `/`
- 清除浏览器缓存重试

## 快速命令总结

```bash
# 1. 初始化
git init
git add .
git commit -m "Initial commit"

# 2. 连接 GitHub
git remote add origin https://github.com/你的用户名/chitchatter.git
git push -u origin main

# 3. 后续更新
git add .
git commit -m "Update: 描述你的更改"
git push
```

## 注意事项

⚠️ **重要安全提示**:
- 不要提交任何真实的 TURN 服务器凭证
- 不要提交 `.env` 文件中的敏感信息
- 使用 GitHub Secrets 存储所有敏感配置

✅ **部署成功后**:
- 测试所有功能是否正常
- 检查加密功能是否工作
- 验证邀请码系统是否正常
