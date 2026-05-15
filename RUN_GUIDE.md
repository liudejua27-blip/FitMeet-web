# 🎯 运行网站详细步骤

## 📋 前置要求

确保已安装以下软件：
- Node.js 18+ 
- pnpm (运行 `npm install -g pnpm`)
- Docker Desktop (用于数据库)

## 🚀 第一次运行（开发环境）

### 步骤 1: 启动数据库和基础设施

```bash
# 在项目根目录 c:\Users\86152\fitness-app
docker-compose up -d
```

等待所有服务启动（约30秒），你会看到：
- ✅ PostgreSQL (端口 5432)
- ✅ Redis (端口 6379)
- ✅ MongoDB (端口 27017)
- ✅ Kafka (端口 9092)

验证服务状态：
```bash
docker-compose ps
```

### 步骤 2: 配置后端环境变量

```bash
# 进入后端目录
cd backend

# 创建开发环境配置（如果不存在）
copy .env.example .env.development
```

编辑 `backend/.env.development`，确保以下配置正确：
```env
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=root
DB_PASSWORD=password123
DB_DATABASE=fitness_app
MONGO_URI=mongodb://localhost:27017/fitness_app
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=dev-secret-key-change-in-production
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

### 步骤 3: 安装后端依赖并启动

```bash
# 在 backend 目录
pnpm install

# 启动后端开发服务器
pnpm run start:dev
```

看到以下信息表示成功：
```
🚀 Application is running on: http://localhost:3000/api
```

**保持这个终端窗口打开！**

### 步骤 4: 启动前端（新终端）

打开新的终端窗口：

```bash
# 进入前端目录
cd c:\Users\86152\fitness-app\frontend

# 安装依赖
pnpm install

# 启动前端开发服务器
pnpm run dev
```

看到以下信息表示成功：
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### 步骤 5: 访问网站

在浏览器打开：**http://localhost:5173**

你应该能看到健身应用的首页！

## 🎉 快速测试

### 测试 API

在浏览器或 Postman 中访问：
```
http://localhost:3000/api/feed
http://localhost:3000/api/categories
http://localhost:3000/api/meets
```

### 测试注册登录

1. 点击"注册"按钮
2. 填写邮箱、密码、姓名
3. 注册成功后自动登录
4. 开始使用应用！

## 🔧 常见问题解决

### 问题 1: Docker 服务启动失败

```bash
# 停止所有服务
docker-compose down

# 清理并重新启动
docker-compose up -d --force-recreate
```

### 问题 2: 端口被占用

```bash
# 检查端口占用
netstat -ano | findstr :3000
netstat -ano | findstr :5173

# 如果被占用，关闭占用的进程或修改端口
# 修改后端端口：编辑 backend/.env.development 中的 PORT
# 修改前端端口：编辑 frontend/vite.config.ts 中的 server.port
```

### 问题 3: 后端连接数据库失败

```bash
# 检查 Docker 服务状态
docker-compose ps

# 查看 PostgreSQL 日志
docker-compose logs postgres

# 重启数据库
docker-compose restart postgres
```

### 问题 4: 前端无法连接后端

检查 `frontend/.env.development` 文件：
```env
VITE_API_BASE_URL=http://localhost:3000/api
```

### 问题 5: pnpm 命令不存在

```bash
# 安装 pnpm
npm install -g pnpm

# 验证安装
pnpm --version
```

## 🛑 停止服务

### 停止前端和后端
在各自的终端窗口按 `Ctrl + C`

### 停止数据库
```bash
# 停止但保留数据
docker-compose stop

# 停止并删除容器（数据保留在 volume 中）
docker-compose down

# 完全清理（包括数据，谨慎使用！）
docker-compose down -v
```

## 🔄 重新启动

下次启动时，只需：

```bash
# 1. 启动数据库
docker-compose up -d

# 2. 启动后端（在 backend 目录）
pnpm run start:dev

# 3. 启动前端（在 frontend 目录，新终端）
pnpm run dev
```

## 📊 查看日志

### 后端日志
后端终端会实时显示请求日志

### 数据库日志
```bash
docker-compose logs -f postgres
docker-compose logs -f redis
docker-compose logs -f mongo
```

## 🧪 运行测试

### 后端测试
```bash
cd backend
pnpm run test
```

### 前端测试
```bash
cd frontend
pnpm run test
```

## 📱 访问不同页面

- 首页：http://localhost:5173/
- 发现：http://localhost:5173/discover
- 活动：http://localhost:5173/meet
- 教练：http://localhost:5173/coach
- 消息：http://localhost:5173/messages
- 通知：http://localhost:5173/notifications

## 🎨 开发提示

### 热重载
- 前端：修改代码后自动刷新
- 后端：修改代码后自动重启（使用 `--watch` 模式）

### 调试
- 前端：使用浏览器开发者工具（F12）
- 后端：查看终端日志或使用 VS Code 调试器

### 数据库管理
```bash
# 连接 PostgreSQL
docker exec -it fitness-postgres psql -U root -d fitness_app

# 查看所有表
\dt

# 查看用户表
SELECT * FROM users;

# 退出
\q
```

## 🚀 下一步

网站运行成功后，你可以：

1. **添加测试数据** - 注册几个用户，创建帖子和活动
2. **测试功能** - 尝试所有功能（发帖、评论、点赞、参加活动等）
3. **查看性能** - 打开浏览器开发者工具查看网络请求
4. **准备部署** - 查看 `QUICK_START.md` 了解生产环境部署

## 📞 需要帮助？

- 查看 `SECURITY_CHECKLIST.md` - 安全配置
- 查看 `PERFORMANCE_OPTIMIZATION.md` - 性能优化
- 查看 `QUICK_START.md` - 部署指南
- 查看终端日志了解详细错误信息
