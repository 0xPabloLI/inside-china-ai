---
title: "DeepSeek Ships a Desktop App. It Leaked Five Days Before the Company Said So."
slug: "deepseek-harness-desktop"
excerpt: "DeepSeek made DeepSeek Harness v0.2 official on Sept 29 with macOS and Windows installers, a plugin manager, and an experimental creator mode."
published: true
---

# DeepSeek Ships a Desktop App. It Leaked Five Days Before the Company Said So.

On Tuesday, September 29, 2026 at 20:04 China time, the DeepSeek Harness team published a short post on its WeChat account with an unusual amount of product news packed into one sentence: **DeepSeek Harness v0.2 preview is out, and it now ships as a desktop app with macOS and Windows installers** ([DeepSeek Harness team, Sept 29, 2026](https://mp.weixin.qq.com/s/ZlHz-GhO2uAywjw0M5rdew)).

The installers sit on [deepseek.com/harness](https://www.deepseek.com/harness/) behind two buttons: `dsh-latest-macos-arm64.dmg` and `dsh-latest-windows-x64.exe`. Until this week, the only ways to run DeepSeek's agent product were a web UI and a terminal command.

The number that matters for anyone following DeepSeek as a company: this is an AI lab shipping consumer software, on a release schedule, with an onboarding flow and a promotional credit campaign. That is a different business than the one that published V3 and R1.

## Five days of an unannounced app

The desktop build was already circulating before DeepSeek said anything about it.

On September 24, signed installers appeared on DeepSeek's own download host with no announcement. 36Kr installed one and reported the client's built-in updater reporting version `V0.1.7-rc.2` ([36Kr, Sept 24, 2026](https://m.36kr.com/p/3998199345500040)). Sina Finance reported the next day that neither the official site nor the GitHub release page had listed a desktop download yet, and that no Linux build existed ([Sina Finance, Sept 25, 2026](https://finance.sina.com.cn/roll/2026-09-25/doc-iniszfef4555139.shtml)). iFeng covered it as a preview that had "leaked" ([iFeng, Sept 25, 2026](https://tech.ifeng.com/c/8whhG6Qax9g)).

The repository tells the same story in commit order. [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness/releases) published `dsh-v0.1.7-rc.1` on September 23 and `dsh-v0.1.7-rc.2` on September 24, then `dsh-v0.2.0-rc.1` on September 28 and `dsh-v0.2.0-rc.2` on September 29 at 09:42 UTC, about two hours before the announcement post. The rc.2 notes make the desktop position explicit: the release bundles the `dsh` command into the macOS and Windows desktop apps so users can manage plugins "without requiring a separate Node or pnpm installation", and it fixes code-signing permissions for the bundled Node runtime on Intel Mac builds ([GitHub release `dsh-v0.2.0-rc.2`, Sept 29, 2026](https://github.com/deepseek-ai/deepseek-harness/releases)).

So the sequence was: binaries on September 24, release candidate on September 29 morning, announcement that evening, download buttons on the homepage.

## What actually shipped

The announcement lists four changes users will notice:

- **Installers.** macOS (Apple silicon) and Windows (64-bit), with a first-run guide. No Node.js, no terminal, no `npx @deepseek-ai/dsh web`.
- **A plugin management page.** Installing an extension no longer needs a command line. You type the package name, the npm identifier, and the app installs it. The same page shows a plugin's description and origin and handles disabling and uninstalling ([DeepSeek Harness team, Sept 29, 2026](https://mp.weixin.qq.com/s/ZlHz-GhO2uAywjw0M5rdew)).
- **Automation tasks as a plugin.** Turn it on and repetitive work becomes a scheduled job with run history, adjustable frequency, and an editable instruction. DeepSeek's own example on the product page creates a job that compiles the week's project notes into a report every Friday at 17:00 Beijing time ([deepseek.com/harness](https://www.deepseek.com/harness/)).
- **Adjustable detail.** Two independent controls: how much of the agent's working steps are shown, and how dense the interface is overall.

The screenshots in the announcement show the manager populated with eight official plugins, several already flagged experimental or Beta: agent teams, automatic authorization review, automation tasks, voice input (local SenseVoice transcription), a rate-limited terminal, the agent loop, subagents, and web search ([DeepSeek Harness team, Sept 29, 2026](https://mp.weixin.qq.com/s/ZlHz-GhO2uAywjw0M5rdew)).

File handling got the most attention in the release notes. Generated files and each round of code changes appear inside the conversation, previewable in a sidebar, openable in a local app for further editing, and iterable by simply asking for another pass in the same thread.

Datawhale, which installed the release build and received the trial credit, filed the update under three headings: onboarding, workflow, and plugins ([Datawhale, Sept 29, 2026](https://mp.weixin.qq.com/s/t876nZ5JrxGKnWtOq8bV1A?scene=1)).

## Everything is a plugin, and most users already took that seriously

DeepSeek Harness is built on an architecture the team calls "everything is a plugin", with a research project named Cordis behind it. Small to a single tool, large to the entire interaction surface, each piece attaches as a plugin. The client is MIT licensed and open source.

The consequence is that the product's capability boundary is partly set by people who do not work at DeepSeek. In the announcement, the team put a number on it: by its own telemetry among users of DeepSeek's official model API, **about 60% of DeepSeek Harness users run a third-party plugin** ([DeepSeek Harness team, Sept 29, 2026](https://mp.weixin.qq.com/s/ZlHz-GhO2uAywjw0M5rdew)).

Two caveats worth keeping. The 60% figure is scoped to accounts using the official model API, not to every person who opens the app. And the same post says the plugin API is still moving: the team commits to making it "clear and stable" and to reducing breaking updates in the future, which is an admission that today, plugin authors patch their code when DeepSeek ships.

## Creator mode: the app writes its own extensions

The experimental feature is called creator mode. You describe what you want in the conversation, and Harness writes and revises a plugin for it. The result takes effect immediately, persists, and shows up in the plugin management page like anything else you installed.

DeepSeek's demo on the product page asks for a Pomodoro timer. The visible trace loads a plugin-development skill, writes a `package.json` and a 638-line `client.js`, calls `plugin_manager.install_bundle`, edits the file, runs a status check, and reports the timer floating on screen. The stated elapsed time: **5 minutes 24 seconds** ([deepseek.com/harness](https://www.deepseek.com/harness/)).

The team labels creator mode experimental and says real results depend on what you ask for. Its stated plan is a plugin marketplace for discovery, acquisition and management.

## What it costs, and the catch testers found

DeepSeek is not giving the product away. The desktop app runs on DeepSeek account credit or an API key, and Datawhale's hands-on and 36Kr's both describe a client that wants a funded account: 36Kr reported that a first run with no balance needs a top-up or an account with valid balance, plus real-name verification ([36Kr, Sept 24, 2026](https://m.36kr.com/p/3998199345500040)).

To soften that door, the launch includes a promotional credit. Conditions, from the announcement's own footnotes:

| Item | DeepSeek's stated terms |
| --- | --- |
| Amount | 6 yuan of trial credit, roughly US$0.89 at Sept 29 rates |
| Who | Users registered before the campaign, plus users who register during it with a mainland China mobile number (+86, virtual number ranges excluded) |
| How | Sign in to the desktop app with a DeepSeek account during the campaign; anyone already signed in must sign out and back in |
| Limits | Limited quantity, ends when exhausted, valid 7 days after arrival |
| What it buys | DeepSeek's estimate for typical agent workloads at off-peak V4.1 Flash prices: about 120 million cache-hit input tokens, 1.48 million cache-miss input tokens, 520,000 output tokens |

That last row is the interesting one. Six yuan of list price is not a generous trial in dollar terms. It is generous because DeepSeek's own token prices are low, which is the same lever the lab has pulled on API pricing since V3.2 Flash.

## The roadmap DeepSeek published

The announcement lists what comes next, in the team's order: better sandboxing and security, more capable agent teams, personalized long-term memory, automation of browsers and other desktop GUI software, remote and mobile access, and experiments in session sharing and multi-user collaboration. More on-demand experiments will be added, and ones that prove themselves out get switched on by default.

One line goes further than a feature list. DeepSeek says Harness will evolve together with its models: the team will optimize Harness for new models, and, in the words of the post, improve model performance *inside Harness* during model training. Product surface and training objective, pointed at each other.

The team also states that by daily active users and daily sessions, DeepSeek Harness has already become the most popular coding agent product among users of DeepSeek's official API.

## What this means for China AI

Chinese AI labs have competed on weights, benchmarks and price per million tokens. DeepSeek has now moved the contest onto the software layer, where distribution, onboarding and plugin retention decide who keeps a user. Two things follow. Third-party plugin authors get a real reason to build for a Chinese lab's stack, since 60% of the existing user base already runs one. And the lab's model roadmap now has a product surface to be measured against, which tends to push capability toward tool use and long tasks rather than toward benchmark rows.

## My Take: the leak was not an accident of process

A signed installer sitting on a vendor's own download host for five days, with the release page still silent, is either a deployment mistake or a soft launch. The evidence leans toward deployment: the `dsh-v0.1.7-rc.1` and `rc.2` tags were cut on September 23 and 24, the same days the binaries surfaced, and `dsh-v0.2.0-rc.2` landed about two hours before the post. That is a team shipping continuously and writing the announcement afterwards.

The bet worth watching is the coupling of model training to one product surface. If, within the next two model releases, DeepSeek's flagship scores rise on agent and tool-use benchmarks without matching gains on static reasoning tests, that coupling is real and visible from outside. If both move together, the claim was marketing.

## Sources

- DeepSeek Harness team, "DeepSeek Harness Desktop: Ready Out of the Box" (Chinese), WeChat, Sept 29, 2026 - [mp.weixin.qq.com/s/ZlHz-GhO2uAywjw0M5rdew](https://mp.weixin.qq.com/s/ZlHz-GhO2uAywjw0M5rdew)
- DeepSeek, official product and download page - [deepseek.com/harness](https://www.deepseek.com/harness/)
- DeepSeek, English product page - [deepseek.com/en/harness](https://www.deepseek.com/en/harness/)
- Releases, deepseek-ai/deepseek-harness (tags `dsh-v0.1.7-rc.1` through `dsh-v0.2.0-rc.2`) - [github.com/deepseek-ai/deepseek-harness/releases](https://github.com/deepseek-ai/deepseek-harness/releases)
- 36Kr, "DeepSeek Harness Desktop Preview Version Is Live", Sept 24, 2026 - [m.36kr.com/p/3998199345500040](https://m.36kr.com/p/3998199345500040)
- Sina Finance, "DeepSeek Harness Desktop Preview Version Is Live", Sept 25, 2026 - [finance.sina.com.cn/roll/2026-09-25/doc-iniszfef4555139.shtml](https://finance.sina.com.cn/roll/2026-09-25/doc-iniszfef4555139.shtml)
- iFeng Tech, "DeepSeek Harness Official Desktop Preview Leaked", Sept 25, 2026 - [tech.ifeng.com/c/8whhG6Qax9g](https://tech.ifeng.com/c/8whhG6Qax9g)
- Datawhale, "DeepSeek Harness Desktop Version, Dropped Before the Holiday", Sept 29, 2026 - [mp.weixin.qq.com/s/t876nZ5JrxGKnWtOq8bV1A?scene=1](https://mp.weixin.qq.com/s/t876nZ5JrxGKnWtOq8bV1A?scene=1)
- Cordis, architecture behind DeepSeek Harness - [github.com/cordiverse/cordis](https://github.com/cordiverse/cordis)
- Community plugin index on GitHub - [github.com/topics/dsh-plugin](https://github.com/topics/dsh-plugin)
