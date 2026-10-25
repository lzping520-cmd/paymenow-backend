# ============================================================
#  Legal AI Server — 腾讯云托管 / Cloud Run 通用 Dockerfile
# ============================================================
FROM node:20-alpine

# 1. 装系统依赖（PDFKit 需要编译，中文字体也需要）
RUN apk add --no-cache python3 make g++ \
    && apk add --no-cache font-noto-cjk font-noto-cjk-extra

WORKDIR /app

# 2. 先拷贝 package.json 利用 Docker 缓存
COPY package.json package-lock.json* ./

# 3. 安装依赖（国内镜像加速）
RUN npm install --production --registry=https://registry.npmmirror.com

# 4. 拷贝源码
COPY . .

# 5. 创建 uploads 目录（multer 会写入）
RUN mkdir -p uploads/ocr uploads/fonts

# 6. 环境变量（云托管控制台会注入覆盖这里）
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/index.js"]
