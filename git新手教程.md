```markdown
# Git + GitHub 新手极简教程：从零到第一次提交

> **目标**：只保留最短路径，让你从"一个空文件夹"走到"代码出现在 GitHub 上"。
> 整个流程一共只需要掌握 **8 条命令**。

---

## 全景流程图（先看全貌，后面逐条讲）

```
[电脑装好 Git]
       ↓
   ① 配置身份（只需一次）
       ↓
   ② 在 GitHub 上创建一个空仓库
       ↓
   ③ 把本地文件夹变成 Git 仓库（git init）
       ↓
   ④ 把本地仓库和 GitHub 仓库连起来（git remote add）
       ↓
   ⑤ 写代码 / 放文件
       ↓
   ⑥ git add → git commit → git push（把代码送上 GitHub）
       ↓
   ⑦ 以后改代码，重复 ⑥；别人改了代码，用 git pull 拉下来
```

---

## 第一步：配置身份（一生只需做一次）

> 就像进公司先领工牌——告诉 Git 你是谁。以后每次提交代码，Git 都会自动附上你的名字和邮箱。

### 命令 1：`git config --global user.name "你的名字"`

```bash
git config --global user.name "Xiao Ming"
```

| 部分 | 含义 |
|------|------|
| `git` | 调用 Git 这个工具 |
| `config` | 修改配置 |
| `--global` | 对这台电脑上**所有**项目生效（只用设一次） |
| `user.name` | 配置项：用户名 |
| `"Xiao Ming"` | 你的名字，建议用英文或拼音 |

### 命令 2：`git config --global user.email "你的邮箱"`

```bash
git config --global user.email "xiaoming@example.com"
```

> **提示**：邮箱填你注册 GitHub 时用的那个邮箱，这样 GitHub 才能把你的提交和你的账号关联起来。

### 检查一下有没有配对

```bash
git config --list
```

在输出里找到 `user.name` 和 `user.email`，确认没拼错就行。

---

## 第二步：在 GitHub 上创建远程仓库

这一步在**网页上**操作，不需要敲命令：

1. 打开 [github.com](https://github.com)，登录。
2. 点右上角 **"+"** → **"New repository"**。
3. 填一个仓库名，比如 `my-project`。
4. **其他什么都不要勾**（不要勾 "Add a README"），保持空仓库。
5. 点 **"Create repository"**。
6. 创建成功后，页面上会显示一个地址，类似：
   ```
   https://github.com/xiaoming/my-project.git
   ```
   **复制这个地址，后面要用。**

---

## 第三步：把本地文件夹变成 Git 仓库

> 你现在有一个写代码的文件夹（比如叫 `my-project`），需要告诉 Git "请帮我管理这个文件夹"。

### 命令 3：`git init`

```bash
# 先用终端/命令行进入你的项目文件夹
cd my-project

# 初始化
git init
```

| 部分 | 含义 |
|------|------|
| `cd my-project` | 进入你的项目文件夹 |
| `git init` | 在这个文件夹里初始化一个 Git 仓库（会生成一个隐藏的 `.git` 文件夹） |

> 执行后会提示 `Initialized empty Git repository in ...`
> **这个命令每个项目只需要执行一次。**

---

## 第四步：把本地仓库和 GitHub 仓库连起来

> 你的电脑上的仓库和 GitHub 上的仓库，现在是两个独立的东西。需要"牵线"。

### 命令 4：`git remote add origin 仓库地址`

```bash
git remote add origin https://github.com/xiaoming/my-project.git
```

| 部分 | 含义 |
|------|------|
| `git remote` | 管理远程仓库连接 |
| `add` | 添加一条连接 |
| `origin` | 给这个远程地址起一个别名叫 `origin`（大家都这么叫，别改） |
| `https://github.com/xiaoming/my-project.git` | 你刚才在 GitHub 上复制的那个仓库地址 |

**验证一下是否连上了：**

```bash
git remote -v
```

如果看到类似下面的输出，说明成功了：

```
origin  https://github.com/xiaoming/my-project.git (fetch)
origin  https://github.com/xiaoming/my-project.git (push)
```

> **这一步每个项目也只需要做一次。**

---

## 第四.五步
首先应确认当前所在分支：
```bash
git branch
```

如果没有 main，可以创建并切换：
```bash
git checkout -b main
```

## 第五步：写代码，然后上传到 GitHub

这是你以后**每天都在重复**的操作，一共三步，记住一个口诀：

> **改 → 存 → 推（add → commit → push）**

---

### 命令 5：`git add .` —— 把改动放进"购物车"

```bash
git add .
```

