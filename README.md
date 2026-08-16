# SpinFrame

Template-based music transition video generation for macOS and Windows.

[English](#english) · [简体中文](#简体中文)

---

## English

### What is SpinFrame?

SpinFrame is a desktop tool for turning a small set of personal media into a complete music transition video:

**Import → Customize → Preview → Export**

It is not a music player, streaming client, or professional nonlinear video editor. The application provides the composition, animation, player-inspired graphic elements, disc-to-vinyl transition, and video rendering. The user only replaces the source media and adjusts a few essential settings.

### Core workflow

1. Add a transition photo or video containing a CD, disc, record, or another circular object.
2. Select the center of that object in the preview.
3. Add an album cover and a main visual photo or video.
4. Replace the bundled music when needed.
5. Optionally replace the bundled LRC lyrics.
6. Choose the duration and landscape or portrait output.
7. Preview and export an MP4.

### Current features

- Editorial Vinyl template with asymmetric magazine-style composition
- Disc-to-vinyl shape-match transition using position, scale, opacity, blur, and masking
- Photo and video support for transition and main visual media
- Continuously rotating vinyl with a circular album-cover mask
- LRC lyrics with timed highlighting and encoding support for UTF-8, UTF-16, and GB18030
- Minimal waveform, progress line, and player-inspired visual controls
- Landscape `1920 × 1080` and portrait `1080 × 1920` output
- Deterministic composition timeline shared by preview and export
- MP4 export using H.264 video and AAC audio through FFmpeg
- Music starts at the beginning of the composition; audio tracks from imported videos are muted
- Project media copied into a self-contained project folder
- Local-only workflow with no account, cloud service, streaming integration, or automatic media download

### Project status

SpinFrame is currently an early-stage application. Version `0.1.7` includes one template: **Editorial Vinyl**.

The macOS Apple Silicon build has been tested locally. A Windows packaging target is included, but releases should be built and verified on Windows before distribution. macOS packages created without an Apple Developer ID are not notarized and may require **Right-click → Open** on first launch.

### Development

Requirements:

- Node.js 20 or newer recommended
- npm
- macOS or Windows

Install dependencies and start the Electron development environment:

```bash
npm install
npm run dev
```

Run validation and create a production build:

```bash
npm run typecheck
npm run build
```

Create platform packages:

```bash
# macOS Apple Silicon: DMG and ZIP
npm run dist:mac

# Windows: NSIS installer and portable build
npm run dist:win
```

Generated files are written to `release/` and are intentionally excluded from Git.

### Supported media

| Material | Supported formats |
| --- | --- |
| Transition material | MP4, MOV, M4V, WebM, AVI, MKV, JPG, PNG, WebP, AVIF, BMP; HEIC/HEIF on macOS |
| Album cover | JPG, PNG, WebP, AVIF, BMP; HEIC/HEIF on macOS |
| Main visual | MP4, MOV, M4V, WebM, AVI, MKV, JPG, PNG, WebP, AVIF, BMP; HEIC/HEIF on macOS |
| Music | MP3, M4A, AAC, WAV, FLAC |
| Lyrics | LRC, TXT |

### Project structure

```text
SpinFrame/
├── assets/demo/          Bundled default music and lyrics
├── scripts/              Packaging and asset preparation scripts
├── src/main/             Electron main process and FFmpeg export pipeline
├── src/preload/          Secure renderer IPC bridge
├── src/renderer/         React editor and composition preview
├── src/shared/           Project model and deterministic timeline helpers
├── package.json
└── README.md
```

A saved project keeps portable relative media paths:

```text
MyProject/
├── project.json
└── media/
    ├── transition.*
    ├── cover.*
    ├── right-video.*
    ├── music.*
    └── lyrics.lrc
```

### Media and copyright

SpinFrame never downloads music, artwork, lyrics, or video from the internet. Users are responsible for ensuring that all imported and exported media is legally licensed for its intended use.

The files under `assets/demo/` are bundled defaults for local demonstration. Confirm that you have redistribution rights before publishing builds or mirrors containing those files; otherwise replace or remove them.

### License

No software license has been added to this repository. Unless a license is provided later, standard copyright restrictions apply and no permission to copy, modify, or redistribute the source code is granted.

---

## 简体中文

### SpinFrame 是什么？

SpinFrame 是一款桌面端模板化音乐转场视频生成器。用户只需导入少量自己的素材，即可生成包含完整构图、动画、播放器视觉元素和圆形匹配转场的视频：

**导入 → 调整 → 预览 → 导出**

它不是音乐播放器、流媒体客户端，也不是专业多轨视频剪辑软件。应用负责构图、动画、光盘到黑胶的转场和最终视频渲染，用户只需要替换素材并调整少量必要参数。

### 基础流程

1. 添加一张照片或一段视频，其中包含 CD、光盘、唱片或其他圆形物体。
2. 在预览画面中点击圆形物体的中心。
3. 添加专辑封面和主画面照片或视频。
4. 根据需要替换内置音乐。
5. 可选替换内置 LRC 歌词。
6. 选择成片时长以及横屏或竖屏方向。
7. 预览并导出 MP4。

### 当前功能

- Editorial Vinyl 模板，采用不对称的音乐杂志式构图
- 光盘到黑胶的形状匹配转场，组合位置、缩放、透明度、模糊和遮罩
- 转场素材与主画面素材均支持照片和视频
- 持续旋转的黑胶唱片及圆形专辑封面遮罩
- LRC 时间轴歌词高亮，支持 UTF-8、UTF-16 和 GB18030 编码
- 轻量波形、细进度线和播放器风格视觉控件
- 横屏 `1920 × 1080` 与竖屏 `1080 × 1920` 输出
- 预览与导出共享同一套确定性合成时间轴
- 通过 FFmpeg 导出 H.264 视频与 AAC 音频的 MP4
- 音乐从成片第 0 秒开始播放，导入视频自身的音轨始终静音
- 导入的媒体会复制到独立项目文件夹中
- 完全本地运行，无账户、云端、流媒体连接或自动素材下载

### 项目状态

SpinFrame 目前仍处于早期开发阶段。`0.1.7` 版本包含一个模板：**Editorial Vinyl**。

macOS Apple Silicon 版本已经完成本地测试。项目包含 Windows 打包目标，但正式分发前应在 Windows 系统上完成构建与验证。未使用 Apple Developer ID 构建的 macOS 安装包不会经过 Apple 公证，首次启动时可能需要右键选择“打开”。

### 本地开发

建议环境：

- Node.js 20 或更高版本
- npm
- macOS 或 Windows

安装依赖并启动 Electron 开发环境：

```bash
npm install
npm run dev
```

执行检查并生成生产构建：

```bash
npm run typecheck
npm run build
```

创建平台安装包：

```bash
# macOS Apple Silicon：DMG 与 ZIP
npm run dist:mac

# Windows：NSIS 安装程序与便携版
npm run dist:win
```

生成的文件位于 `release/`，该目录不会提交到 Git。

### 支持的素材格式

| 素材 | 支持格式 |
| --- | --- |
| 转场素材 | MP4、MOV、M4V、WebM、AVI、MKV、JPG、PNG、WebP、AVIF、BMP；macOS 支持 HEIC/HEIF |
| 专辑封面 | JPG、PNG、WebP、AVIF、BMP；macOS 支持 HEIC/HEIF |
| 主画面素材 | MP4、MOV、M4V、WebM、AVI、MKV、JPG、PNG、WebP、AVIF、BMP；macOS 支持 HEIC/HEIF |
| 音乐 | MP3、M4A、AAC、WAV、FLAC |
| 歌词 | LRC、TXT |

### 项目结构

```text
SpinFrame/
├── assets/demo/          内置默认音乐与歌词
├── scripts/              打包及素材准备脚本
├── src/main/             Electron 主进程与 FFmpeg 导出管线
├── src/preload/          安全的渲染进程 IPC 桥接
├── src/renderer/         React 编辑界面与合成预览
├── src/shared/           项目数据模型与确定性时间轴工具
├── package.json
└── README.md
```

保存后的项目使用可迁移的相对素材路径：

```text
MyProject/
├── project.json
└── media/
    ├── transition.*
    ├── cover.*
    ├── right-video.*
    ├── music.*
    └── lyrics.lrc
```

### 素材与版权

SpinFrame 不会从互联网下载音乐、图片、歌词或视频。用户需要自行确认导入和导出的全部素材已经取得适合目标用途的合法授权。

`assets/demo/` 中的文件仅作为本地演示默认素材。公开发布包含这些文件的安装包或仓库镜像前，请确认拥有再分发权；否则应替换或移除这些素材。

### 许可证

本仓库目前没有添加软件许可证。在后续添加许可证之前，默认版权限制仍然有效，不代表授予复制、修改或再分发源代码的权限。
