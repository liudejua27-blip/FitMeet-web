# 🚀 快速部署指南

## ⚠️ 部署前必须完成的安全配置

### 1. 生成强密钥（必须！）

```bash
# 生成 JWT 密钥（32字节）
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 生成数据库密码（建议使用密码管理器）
# 至少16位，包含大小写字母、数字和特殊字符
```

### 2. 配置生产环境变量

编辑 `backend/.env.production`：

```bash
# 必须修改的配置
JWT_SECRET=<刚才生成的32字节密钥>
DB_PASSWORD=<强密码>
REDIS_PASSWORD=<强密码>
ALLOWED_ORIGINS=https://your-domain.com

# 配置域名
BASE_URL=https://your-domain.com
```

### 3. 运行数据库迁移

```bash
cd backend
pnpm run migration:run
```

## 📦 本地开发环境启动

### 1. 安装依赖

```bash
# 后端
cd backend
pnpm install

# 前端
cd ../frontend
pnpm install
```

### 2. 启动基础设施

```bash
# 在项目根目录
docker-compose up -d
```

### 3. 启动应用

```bash
# 后端（新终端）
cd backend
pnpm run start:dev

# 前端（新终端）
cd frontend
pnpm run dev
```

访问: http://localhost:5173

## 🏭 生产环境部署

### 方式1: Docker Compose（推荐）

```bash
# 1. 配置环境变量
cp backend/.env.example backend/.env.production
# 编辑 .env.production，修改所有密钥和密码

# 2. 构建前端
cd frontend
pnpm install
pnpm run build

# 3. 启动所有服务
cd ..
docker-compose -f docker-compose.prod.yml up -d

# 4. 查看日志
docker-compose -f docker-compose.prod.yml logs -f
```

### 方式2: 手动部署

```bash
# 1. 构建后端
cd backend
pnpm install
pnpm run build

# 2. 使用 PM2 启动
pm2 start ecosystem.config.js

# 3. 配置 Nginx（见下文）
```

## 🔒 配置 HTTPS（Let's Encrypt）

```bash
# 1. 安装 Certbot
sudo apt-get install certbot

# 2. 获取证书
sudo certbot certonly --webroot \
  -w /var/www/certbot \
  -d your-domain.com \
  -d www.your-domain.com

# 3. 证书会保存在
# /etc/letsencrypt/live/your-domain.com/fullchain.pem
# /etc/letsencrypt/live/your-domain.com/privkey.pem

# 4. 复制到项目目录
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/ssl/

# 5. 设置自动续期
sudo certbot renew --dry-run
```

## 🧪 性能测试

### 安装 Artillery

```bash
npm install -g artillery
```

### 运行压力测试

```bash
# 基础测试
artillery run artillery-test.yml

# 生成 HTML 报告
artillery run --output report.json artillery-test.yml
artillery report report.json
```

### 预期结果

- **响应时间**: P95 < 500ms, P99 < 1000ms
- **错误率**: < 1%
- **并发支持**: 10,000+ 用户

## 📊 监控配置

### 1. 健康检查端点

```bash
# 检查应用状态
curl http://localhost:3000/api/health

# 预期返回
{"status":"ok","timestamp":"2026-03-18T10:15:00.000Z"}
```

### 2. 查看日志

```bash
# Docker 日志
docker-compose logs -f backend

# PM2 日志
pm2 logs fitness-backend
```

### 3. 监控 Redis

```bash
# 连接 Redis
docker exec -it fitness-redis redis-cli -a <your-password>

# 查看统计
INFO stats
INFO memory
```

### 4. 监控数据库

```bash
# PostgreSQL 连接数
docker exec -it fitness-postgres psql -U postgres -d fitness_app \
  -c "SELECT count(*) FROM pg_stat_activity;"

# 慢查询
docker exec -it fitness-postgres psql -U postgres -d fitness_app \
  -c "SELECT query, calls, total_time FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"
```

## 🔍 故障排查

### 应用无法启动

```bash
# 检查端口占用
netstat -ano | findstr :3000

# 检查环境变量
cat backend/.env.production

# 查看详细日志
docker-compose logs backend
```

### 数据库连接失败

```bash
# 检查数据库状态
docker-compose ps postgres

# 测试连接
docker exec -it fitness-postgres psql -U postgres -d fitness_app -c "SELECT 1;"
```

### Redis 连接失败

```bash
# 检查 Redis 状态
docker-compose ps redis

# 测试连接
docker exec -it fitness-redis redis-cli -a <password> ping
```

### 性能问题

```bash
# 查看 CPU 和内存使用
docker stats

# 查看慢查询
# 在 PostgreSQL 中启用慢查询日志
# 在 backend/.env.production 中添加
# DB_LOGGING=true
```

## 📋 部署检查清单

部署前确认：

- [ ] 已修改所有默认密码和密钥
- [ ] 已配置正确的 CORS 域名
- [ ] 已获取并配置 HTTPS 证书
- [ ] 已运行数据库迁移
- [ ] 已配置防火墙（只开放 80, 443）
- [ ] 已设置数据库备份计划
- [ ] 已配置监控和告警
- [ ] 已完成压力测试
- [ ] 已准备回滚方案

## 🆘 紧急回滚

```bash
# 停止服务
docker-compose -f docker-compose.prod.yml down

# 恢复数据库备份
docker exec -i fitness-postgres psql -U postgres -d fitness_app < backup.sql

# 启动旧版本
git checkout <previous-version>
docker-compose -f docker-compose.prod.yml up -d
```

## 📞 获取帮助

- 查看 `SECURITY_CHECKLIST.md` 了解安全配置
- 查看 `PERFORMANCE_OPTIMIZATION.md` 了解性能优化
- 遇到问题请查看日志并记录错误信息
