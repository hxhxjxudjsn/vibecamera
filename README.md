# VibeCam

一个基于 AI 的智能相机应用，使用 Replicate API 进行图像处理。

## 功能特点

- 🎨 AI 驱动的图像生成和处理
- 📸 实时相机功能
- 🎭 多种情感和场景识别
- 🖼️ 自动图像优化和美化

## 技术栈

### 后端
- FastAPI - 高性能 Web 框架
- Replicate - AI 模型 API
- Pillow - 图像处理
- Python 3.x

### 前端
- React - UI 框架
- Vite - 构建工具

## 安装和运行

### 1. 克隆项目

```bash
git clone https://github.com/hxhxjxudjsn/vibecamera.git
cd vibecamera
```

### 2. 设置环境变量

复制 `.env.example` 文件为 `.env`：

```bash
cp .env.example .env
```

编辑 `.env` 文件，添加你的 Replicate API Token：

```
REPLICATE_API_TOKEN=your_replicate_api_token_here
```

> 💡 获取 Replicate API Token: https://replicate.com/account/api-tokens

### 3. 安装后端依赖

```bash
pip install -r requirements.txt
```

### 4. 运行后端服务

```bash
python main.py
```

或使用 uvicorn：

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 5. 安装和运行前端

```bash
cd vibe-cam
npm install
npm run dev
```

前端将在 `http://localhost:5173` 运行，后端 API 在 `http://localhost:8000`。

## 项目结构

```
vibecamera/
├── main.py              # FastAPI 后端主文件
├── requirements.txt     # Python 依赖
├── .env                 # 环境变量（不提交到 git）
├── .env.example         # 环境变量模板
└── vibe-cam/           # React 前端
    ├── src/
    │   ├── App.jsx     # 主应用组件
    │   └── ...
    └── package.json
```

## API 文档

启动后端后，访问 `http://localhost:8000/docs` 查看自动生成的 API 文档。

## 注意事项

⚠️ **安全提示**：
- 不要将 `.env` 文件提交到 git
- 不要在代码中硬编码 API keys
- 生产环境请使用环境变量管理敏感信息

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
