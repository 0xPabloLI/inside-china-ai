# Datawhale 实装体验：DeepSeek Harness 桌面版节前突袭发布

- **Source URL**: https://mp.weixin.qq.com/s/t876nZ5JrxGKnWtOq8bV1A?scene=1
- **Author / account**: Datawhale（微信公众号，二手实装报道）
- **Published**: 2026-09-29 21:27 (Asia/Shanghai)
- **Retrieved**: 2026-09-29 via CDP (web-access), Stage 0 of the content pipeline for `deepseek-harness-desktop`
- **Role**: SECONDARY (hands-on report, the material the user supplied)

---

Datawhale干货 

最新发布：DeepSeek Harness桌面版

国庆还没到，DeepSeek 的更新先到了。

就在刚刚，DeepSeek Harness 桌面版正式发布，macOS 和 Windows 安装包同步上线。

![DeepSeek Harness 官网](https://mmbiz.qpic.cn/sz_mmbiz_png/zW6S9vt0cS8oAKwm4NlwMSL4qoCJLg8M426ay1MSUWVgoIh63ibCsv5OHGZ8dQaZJwLvL6xqfolu0jRdcM42ncOHCwhaGtbPSUxIl8uFia8VQ/640?wx_fmt=png&from=appmsg&tp=webp&wxfrom=5&wx_lazy=1#imgIndex=0)

而且，这次桌面版上线，还伴随着 DeepSeek Harness v0.2 预览版的一轮重磅更新。

日常办公和开发体验、插件管理、自动化任务，都有了新变化。

具体更新了什么？我们分三层来看。

## 一、桌面版来了，上手更方便了

这次最直接的变化，就是有了桌面安装包。

常用的办公和开发能力已经预置好。下载安装后，跟随引导，就能开始使用。

新版本还提供了不同的信息展示方式。想看任务进行到哪一步，可以关注进展；想了解具体执行过程，也可以展开步骤，查看工具调用和运行信息。

![图片](data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate(-249.000000, -126.000000)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

界面简洁一点，还是细节丰富一点，可以按自己的工作习惯调整。

## 二、办公和开发的工作流打通，从交付到迭代一站完成

Agent 的回答结果出来之后人们通常还要来回改几轮。这次更新主要改善的就是这个环节。

生成的文件和每轮代码变更会集中展示在对话里，侧栏可以直接预览，有不满意的地方接着在对话里提。想自己动手调，也能用本地应用打开文件继续编辑。

比如让它分析一份销售表格，生成图表后整理成汇报材料。拿到初稿，再让它压缩一下篇幅，整个过程都在同一段对话里完成。

![图片](data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate(-249.000000, -126.000000)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

重复性工作也有了对应的入口。

新版本内置了自动化任务插件，按需开启后，可以把工作设成定时执行的任务，运行情况和任务设置都能随时调整。

![实装后的官方插件列表，包含自动化任务入口](data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate(-249.000000, -126.000000)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

## 三、插件体系升级，「一切皆插件」的生态开始成形

DeepSeek Harness 有一个鲜明的设计思路：一切皆插件。

小到一个工具，大到交互界面，都可以通过插件融入其中。需要什么能力，就按需扩展。

这次新增了插件管理页面。安装插件不用再通过命令行，输入插件的 npm 包名，就能完成安装。插件介绍、来源，以及停用、卸载操作，也都可以在管理页面找到。

实际打开“添加插件”窗口，还能看到 GitHub 仓库地址和本地目录路径等安装方式，以及安装源选择。

![实际安装后的添加插件窗口](data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate(-249.000000, -126.000000)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

更有意思的，是实验性的“创造模式”。

你可以描述需求，让 Harness 编写和修改插件。创建的插件可以即时生效、持久保存，并出现在插件管理页面里。

官方的例子，就是让它做一个番茄时钟。如果某个小功能经常要用，又没有合适的现成插件，就可以尝试把需求说清楚，让它做一版。

![图片](data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate(-249.000000, -126.000000)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

不过，创造模式目前仍在实验阶段，实际效果需要结合具体需求体验。官方还计划建设插件市场，改善插件的发现、获取和管理体验。

### 未来路线：模型和 Harness 一起进化

官方同时公布了接下来的路线图，包括：

- 改善沙箱功能和安全性；
- 完善智能体团队功能；
- 加入个性化长期记忆；
- 支持浏览器和其他 GUI 软件的自动化操作；
- 支持远程和移动端使用；
- 探索会话分享和多人协作。

另外，DeepSeek 会在模型训练中专门优化模型在 Harness 里的实际表现。

## 写在最后：现在已经可以安装

讲完所有的更新，接下来把桌面版装上。

### 第一步：打开官网，选择版本

进入 DeepSeek Harness 官网，点击下载按钮

- 

```
官网：https://deepseek.com/harness/
```

![官网的 macOS 与 Windows 下载入口](data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate(-249.000000, -126.000000)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

### 第二步：打开软件，登录 DeepSeek 账号

首次使用时，跟随界面引导操作。

如果已经进入主界面，可以点击左下角“更多”，再选择“登录”。

![主界面左下角“更多”中的登录入口](data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate(-249.000000, -126.000000)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

点击登录后，会跳转到浏览器完成账号登录，按照页面提示操作即可。

### 第三步：符合条件的用户，查看体验赠金

本次安装登录后，我们实际收到了 6 元体验赠金，桌面端弹出了到账提示。

![本次实装收到的 6 元赠金提示](data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate(-249.000000, -126.000000)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)

根据发布公告，活动开始前已注册的 DeepSeek 用户，以及活动开始后使用中国大陆手机号注册的用户，在活动期间登录桌面端，可按规则领取。

活动开始前已在 Harness 中登录的用户，需要登出并重新登录才能领取。

到这里，安装和登录就完成了。感兴趣的朋友，可以趁假期装起来体验一下！

![图片](data:image/svg+xml,%3C%3Fxml version='1.0' encoding='UTF-8'%3F%3E%3Csvg width='1px' height='1px' viewBox='0 0 1 1' version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'%3E%3Ctitle%3E%3C/title%3E%3Cg stroke='none' stroke-width='1' fill='none' fill-rule='evenodd' fill-opacity='0'%3E%3Cg transform='translate(-249.000000, -126.000000)' fill='%23FFFFFF'%3E%3Crect x='249' y='126' width='1' height='1'%3E%3C/rect%3E%3C/g%3E%3C/g%3E%3C/svg%3E)
一起“点赞”三连↓