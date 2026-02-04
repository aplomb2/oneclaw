# OneClaw 部署系统说明

## 系统架构

OneClaw 采用双项目架构，支持批量部署不同配置的实例：

### 1. **oneclaw** - Docker 镜像仓库
- 包含 Dockerfile 和 railway.json
- 当 Dockerfile 更新时，需要触发所有实例重新部署

### 2. **oneclaw-web** - 管理后台（Next.js）
- 提供 Web 界面供用户部署和管理实例
- 使用 Railway API 批量创建和管理实例
- 每个实例可以有不同的环境变量（API keys、Bot tokens 等）

## 部署流程

### 当 Dockerfile 更新后

1. **提交并推送代码**
   ```bash
   cd oneclaw
   git add Dockerfile
   git commit -m "v6: Fix npm git SSH error"
   git push origin main
   ```

2. **切换到管理后台**
   ```bash
   cd ../oneclaw-web
   ```

3. **预览将要重新部署的实例**
   ```bash
   npm run redeploy:dry-run
   ```

4. **执行批量重新部署**
   ```bash
   npm run redeploy:all
   ```

## 最新更新（v6）

### 修复内容
- ❌ **问题**：npm 安装 `libsignal-node` 时报 `ssh: not found` 错误
- ✅ **修复**：增强 git HTTPS 配置，强制所有 git 操作使用 HTTPS
  - 系统级添加 `ssh://` → `https://` 重定向
  - npm install 前在 global 级别再次配置
  - 创建 `.npmrc` 强制 npm 使用 HTTPS
  - 使用 `GIT_SSH_COMMAND` 环境变量

### Dockerfile 主要改动
```dockerfile
# v6 新增配置
RUN git config --system url."https://".insteadOf "ssh://" && \
    git config --system url."https://".insteadOf "git://"

# npm install 前强化配置
RUN echo "git-ssh-command=git -c url.https://github.com/.insteadOf=ssh://git@github.com/" > .npmrc && \
    git config --global url."https://".insteadOf ssh:// && \
    GIT_SSH_COMMAND="..." npm install
```

## 批量部署脚本说明

### 功能
- 从 Firestore 获取所有活跃实例
- 自动跳过自托管实例（用户自己管理）
- 为每个托管实例调用 Railway redeploy API
- 更新数据库时间戳
- 详细日志和错误处理

### 环境变量要求
```bash
# Railway API Token（托管实例使用）
RAILWAY_API_TOKEN=your_railway_pro_token

# Firebase Admin（数据库访问）
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
```

### 输出示例
```
🔍 Fetching all active instances...
Found 15 active instances

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 Redeploying: abc123 (User: user_xyz)...
✅ SUCCESS: abc123 (User: user_xyz)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏭️  SKIPPED: def456 - Self-hosted instance
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Summary:
   ✅ Successful: 12
   ❌ Failed: 1
   ⏭️  Skipped: 2
   📦 Total: 15
```

## 故障排除

### Railway 构建失败
1. 检查 Railway 日志确认错误
2. 确认 Dockerfile 已推送到 GitHub
3. 确认 Railway 使用的是正确的分支（main）

### 批量部署失败
1. 确认环境变量已设置
2. 检查 Railway API Token 是否有效
3. 检查 Firebase Admin 权限

### 实例状态异常
- 登录 Railway Dashboard 查看具体实例
- 查看部署日志定位问题
- 必要时手动重启实例

## 相关链接

- **OneClaw Docker 仓库**: https://github.com/aplomb2/oneclaw
- **Railway Dashboard**: https://railway.app/dashboard
- **管理后台文档**: ../oneclaw-web/scripts/README.md
