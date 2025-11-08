# 部署步骤

## ✅ 已完成
1. ✅ Git 仓库已建立并推送到 GitHub
2. ✅ GitHub Actions 工作流已存在 (`.github/workflows/deploy.yml`)
3. ✅ `package.json` homepage 已更新为: `https://qjumplife.github.io/mygroupchatter/`
4. ✅ `vite.config.ts` base 已设置为: `/mygroupchatter/`

## 🔧 需要手动完成的步骤

### 步骤 1: 生成 SSH 部署密钥

在本地运行：

```bash
cd c:\Users\tc\Documents\develop\lifebook\chitchatter\chitchatter
ssh-keygen -t ed25519 -C "github-actions-deploy" -f deploy-key -N ""
```

这会生成两个文件：
- `deploy-key` (私钥)
- `deploy-key.pub` (公钥)

### 步骤 2: 添加公钥到 GitHub Deploy Keys

1. 复制公钥内容：
   ```bash
   type deploy-key.pub
   ```

2. 访问: https://github.com/qjumplife/mygroupchatter/settings/keys

3. 点击 "Add deploy key"

4. 填写：
   - Title: `GitHub Actions Deploy Key`
   - Key: 粘贴公钥内容
   - ✅ 勾选 "Allow write access"

5. 点击 "Add key"

### 步骤 3: 添加私钥到 GitHub Secrets

1. 复制私钥内容：
   ```bash
   type deploy-key
   ```

2. 访问: https://github.com/qjumplife/mygroupchatter/settings/secrets/actions

3. 点击 "New repository secret"

4. 填写：
   - Name: `DEPLOY_KEY`
   - Secret: 粘贴私钥内容

5. 点击 "Add secret"

### 步骤 4: 删除本地密钥文件（安全）

```bash
del deploy-key
del deploy-key.pub
```

### 步骤 5: 提交并推送更改

```bash
git add .
git commit -m "Configure for GitHub Pages deployment"
git push
```

### 步骤 6: 配置 GitHub Pages

1. 访问: https://github.com/qjumplife/mygroupchatter/settings/pages

2. Source 设置：
   - 选择 "Deploy from a branch"
   - Branch: `gh-pages`
   - Folder: `/ (root)`

3. 点击 "Save"

### 步骤 7: 查看部署状态

1. 访问: https://github.com/qjumplife/mygroupchatter/actions

2. 等待 "Deploy to Github Pages" 工作流完成

3. 部署成功后访问: https://qjumplife.github.io/mygroupchatter/

## 🎉 完成！

部署成功后，你的应用将在以下地址可用：
**https://qjumplife.github.io/mygroupchatter/**

## 📝 后续更新

每次修改代码后：

```bash
git add .
git commit -m "描述你的更改"
git push
```

GitHub Actions 会自动构建并部署。

## ⚠️ 注意事项

1. **首次部署**可能需要 5-10 分钟
2. **后续部署**通常 2-3 分钟
3. 如果部署失败，检查 Actions 标签页的错误日志
4. 确保 `gh-pages` 分支不要手动修改（由 Actions 自动管理）

## 🔍 故障排查

### 如果 Actions 失败：
- 检查 DEPLOY_KEY 是否正确设置
- 确认 deploy key 有写入权限
- 查看 Actions 日志获取详细错误信息

### 如果页面 404：
- 等待几分钟让 GitHub Pages 生效
- 检查 Settings → Pages 是否正确配置
- 清除浏览器缓存

### 如果资源加载失败：
- 确认 `vite.config.ts` 中 base 设置正确
- 确认 `package.json` 中 homepage 末尾有 `/`