| 部分 | 含义 |
|------|------|
| `git add` | 把文件加入"暂存区"（准备提交的购物车） |
| `.` | 英文句号，代表**当前文件夹下所有改动的文件** |

> 你也可以只加一个文件：`git add index.html`
> **但新手阶段用 `git add .` 最省心，把所有改动一次性放进去。**

---

### 命令 6：`git commit -m "说明文字"` —— 打包封箱

```bash
git commit -m "完成了首页的基本结构"
```

| 部分 | 含义 |
|------|------|
| `git commit` | 把暂存区（购物车）里的东西正式提交，生成一个版本记录 |
| `-m` | 后面跟一段文字，说明这次你改了什么 |
| `"完成了首页的基本结构"` | **一定要写清楚改了什么**，不要写"修改"、"更新"这种废话 |
> ** 可以先在文件中写完整修改的内容，再复制到命令行窗口中提交

---

### 命令 7：`git push -u origin main` —— 送到 GitHub

```bash
git push -u origin main
```

| 部分 | 含义 |
|------|------|
| `git push` | 推送，把本地的提交上传到远程 |
| `-u` | "记住这个绑定关系"，**只在第一次推送时需要写** |
| `origin` | 远程仓库的别名（就是前面 `git remote add` 时起的） |
| `main` | 推送到远程的 `main` 分支（GitHub 现在默认主分支叫 `main`） |

> **第一次推送之后，以后再推送只需要写：**
> ```bash
> git push
> ```
> 因为 `-u` 已经帮你记住了绑定关系。
> 如果这一步报错了请看第四点五步

### 完整的三连操作（以后每天都在用）

```bash
git add .
git commit -m "描述你改了什么"
git push
```

**去 GitHub 网页刷新一下，你的代码就出现了！**

---

## 补充：从 GitHub 拉取最新代码（别人改了 / 你换了一台电脑）

### 命令 8：`git pull` —— 把远程最新代码拉到本地

```bash
git pull
```

| 部分 | 含义 |
|------|------|
| `git pull` | 从 GitHub 下载最新代码，并自动合并到你本地 |

> **建议**：每次写新代码之前，先 `git pull` 一下，确保你的本地是最新版本，避免和队友的代码冲突。

---

## 极简速查卡（贴在显示器旁边）

```
┌─────────────────────────────────────────────────┐
│         只做一次的配置                             │
│  git config --global user.name "名字"            │
│  git config --global user.email "邮箱"           │
│                                                  │
│         每个新项目做一次                           │
│  git init                                        │
│  git remote add origin 仓库地址                   │
│                                                  │
│         每天都在用的三连                           │
│  git add .                                       │
│  git commit -m "改了啥"                           │
│  git push                                        │
│                                                  │
│         写代码之前先拉最新                         │
│  git pull                                        │
└─────────────────────────────────────────────────┘
```

---

## 附：新手最常遇到的 3 个问题

### 问题 1：`git push` 时弹出要求登录怎么办？

GitHub 从 2021 年开始不再支持用密码推送。你需要：

1. 去 GitHub → Settings → Developer settings → **Personal access tokens** → Generate new token。
2. 勾选 `repo` 权限，生成一个 token。
3. 推送时，用户名填你的 GitHub 用户名，**密码栏粘贴这个 token**。
4. 或者用 GitHub 官方的 **GitHub Desktop** 客户端，可以免去命令行登录的麻烦。

### 问题 2：`git push` 说有冲突怎么办？

说明你本地和远程的代码有不一样的地方。先拉取合并：

```bash
git pull
```

Git 会在文件里标出冲突的位置（`<<<<<<<` 和 `>>>>>>>` 之间的内容），你手动选择保留哪部分，删掉标记符号，然后重新：

```bash
git add .
git commit -m "解决了冲突"
git push
```

### 问题 3：我不小心把不该提交的文件 add 了怎么办？

从"购物车"里拿出来（工作区的改动还在）：

```bash
git restore --staged 文件名
```

---

## 总结：你真正需要记住的，就这些

| 场景 | 命令 |
|------|------|
| 第一次配身份 | `git config --global user.name/email` |
| 初始化项目 | `git init` |
| 连接 GitHub | `git remote add origin 地址` |
| 提交并推送 | `git add .` → `git commit -m "说明"` → `git push` |
| 拉取最新代码 | `git pull` |

**以上 8 条命令，覆盖了日常开发 90% 的场景。** 先把这条最短路径跑通，其他命令遇到时再查就行。
> **如果遇到文档内解决不了，不涵盖的问题，可以上网搜索，或询问AI(将命令行的错误提示，以及你的操作步骤告诉AI)
```
