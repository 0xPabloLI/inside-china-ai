# Changelog

## [1.11.5](https://github.com/0xPabloLI/inside-china-ai/compare/tanstack_start_ts-v1.11.4...tanstack_start_ts-v1.11.5) (2026-10-06)


### Bug Fixes

* **deps:** update dependency [@lovable](https://github.com/lovable).dev/mcp-js to v3 ([7ee76c3](https://github.com/0xPabloLI/inside-china-ai/commit/7ee76c3bf764245b21f716bab5b3239f646caf56))
* **deps:** update dependency [@lovable](https://github.com/lovable).dev/mcp-js to v3 ([1472d59](https://github.com/0xPabloLI/inside-china-ai/commit/1472d59916231a257f1e810f3688c3ff1afe5b39))
* **deps:** update dependency lucide-react to v1 ([f74cfea](https://github.com/0xPabloLI/inside-china-ai/commit/f74cfea3e28cdeb4a9ac220db3117a71c385655a))
* **deps:** update dependency lucide-react to v1 ([b2971d2](https://github.com/0xPabloLI/inside-china-ai/commit/b2971d2732a02891626c4a81692aaf4de35bb996))
* **lint:** keep react-hooks v7 compiler rules at warn + resync bun.lock ([7676784](https://github.com/0xPabloLI/inside-china-ai/commit/767678488b4138296fa764adfc1fc33ab0f3c384))

## [1.11.4](https://github.com/0xPabloLI/inside-china-ai/compare/tanstack_start_ts-v1.11.3...tanstack_start_ts-v1.11.4) (2026-10-04)


### Bug Fixes

* **lint:** writing-for-agents 门禁收敛触发面并整批压成一条 WARN ([5a1c485](https://github.com/0xPabloLI/inside-china-ai/commit/5a1c485abe6e9e22ef1284f0d510152c8a932ab4))
* **rag,lint:** reindex import + gate noise; add Pixelle-Video survey ([a04cd29](https://github.com/0xPabloLI/inside-china-ai/commit/a04cd29e3bcf1f9646662c08ed77baa723d6a81b))
* **rag:** js-yaml v5 无 default export，reindex 一直在模块加载期就崩 ([d905cf8](https://github.com/0xPabloLI/inside-china-ai/commit/d905cf87dae8fb75e147989665e97b4dfa0a98af))

## [1.11.3](https://github.com/0xPabloLI/inside-china-ai/compare/tanstack_start_ts-v1.11.2...tanstack_start_ts-v1.11.3) (2026-10-03)


### Bug Fixes

* **deps:** update minor and patch updates ([#449](https://github.com/0xPabloLI/inside-china-ai/issues/449)) ([3ad4bda](https://github.com/0xPabloLI/inside-china-ai/commit/3ad4bda5a09ef4ba6ff34d063a9ce6108953cf1d))

## [1.11.2](https://github.com/0xPabloLI/inside-china-ai/compare/tanstack_start_ts-v1.11.1...tanstack_start_ts-v1.11.2) (2026-10-01)


### Bug Fixes

* **bench:** PR [#443](https://github.com/0xPabloLI/inside-china-ai/issues/443) review — relevance parse sentinel, per-question resume keys, degraded-pair exclusion ([316e41b](https://github.com/0xPabloLI/inside-china-ai/commit/316e41b3c2cfa1949304384883899f605a549204))

## [1.11.1](https://github.com/0xPabloLI/inside-china-ai/compare/tanstack_start_ts-v1.11.0...tanstack_start_ts-v1.11.1) (2026-09-30)


### Bug Fixes

* **ci:** checkout 递归初始化 submodule，并让引用门禁不再谎报 ([b119951](https://github.com/0xPabloLI/inside-china-ai/commit/b11995146bb456ee40c15938dce6737421f64687))
* **lint:** 清掉 knip 打到的两处——多余 export 与未登记的 colima ([e44e456](https://github.com/0xPabloLI/inside-china-ai/commit/e44e456dea7ce6ee1da96c457ccfdbe271eabf58))


### Reverts

* **ci:** 撤回 submodules 初始化——私有子模块拿不到凭据就不能开 ([2e6532b](https://github.com/0xPabloLI/inside-china-ai/commit/2e6532b474e452d01a412ae70e4d19f7d3bc46ef))

## [1.11.0](https://github.com/0xPabloLI/inside-china-ai/compare/tanstack_start_ts-v1.10.0...tanstack_start_ts-v1.11.0) (2026-09-30)


### Features

* **bench:** [#414](https://github.com/0xPabloLI/inside-china-ai/issues/414) duration-aware per-window budget cap (min_spacing 1.0s) + Round T bookkeeping ([63b1607](https://github.com/0xPabloLI/inside-china-ai/commit/63b16076ddcb82f5080246bc9d8765b7d636a753))
* **bench:** [#414](https://github.com/0xPabloLI/inside-china-ai/issues/414) duration-aware per-window budget cap (min_spacing 1.0s) + Round T bookkeeping ([#439](https://github.com/0xPabloLI/inside-china-ai/issues/439)) ([63b1607](https://github.com/0xPabloLI/inside-china-ai/commit/63b16076ddcb82f5080246bc9d8765b7d636a753))
* **bench:** [#414](https://github.com/0xPabloLI/inside-china-ai/issues/414) 时长感知每窗上限定档 1.0s（扫参：召回不变、冗余回到 uniform_32 水平） ([b93ab7c](https://github.com/0xPabloLI/inside-china-ai/commit/b93ab7c5090c806f56af1927106db4ee335bacba))

## [1.10.0](https://github.com/0xPabloLI/inside-china-ai/compare/tanstack_start_ts-v1.9.1...tanstack_start_ts-v1.10.0) (2026-09-30)


### Features

* **loader:** [#417](https://github.com/0xPabloLI/inside-china-ai/issues/417) ticket-2c 装载层运行手册 + 官方单元 QA 臂 ([9bbf6e8](https://github.com/0xPabloLI/inside-china-ai/commit/9bbf6e874aec225fd5265f9e9cfcbf51e174fcb0))
* **short-video:** [#414](https://github.com/0xPabloLI/inside-china-ai/issues/414)/[#415](https://github.com/0xPabloLI/inside-china-ai/issues/415)/[#417](https://github.com/0xPabloLI/inside-china-ai/issues/417) keyframe windows, quality gates, unified video loader ([8a2bc2f](https://github.com/0xPabloLI/inside-china-ai/commit/8a2bc2f0bbcb5c467e95f890ca3baed92a13e855))
* **short-video:** [#414](https://github.com/0xPabloLI/inside-china-ai/issues/414)/[#415](https://github.com/0xPabloLI/inside-china-ai/issues/415)/[#417](https://github.com/0xPabloLI/inside-china-ai/issues/417) keyframe windows, quality gates, unified video loader ([#436](https://github.com/0xPabloLI/inside-china-ai/issues/436)) ([8a2bc2f](https://github.com/0xPabloLI/inside-china-ai/commit/8a2bc2f0bbcb5c467e95f890ca3baed92a13e855))


### Bug Fixes

* **short-video:** [#415](https://github.com/0xPabloLI/inside-china-ai/issues/415) review 两条：空转写必须走 INFRA + CPS 不计换行 ([88e3cc6](https://github.com/0xPabloLI/inside-china-ai/commit/88e3cc68ffc952cf58ea3a4fb940d3185351eb7f))
* **short-video:** [#415](https://github.com/0xPabloLI/inside-china-ai/issues/415) 响度回读去掉 spawnSync 的 bin 形参（Semgrep 新告警） ([e1bf196](https://github.com/0xPabloLI/inside-china-ai/commit/e1bf1968a154d5dced99ce15663f7f7ab2300538))
* **short-video:** [#415](https://github.com/0xPabloLI/inside-china-ai/issues/415)/[#417](https://github.com/0xPabloLI/inside-china-ai/issues/417) review 三条：INFRA 未标 fail-closed、bench 续跑偏置、时间戳进位 ([f1d3e2a](https://github.com/0xPabloLI/inside-china-ai/commit/f1d3e2a8b6bd154a4b2f6281b6eeb38cdf003045))

## [1.9.1](https://github.com/0xPabloLI/inside-china-ai/compare/tanstack_start_ts-v1.9.0...tanstack_start_ts-v1.9.1) (2026-09-30)


### Bug Fixes

* **deepseek-harness-desktop:** 订正 metadata.articleUrl 为真实域名 chinaai.news ([ca00f11](https://github.com/0xPabloLI/inside-china-ai/commit/ca00f1112de355f914c4b60466b11b0d366284df))
* **domain:** 清除误写的 chinaainews.com，全站引用统一为 chinaai.news ([48092cd](https://github.com/0xPabloLI/inside-china-ai/commit/48092cddb510ff688483091c0c652fff032138f5))

## [1.9.0](https://github.com/0xPabloLI/inside-china-ai/compare/tanstack_start_ts-v1.8.0...tanstack_start_ts-v1.9.0) (2026-09-30)


### Features

* **bench:** [#391](https://github.com/0xPabloLI/inside-china-ai/issues/391) 描述评分按用户裁决改口径（主报 METEOR/ROUGE-L + no-pend CIDEr） ([85acf5d](https://github.com/0xPabloLI/inside-china-ai/commit/85acf5d4cbcf9bbaf15ebc295464eb0d12f8da37))


### Bug Fixes

* **bench:** [#391](https://github.com/0xPabloLI/inside-china-ai/issues/391) QA unified denominator, caption metrics, research §17 ([4fdbef6](https://github.com/0xPabloLI/inside-china-ai/commit/4fdbef604d850e7dc696ad567e15e16c7b90ad82))
* **bench:** [#391](https://github.com/0xPabloLI/inside-china-ai/issues/391) 空选帧必须记分母（统一 276 题，不静默跳题） ([a72cf8b](https://github.com/0xPabloLI/inside-china-ai/commit/a72cf8bd87ea6f34228c9d7abaa3d72a36613e8b))
* **bench:** [#432](https://github.com/0xPabloLI/inside-china-ai/issues/432) review — select() 抛错与合法空选帧分开记账；无输出行不进 parser_check ([40f2e59](https://github.com/0xPabloLI/inside-china-ai/commit/40f2e59788a6d302720d5a35bc0f48380143c254))

## [1.8.0](https://github.com/0xPabloLI/inside-china-ai/compare/tanstack_start_ts-v1.7.0...tanstack_start_ts-v1.8.0) (2026-09-30)


### Features

* **bench:** [#391](https://github.com/0xPabloLI/inside-china-ai/issues/391) B'' —— 按 MiniCPM-o 官方 omni 规格装载（帧+音频段交织） ([480b47d](https://github.com/0xPabloLI/inside-china-ai/commit/480b47d10a958ea8904adca835b3f3c3743a2fca))
* **bench:** [#391](https://github.com/0xPabloLI/inside-china-ai/issues/391) KFS 适配器全方法 + 题对去重；QA 管线加音频臂（VM_AUDIO=1） ([685e597](https://github.com/0xPabloLI/inside-china-ai/commit/685e597514284639f4c7263b1ef6a1214febe99b))
* **bench:** [#391](https://github.com/0xPabloLI/inside-china-ai/issues/391) QA 臂加 tiered_v5 —— 几何口径已证明它修的是真缺陷 ([1b6bdb8](https://github.com/0xPabloLI/inside-china-ai/commit/1b6bdb86eae3f34a9a99b5dc64c094f2f970b0e2))
* **bench:** [#391](https://github.com/0xPabloLI/inside-china-ai/issues/391) QA 臂转写目录可切（VM_ASR_DIR，为 ctx-off 复跑准备） ([5780337](https://github.com/0xPabloLI/inside-china-ai/commit/578033713ed1d65f9bc0309f3ccec53be1beb043))
* **bench:** [#391](https://github.com/0xPabloLI/inside-china-ai/issues/391) 官方单元格式的 QA 臂 + 转写文本四种喂法对照 ([7e1fb94](https://github.com/0xPabloLI/inside-china-ai/commit/7e1fb9477ed9535bf764d5a4bcbfed4ccff632c3))
* **bench:** [#391](https://github.com/0xPabloLI/inside-china-ai/issues/391) 官方单元臂改用**官方代码**产出的输入（user 质疑成立） ([8dc2b2f](https://github.com/0xPabloLI/inside-china-ai/commit/8dc2b2fe509ecc46f11111765c7dd0851c90e6b4))
* **bench:** [#391](https://github.com/0xPabloLI/inside-china-ai/issues/391) 按「能测尽测」补齐所有方法的口径覆盖 ([5d7674a](https://github.com/0xPabloLI/inside-china-ai/commit/5d7674a7d667b56181ff91b3ee33b31771451e08))
* **bench:** [#391](https://github.com/0xPabloLI/inside-china-ai/issues/391) 描述质量评测链（ActivityNet Captions per-event + pycocoevalcap） ([2034f86](https://github.com/0xPabloLI/inside-china-ai/commit/2034f8638a71a3a2df1549a974a954ea0ac17acd))
* **bench:** [#391](https://github.com/0xPabloLI/inside-china-ai/issues/391) 转写脚本入 git（ctx-off 默认、可续跑、输出目录可切） ([1af482a](https://github.com/0xPabloLI/inside-china-ai/commit/1af482acc72fb547d63b481501dc70d62e97d391))


### Bug Fixes

* **bench:** [#391](https://github.com/0xPabloLI/inside-china-ai/issues/391) QA 臂四处静默失败（后缀剥离/方法缺失/超预算/零行 rc=0） ([42cccb6](https://github.com/0xPabloLI/inside-china-ai/commit/42cccb62d9dcd5e44fbfd896c84ccd46bd7ec02b))
* **bench:** [#391](https://github.com/0xPabloLI/inside-china-ai/issues/391) 修我的两处 bug（kffocus 缺 budget 形参、第三方臂的环境依赖）+ 预计算选帧模式 ([28cb45d](https://github.com/0xPabloLI/inside-china-ai/commit/28cb45d496adc2f0c5167a18b67f1244ec3e03c9))
* **bench:** [#391](https://github.com/0xPabloLI/inside-china-ai/issues/391) 描述基准改为事件窗内选帧（修 cap 协议偏差） ([a85959b](https://github.com/0xPabloLI/inside-china-ai/commit/a85959b26edbb6e220f8d4adc0adb2b35f1aaba2))
* **bench:** [#391](https://github.com/0xPabloLI/inside-china-ai/issues/391) 描述生成脚本三处 bug（启动即崩，修完才跑起来） ([235d85d](https://github.com/0xPabloLI/inside-china-ai/commit/235d85db426a8673c18906dae97d236f6c0f3548))
* **bench:** [#419](https://github.com/0xPabloLI/inside-china-ai/issues/419) review — KFS 适配器四条（K 预算 / 零帧臂 / 死表达式 / 汇总合并） ([126b7c9](https://github.com/0xPabloLI/inside-china-ai/commit/126b7c9ad91de92686670e768fa3f93adf3f5dc1))
* **bench:** [#419](https://github.com/0xPabloLI/inside-china-ai/issues/419) review — omni 单元脚本三条（陈旧帧 / ffprobe 重复 / 死导入） ([901f542](https://github.com/0xPabloLI/inside-china-ai/commit/901f542dd9c6454ad713ce4234e58c4fae265352))
* **bench:** [#419](https://github.com/0xPabloLI/inside-china-ai/issues/419) review — QA 臂三条（音频缓存投毒 / 双喂法误标 / 死代码） ([91957b0](https://github.com/0xPabloLI/inside-china-ai/commit/91957b003f3c3ea315ddf52182ff8e146d9156b1))
* **bench:** [#419](https://github.com/0xPabloLI/inside-china-ai/issues/419) review — 描述脚本两条（临时帧 finally 清理 / 时长探测入 try） ([eb213bf](https://github.com/0xPabloLI/inside-china-ai/commit/eb213bfe47d47896616ef942e9569f73088331cf))

## [1.7.0](https://github.com/0xPabloLI/inside-china-ai/compare/tanstack_start_ts-v1.6.1...tanstack_start_ts-v1.7.0) (2026-09-28)


### Features

* **bench:** [#391](https://github.com/0xPabloLI/inside-china-ai/issues/391) tiered v5 盲区修复 + TAKSF/LVNet-TSC 入表 + 预算扫描 + KFS-Bench 接入 ([efd6324](https://github.com/0xPabloLI/inside-china-ai/commit/efd63243a48beb20c130ebfd38485546e27b1b67))


### Bug Fixes

* **bench:** [#412](https://github.com/0xPabloLI/inside-china-ai/issues/412) review 两条 P3 —— eval.py 失败不再被记成成功、LVNet/KFFocus 显式守预算 ([8405c7d](https://github.com/0xPabloLI/inside-china-ai/commit/8405c7d3b120d9ca8b7419cb964ea965173979db))

## [1.6.1](https://github.com/0xPabloLI/inside-china-ai/compare/tanstack_start_ts-v1.6.0...tanstack_start_ts-v1.6.1) (2026-09-28)


### Bug Fixes

* **docs,content:** [#410](https://github.com/0xPabloLI/inside-china-ai/issues/410) review 四条：尾换行 / skill 名 / SHA 引用 / Boogu 峰值口径 ([2d33cdc](https://github.com/0xPabloLI/inside-china-ai/commit/2d33cdc0adc71e5d7bf0c99d39c59cb7f1826989))

## [1.6.0](https://github.com/0xPabloLI/inside-china-ai/compare/tanstack_start_ts-v1.5.1...tanstack_start_ts-v1.6.0) (2026-09-28)


### Features

* **bench:** [#391](https://github.com/0xPabloLI/inside-china-ai/issues/391) tiered v3 平坦段密度保底（L6）+ batch3 测试台 ([958a5a6](https://github.com/0xPabloLI/inside-china-ai/commit/958a5a6b40c5366b9e99805a3b370ce440e00cd2))
* **bench:** [#391](https://github.com/0xPabloLI/inside-china-ai/issues/391) unitree GT 终裁采纳三机制共识（用户授权代理裁决） ([6af4138](https://github.com/0xPabloLI/inside-china-ai/commit/6af4138165569f54b36e186699044bf0e3d01b50))
* **bench:** [#391](https://github.com/0xPabloLI/inside-china-ai/issues/391) 全方法统一测试台（批次一 CPU-only 十法横评） ([28cb428](https://github.com/0xPabloLI/inside-china-ai/commit/28cb42834fd21863827b97fd1c0f53a07d297078))
* **bench:** [#391](https://github.com/0xPabloLI/inside-china-ai/issues/391) 判据研究与 tiered 选帧器实证（bench-only） ([d0120cb](https://github.com/0xPabloLI/inside-china-ai/commit/d0120cb98dfce3304cd4e530a97d39399c560c78))
* **bench:** [#391](https://github.com/0xPabloLI/inside-china-ai/issues/391) 四方法入 harness（SLICE/InfoShot/K-frames/KFFocus）+ slice 进 QA 臂 ([7f7037f](https://github.com/0xPabloLI/inside-china-ai/commit/7f7037fe97f5b8180579621254ccc9e18a8d9ccc))
* **bench:** [#391](https://github.com/0xPabloLI/inside-china-ai/issues/391) 并入 KFS-Bench 三因子判据 + 修 tiered 两处缺陷 ([f4c197f](https://github.com/0xPabloLI/inside-china-ai/commit/f4c197fa220d093dcf331d1762d48db8fca02388))
* **bench:** [#391](https://github.com/0xPabloLI/inside-china-ai/issues/391) 批次二 embedding 选择器 + tiered 第二切点信号 ([519545f](https://github.com/0xPabloLI/inside-china-ai/commit/519545fbc47136770c0fba0371b8784f5c1fdbde))
* **bench:** [#391](https://github.com/0xPabloLI/inside-china-ai/issues/391) 真 SigLIP embedding 复测 + Video-MME QA 评测管线 ([2ef4017](https://github.com/0xPabloLI/inside-china-ai/commit/2ef40172a0a2bd9140f57c2db8a37a1e8e612aec))


### Bug Fixes

* **bench:** [#391](https://github.com/0xPabloLI/inside-china-ai/issues/391) SigLIP 臂走 PIL processor，坐实 tvF 根因非环境玄学 ([2ba5017](https://github.com/0xPabloLI/inside-china-ai/commit/2ba5017fef76d6aa921d4b4d5e81e3a6c4e96447))
* **bench:** [#391](https://github.com/0xPabloLI/inside-china-ai/issues/391) 逐条修 PR [#407](https://github.com/0xPabloLI/inside-china-ai/issues/407) bot review 的 6 条 thread（每条都先证伪/证实再改） ([e164cd4](https://github.com/0xPabloLI/inside-china-ai/commit/e164cd4b61c5bc7238d2d76a100ae96329a99fd9))

## [1.5.1](https://github.com/0xPabloLI/inside-china-ai/compare/tanstack_start_ts-v1.5.0...tanstack_start_ts-v1.5.1) (2026-09-27)


### Bug Fixes

* **#399:** 处理 droid-review 5 条（P1 cdp 悬空符号链接守卫 + P2/P3 文档与登记对齐） ([5f3e2d4](https://github.com/0xPabloLI/inside-china-ai/commit/5f3e2d4fbc2a08c4cb74a495f3fef68f27c49747))
* **lock:** 恢复 CI 已验证锁基线，仅摘除根 ws 声明（保留传递条目） ([535d713](https://github.com/0xPabloLI/inside-china-ai/commit/535d713e461fe89ca60782bbedd01837171060f5))

## [1.5.0](https://github.com/0xPabloLI/inside-china-ai/compare/tanstack_start_ts-v1.4.1...tanstack_start_ts-v1.5.0) (2026-09-27)


### Features

* **#391:** frame_strategy uniform/scene switch + bench matrix + YuNet side-by-side eval ([0b756ca](https://github.com/0xPabloLI/inside-china-ai/commit/0b756caef8656f61c56daf343c9c36ce9eceb8c0))
* **#391:** VLM keyframe selection experiment — frame_strategy uniform/scene + bench matrix + YuNet eval ([75541f1](https://github.com/0xPabloLI/inside-china-ai/commit/75541f1e4f867756ced4b3faec0484e64f858b3d))


### Bug Fixes

* **#391:** yunet_compare probe_duration error containment — skip bad asset, don't abort the loop (droid-review P2) ([85a3e5f](https://github.com/0xPabloLI/inside-china-ai/commit/85a3e5fdef5e59d8cd24250c96c6f7a42dd33e0b))

## [1.4.1](https://github.com/0xPabloLI/inside-china-ai/compare/tanstack_start_ts-v1.4.0...tanstack_start_ts-v1.4.1) (2026-09-26)


### Bug Fixes

* **#360:** leftover minors — offset video-only hard error, S8 render warning, closeE2V coverage ([95cd977](https://github.com/0xPabloLI/inside-china-ai/commit/95cd9776b498da1903216fed1814956e84716bd8))
* **#360:** leftover minors — offset video-only hard error, S8 render warning, closeE2V coverage ([cb4ca23](https://github.com/0xPabloLI/inside-china-ai/commit/cb4ca232f7db762a59a956d8bf20b662f8b57cd5))

## [1.4.0](https://github.com/0xPabloLI/inside-china-ai/compare/tanstack_start_ts-v1.3.0...tanstack_start_ts-v1.4.0) (2026-09-26)


### Features

* **#360:** long-video preprocessing — VLM tiered segmentation + videoStartOffsetMs schema/render ([a41dfcb](https://github.com/0xPabloLI/inside-china-ai/commit/a41dfcb9c969ed762c050bca03f47b493fb50506))
* **#360:** ticket-1 — VLM 时长分级分段分析 + durationMs 落盘 + 缓存 key 纳入窗口参数 ([1126956](https://github.com/0xPabloLI/inside-china-ai/commit/1126956b02b12ee38aa733a0317ea0c57cc59173))
* **#360:** ticket-2 — MediaField.videoStartOffsetMs 双写 schema + 渲染起播 offset + patch 校验 ([ef17f46](https://github.com/0xPabloLI/inside-china-ai/commit/ef17f462c1fd5315b42fb60f58b2d98e9fb1223a))


### Bug Fixes

* **#360:** review-media-patch formatPatchEntry emits videoStartOffsetMs — third formatter mirror (droid-review P3) ([d6d897e](https://github.com/0xPabloLI/inside-china-ai/commit/d6d897e874fda03938f48f21f6795848be43f9a8))

## [1.3.0](https://github.com/0xPabloLI/inside-china-ai/compare/tanstack_start_ts-v1.2.2...tanstack_start_ts-v1.3.0) (2026-09-26)


### Features

* **#361:** 全模态 VLM 引擎接入（MiniCPM-o 4.5 + emotion2vec+） ([021d7c4](https://github.com/0xPabloLI/inside-china-ai/commit/021d7c43bcf0e4243b7d36810c45632ea655d02e))


### Bug Fixes

* **#361:** resolve review findings — minicpm frame pass-through, &lt;|SOA&gt; regex, engine default from vlm-model.json ([5791058](https://github.com/0xPabloLI/inside-china-ai/commit/57910585b5536146aff44d3149775eb75aef0614))

## [1.2.2](https://github.com/0xPabloLI/inside-china-ai/compare/tanstack_start_ts-v1.2.1...tanstack_start_ts-v1.2.2) (2026-09-26)


### Bug Fixes

* **video:** compile-series argv execution removes shell path injection ([#319](https://github.com/0xPabloLI/inside-china-ai/issues/319)) ([5be83ad](https://github.com/0xPabloLI/inside-china-ai/commit/5be83ad938c58a44113f2b9f034236989fc4ac90))
* **video:** compile-series 改 argv 数组执行，消除 shell 路径注入（[#319](https://github.com/0xPabloLI/inside-china-ai/issues/319) OCR High） ([008bb2f](https://github.com/0xPabloLI/inside-china-ai/commit/008bb2ff727463c66f39742c988e0ed175a8e3fe))

## [1.2.1](https://github.com/0xPabloLI/inside-china-ai/compare/tanstack_start_ts-v1.2.0...tanstack_start_ts-v1.2.1) (2026-09-26)


### Bug Fixes

* **ci:** notify 兜底判别器改为 gate 日志优先（droid review P1） ([ccb7c12](https://github.com/0xPabloLI/inside-china-ai/commit/ccb7c12163293f1af12601c2ad1b06aaf306b77d)), closes [#339](https://github.com/0xPabloLI/inside-china-ai/issues/339)
* **ci:** seo-monitor 失败时评论不再失明（指出失败步骤 + 带出日志尾部） ([04b1d44](https://github.com/0xPabloLI/inside-china-ai/commit/04b1d4463d1726529a7e07bb800db28e3e184d9d))

## [1.2.0](https://github.com/0xPabloLI/inside-china-ai/compare/tanstack_start_ts-v1.1.0...tanstack_start_ts-v1.2.0) (2026-09-25)


### Features

* **#298:** FastMetal-5B-QAD B-roll T2V 评测——5B 全门通过胜出 + 评测框架落地 ([77ccc8a](https://github.com/0xPabloLI/inside-china-ai/commit/77ccc8a3d8a1ec682e3896504f5ec85073c95f5c))
* **#298:** 生产端口——5B 批量驱动 + runner tier 体系，B-roll 默认模型切换 FastMetal-5B ([d9b3fc4](https://github.com/0xPabloLI/inside-china-ai/commit/d9b3fc457ec772e60b5bd8116eee76229ee738ef))


### Bug Fixes

* **#298:** PR 评审线程修复——真实 P2 bug ×4 + eval 脚本去硬编码 + 元数据对齐 ([0ac2cdd](https://github.com/0xPabloLI/inside-china-ai/commit/0ac2cdd5c7c9284631f91ae4ee553dc5a2676570))
* **#298:** taehv 解码器探针降级为警告——CI/新机无缓存不再误判依赖缺失 ([d953a6d](https://github.com/0xPabloLI/inside-china-ai/commit/d953a6d79a83b96e12b159aeb2975c79705cc4ac))
* **#298:** 评审修复——编码器根守卫 + probe 用已解析 tier + 文档对齐 ([dabf5b3](https://github.com/0xPabloLI/inside-china-ai/commit/dabf5b3cf95c9bb8bf93cdcebc6512fc72565422))
* **vlm:** single source of truth for the VLM model id — vlm-model.json ([#351](https://github.com/0xPabloLI/inside-china-ai/issues/351)) ([b05c01f](https://github.com/0xPabloLI/inside-china-ai/commit/b05c01fe31b35efcac846700adae386eeedbe8e4))
* **vlm:** 补 getVlmModelId 真实调用测试——修复 CI 覆盖率棘轮（functions 72.46% &lt; 72.5%） ([5b342a1](https://github.com/0xPabloLI/inside-china-ai/commit/5b342a152a9417a559bd3e7acd2f8f5607dd1bd7))

## [1.1.0](https://github.com/0xPabloLI/inside-china-ai/compare/tanstack_start_ts-v1.0.0...tanstack_start_ts-v1.1.0) (2026-09-25)


### Features

* **#155:** aiImage 静态图生成 T2I 路径（Z-Image Turbo 默认后端） ([35fb416](https://github.com/0xPabloLI/inside-china-ai/commit/35fb41694210e3921b1c0d440b63ce2413f4879e))
* **#166:** B-roll 八维 prompt 常量注入（第二层） ([5ab4953](https://github.com/0xPabloLI/inside-china-ai/commit/5ab495329b875c636bd14cac91a0253ddec795af))
* **#179:** AMD ROCm CosyVoice3 测试脚本 + 阿里云 PAI-DSW backup 记录 ([7c6e362](https://github.com/0xPabloLI/inside-china-ai/commit/7c6e362f73f8bb1b277b26cb41869ef7907e4b18))
* **#179:** NPU TTS 适配 + Kaggle CUDA E2E 修复 —— CosyVoice3 引擎优先级定稿 ([74dfcf5](https://github.com/0xPabloLI/inside-china-ai/commit/74dfcf5d5f8f5dc07eae18942ee90e79581d048e))
* **#179:** 新增 Modal CUDA 引擎 + fallback 顺序调整 —— 先保证 CUDA emotion ([c4f87d1](https://github.com/0xPabloLI/inside-china-ai/commit/c4f87d120f7963be8a1173ab9475677e109ce03c))
* **#214 T2:** AvatarCard 前景卡片层（右中竖卡 + present 裁切 + fail-closed staging） ([8f61596](https://github.com/0xPabloLI/inside-china-ai/commit/8f61596dd233f46771d2a4aac8cfcd5d19f45903))
* **#214 T3:** 生成编排 CLI plan dry-run — 静音边界分段 + 费用预估 + 质量档授权门 ([bec0118](https://github.com/0xPabloLI/inside-china-ai/commit/bec01189531bbceb7ef25d93933b335e0010e566))
* **#214 T4:** 生成编排 run/resume — 远端任务状态机 + 2x 超分回写 + report ([5ce3adf](https://github.com/0xPabloLI/inside-china-ai/commit/5ce3adf4a9be3e29d075cde26795322c67c37aee))
* **#214 T5:** 帧审计三道关卡 — safe-zone 侵入指名 + 唇动存在 + 音画同步 ([cfe39ef](https://github.com/0xPabloLI/inside-china-ai/commit/cfe39ef8f4f1799e8a2bb8ecae080bf6276c9c9c))
* **#219:** 平台 Profile 模型与加载器 + TikTok Profile 落地（ticket 01） ([b4cb55d](https://github.com/0xPabloLI/inside-china-ai/commit/b4cb55d18ee2c8cc2f35756b7c18377d29f91e5a))
* **#225:** 优化点 1——媒体轨与语音轨并行（Promise.all join 后过 1.6 gate） ([f022ca6](https://github.com/0xPabloLI/inside-china-ai/commit/f022ca68aab91e4ded011e6711724ccd6d3537f5))
* **#225:** 步骤耗时 profiler 落地——main.mjs 全链路打点 ([161cda4](https://github.com/0xPabloLI/inside-china-ai/commit/161cda4b800aab4c01b5a9fd6afe6c3b71f52e53))
* **#226:** search-pool 集成 web-access/web-deep-research + NPU 适配成果 + 多轮调研文档 ([59a787e](https://github.com/0xPabloLI/inside-china-ai/commit/59a787eb339b5e7a9667a7d7be6e82043d912450))
* **#269:** CDP 自动化 profile 落代码级守卫 + 登录态复测 + 微信登录工具固化 ([55307bd](https://github.com/0xPabloLI/inside-china-ai/commit/55307bd1839be3d0d4a6585bf52105b118b70488))
* **#269:** 清扫 CLI 加 --out，防同日重跑覆盖证据 ([9677961](https://github.com/0xPabloLI/inside-china-ai/commit/9677961501ad73fe0d47fc7838c697374d434db8))
* **#269:** 清扫覆盖面扩到 55 源 + listing 源分类器修正 ([9392756](https://github.com/0xPabloLI/inside-china-ai/commit/9392756bcae6265ac250baa5e51b1e3fcb903638))
* **#269:** 逐源修复方法论 + 搜索 URL 全量清扫工具 ([fcdf917](https://github.com/0xPabloLI/inside-china-ai/commit/fcdf917da2b6f4c91f3982fd5dea34b3c3b04b07))
* **#309:** live probes + news-contract shortest path — parser dates, pool toArticle ISO, engine news params ([96021da](https://github.com/0xPabloLI/inside-china-ai/commit/96021dadd83f4e52fda8247d0bea3b4f2c09830b))
* **api:** add /api/health liveness endpoint ([7c0c585](https://github.com/0xPabloLI/inside-china-ai/commit/7c0c585576448b1e9868401df4f03965583ead8a))
* **b-roll:** [#240](https://github.com/0xPabloLI/inside-china-ai/issues/240) 批内 prompt 预编码 warm-up——每批 1 次 UMT5 加载 + 失败隔离固化 ([d0d9ac7](https://github.com/0xPabloLI/inside-china-ai/commit/d0d9ac7b69a64d357d3cfbd640fcf9c3b747e7c3))
* **b-roll:** [#249](https://github.com/0xPabloLI/inside-china-ai/issues/249) 限流源跳过换源（cap 等待 &gt;15s → skip）+ 百度图片/视频 backup 源 ([62053bb](https://github.com/0xPabloLI/inside-china-ai/commit/62053bb179d0a98423a8d963317c8a3e861fb7de))
* **b-roll:** switch T2I default to Boogu Image Turbo (Apache 2.0) ([d727428](https://github.com/0xPabloLI/inside-china-ai/commit/d727428a00975df28c1866c2cc19ed2797aec172))
* **cdp:** guard the proxy against concurrent pipeline load ([#273](https://github.com/0xPabloLI/inside-china-ai/issues/273) P0.2) ([8e8dd90](https://github.com/0xPabloLI/inside-china-ai/commit/8e8dd907e6c90344bedfc7c9bb951e80148f36d7))
* **ci:** delivery-record ledger — label state machine + recheck + sweep ([#315](https://github.com/0xPabloLI/inside-china-ai/issues/315)) ([ed19fe9](https://github.com/0xPabloLI/inside-china-ai/commit/ed19fe9e5634120bcfa2879bfe2af26b2dd8cb10))
* **dh:** presenter face 默认化 + 卡片描边/淡入 + [#224](https://github.com/0xPabloLI/inside-china-ai/issues/224) 半身像立票 ([accc064](https://github.com/0xPabloLI/inside-china-ai/commit/accc06428768a92dd6ef1fff68a072db6c7fb6ab))
* **dh:** run --force 一步清两处状态强制重生成 ([#233](https://github.com/0xPabloLI/inside-china-ai/issues/233)) ([1732086](https://github.com/0xPabloLI/inside-china-ai/commit/1732086c83edc8a30d39a8c6417f5b2359925630))
* **dh:** 使用策略调研结论落码 — plan 警告三件套 + guide 策略节 ([6e99638](https://github.com/0xPabloLI/inside-china-ai/commit/6e99638a9e7a3cc4c6affb481e27fa098afbe16a))
* **env:** TTS/渲染环境固化——wheels Dataset 快速路径 + 锁版 + .nvmrc ([#231](https://github.com/0xPabloLI/inside-china-ai/issues/231) 部分) ([997ec35](https://github.com/0xPabloLI/inside-china-ai/commit/997ec35a7ab9a6adde59001ed31b7f66ba688392))
* **guards:** three machine guards for tracker + test hygiene ([#321](https://github.com/0xPabloLI/inside-china-ai/issues/321)) ([0d5663d](https://github.com/0xPabloLI/inside-china-ai/commit/0d5663df696f1cc01fe81b9f90edd694a9c1a6b2))
* **health:** selector-health --fallback 巡检 + chrome-error 网络层定界（[#337](https://github.com/0xPabloLI/inside-china-ai/issues/337)） ([b733d91](https://github.com/0xPabloLI/inside-china-ai/commit/b733d91eff67788dc22f6da66c1c903f8e7ac554))
* **knowledge:** 公司关系图谱 SSOT——68 实体数据层接管 hashtag/实体色/写稿表述 ([#248](https://github.com/0xPabloLI/inside-china-ai/issues/248)) ([e2d1563](https://github.com/0xPabloLI/inside-china-ai/commit/e2d15631df6c50f0d06c9fb9e2d8a63235b0eeb1))
* **logging:** structured logger with centralized secret scrubbing ([71d9da2](https://github.com/0xPabloLI/inside-china-ai/commit/71d9da2ea7976b10f9a684f01fa6d1947609fad0))
* **preflight:** fail on missing TTS instruct coverage ([#273](https://github.com/0xPabloLI/inside-china-ai/issues/273) P1.3, [#270](https://github.com/0xPabloLI/inside-china-ai/issues/270)) ([511c176](https://github.com/0xPabloLI/inside-china-ai/commit/511c1767184511dc5dd87cecc20bf51c9f18d40d))
* **publish:** [#219](https://github.com/0xPabloLI/inside-china-ai/issues/219) T02 发布包生成器 Profile 化 + publish/{platform}/ 目录迁移 ([087395b](https://github.com/0xPabloLI/inside-china-ai/commit/087395b90e458ba8aa9b29c89702fac5ce4dd3a9))
* **publish:** [#219](https://github.com/0xPabloLI/inside-china-ai/issues/219) T03 发布器 Profile 化——设置/manual guide 单源 + 发布 HITL 门 ([34911d1](https://github.com/0xPabloLI/inside-china-ai/commit/34911d1543877c4ede01db71e5f218c83603f3bc))
* **remotion:** assetNeed 显式媒体覆盖 CSS-only 布局 + circle 标注参数化 ([fa40d33](https://github.com/0xPabloLI/inside-china-ai/commit/fa40d3318b1aa41bae106d7d710d623e7daa148b))
* **research:** fetch the 3 environmentalSignals in research mode ([#309](https://github.com/0xPabloLI/inside-china-ai/issues/309) §C) ([d0f2ea0](https://github.com/0xPabloLI/inside-china-ai/commit/d0f2ea0bfbd80f3a017acf808ad04cf720ec5f63))
* **scripts:** unified entry-point env loader lib/load-env.mjs ([#287](https://github.com/0xPabloLI/inside-china-ai/issues/287)) ([9090484](https://github.com/0xPabloLI/inside-china-ai/commit/90904843aa5ab421ee307ea3c90512d397ccbc96))
* **search-pool:** 搜索池消费方式从 MCP 常驻改为 skill + 按需 CLI ([#265](https://github.com/0xPabloLI/inside-china-ai/issues/265)) ([948bb02](https://github.com/0xPabloLI/inside-china-ai/commit/948bb02c00a7a79f7ec68f00ed140a7af9ecc343))
* **search:** add weibo_search keyword source via CDP ([#317](https://github.com/0xPabloLI/inside-china-ai/issues/317)) ([32d173e](https://github.com/0xPabloLI/inside-china-ai/commit/32d173e64d58f5e9a308e60fe810156ba3cae728))
* **search:** promote site: fallbacks, retire Grok bridge from material sources ([#309](https://github.com/0xPabloLI/inside-china-ai/issues/309)) ([bc34f67](https://github.com/0xPabloLI/inside-china-ai/commit/bc34f675522cc5faf4c1fedf500f7d782e9a6ed5))
* **search:** retire Grok MCP bridge — Bigsong direct + explicit pool eligibility ([#307](https://github.com/0xPabloLI/inside-china-ai/issues/307)) ([2f97be9](https://github.com/0xPabloLI/inside-china-ai/commit/2f97be912a98e616ff07dae31635e87a72109c5b))
* **search:** 死源检测 + 跳过标记——源 URL 前置探针、关键词相关性护栏、quarantine 生命周期 ([#269](https://github.com/0xPabloLI/inside-china-ai/issues/269) Phase 1) ([57b05ec](https://github.com/0xPabloLI/inside-china-ai/commit/57b05ec61fbffbbb810a68f8821f192a322b1244))
* **sources:** pool parse-drop alert and engine zero streaks ([#305](https://github.com/0xPabloLI/inside-china-ai/issues/305)) ([e73bb6b](https://github.com/0xPabloLI/inside-china-ai/commit/e73bb6b19b282cf41bc2dbe0961bfe7b4fa71e3e))
* **sourcing:** persistent 412 backoff guard for the yt-dlp channel ([319dd8c](https://github.com/0xPabloLI/inside-china-ai/commit/319dd8c0410eb9a8c23a1a7d377acda71b2a8fd6))
* **tracker:** claim-issue.sh 强制读评论 gate + 业界调研 ([#258](https://github.com/0xPabloLI/inside-china-ai/issues/258)) ([f50f9f9](https://github.com/0xPabloLI/inside-china-ai/commit/f50f9f924430a9260e1bf86c31d44a89c0f000d3))
* **tts:** [#232](https://github.com/0xPabloLI/inside-china-ai/issues/232) 对齐守卫——尾词后硬切 + crushed-word sanity ([4a4b139](https://github.com/0xPabloLI/inside-china-ai/commit/4a4b139844a1490e08fd1c0506b15f1cc63c1e5d))
* **tts:** [#235](https://github.com/0xPabloLI/inside-china-ai/issues/235) 旁白语速落地第一片——per-scene native speed 补差 + 缓存 key ([4a0a57b](https://github.com/0xPabloLI/inside-china-ai/commit/4a0a57bd7772ce49f24c7f68b2ece3f7ba8a99a6))
* **tts:** [#241](https://github.com/0xPabloLI/inside-china-ai/issues/241) Kaggle 批量 push 契约固化 + RUNNING 预算 30min + 缺音频 fail-closed ([3cc96e2](https://github.com/0xPabloLI/inside-china-ai/commit/3cc96e23ad735e5c12d9a986b3aaf490badf00a1))
* **tts:** [#244](https://github.com/0xPabloLI/inside-china-ai/issues/244) hook anchor instruct 全后端替换 + instruct 进缓存 key ([bffcf33](https://github.com/0xPabloLI/inside-china-ai/commit/bffcf33ed280e8eb545480d55ef1c6d9991ecc58))
* **tts:** [#244](https://github.com/0xPabloLI/inside-china-ai/issues/244) hook speed floor 1.1——带内 hook 补差，1.0 禁出成品 ([9773f84](https://github.com/0xPabloLI/inside-china-ai/commit/9773f84f99c3aabbddb576b54b32900afb937ed4))
* **tts:** ASR 升级 max-effort 默认 + whisper.cpp 后端 + 罗马数字版本号等价匹配 ([#251](https://github.com/0xPabloLI/inside-china-ai/issues/251)) ([3aa1aa7](https://github.com/0xPabloLI/inside-china-ai/commit/3aa1aa70e1cda63b0a48ee61b13b650bc3e6b981))
* **tts:** Kaggle kernel 按 slug 排队协调——QUEUED/RUNNING 分相轮询 + 独立排队超时 ([#250](https://github.com/0xPabloLI/inside-china-ai/issues/250)) ([3435cc7](https://github.com/0xPabloLI/inside-china-ai/commit/3435cc7360e1584d4a1a478a93577ebd0b514ee7))
* **tts:** make the TTS instruct standard a single source every engine inherits ([#270](https://github.com/0xPabloLI/inside-china-ai/issues/270)) ([3d9f616](https://github.com/0xPabloLI/inside-china-ai/commit/3d9f616e95947ab6d6c0f02f74f6c0e827c613c3))
* **tts:** measured-WPM pacing feedback loop, cancel hook/narrative static pair ([#252](https://github.com/0xPabloLI/inside-china-ai/issues/252)) ([a2edec5](https://github.com/0xPabloLI/inside-china-ai/commit/a2edec563295439ab7952aa50ffc0d972e9ac28d))
* **tts:** re-validate the resolved instruct at the Quality Gate ([#270](https://github.com/0xPabloLI/inside-china-ai/issues/270)) ([e75a583](https://github.com/0xPabloLI/inside-china-ai/commit/e75a583729a89581fd4957e3aa84011bc9535cfd))
* **tts:** 四维 Prompt 标准 + Quality Gate 复合 Token 解包对齐 100% 词准 ([#234](https://github.com/0xPabloLI/inside-china-ai/issues/234)) ([7a61629](https://github.com/0xPabloLI/inside-china-ai/commit/7a61629f8b51bf36c5b9550655593f63b6c17f0a))
* **vlm:** qwen38_vlm_wrapper 长视频分段分析（&gt;8s 自动切分合并） ([bbf7bc1](https://github.com/0xPabloLI/inside-china-ai/commit/bbf7bc1700c24eac250b4ea19206d2def2e61749))


### Bug Fixes

* **#155:** review findings —— IMAGE_GENERATING_STRATEGIES 单源导入 + 图像策略文案对齐 ([5dc368a](https://github.com/0xPabloLI/inside-china-ai/commit/5dc368a311844fde72c98b908d5ea301c0d98f19))
* **#155:** 图像策略报告/CLI 提示词对齐 —— 摘要 fix 命名 aiImage.prompt(6 维)+ Step 1.5d/help 文案补 T2I ([3321f48](https://github.com/0xPabloLI/inside-china-ai/commit/3321f48685e7006b696c7ea64414a9076a2d5e33))
* **#155:** 撤回 qwen4-preview fixture scene 11 —— 顶破 6-10 场景 preflight 上限 ([c68f717](https://github.com/0xPabloLI/inside-china-ai/commit/c68f71737b253451f1bd9b8939594d4e6d2f215d))
* **#214 T6b/T6c:** 帧审计真机校准 + E2E 收官 —— 三关实测定性重校准全绿 ([030fba9](https://github.com/0xPabloLI/inside-china-ai/commit/030fba9c0a1f064946d337181c647b677ce2703e))
* **#214 T6:** Kaggle 挂载约定漂移 —— 数据集挂在 /kaggle/input/datasets/ 下 ([d46981f](https://github.com/0xPabloLI/inside-china-ai/commit/d46981f4443d83713f45c3a8d68990712ad5f7aa))
* **#214 T6:** kernel 模板占位符只替换了 docstring 处 —— 代码行原样上天 ([9ed18e6](https://github.com/0xPabloLI/inside-china-ai/commit/9ed18e6a3ec47ed1e1a1ea76fdc528c535e37220))
* **#214 T6:** unit kernel 缺 sys.path.insert(0, CUSTOM_DIR) ([63eaf4e](https://github.com/0xPabloLI/inside-china-ai/commit/63eaf4ec1a8f72d46d3ea07729527eb8a9b1d2e5))
* **#214 T6:** v52 kernel 三连修 —— 上游漂移补丁 + OOM 语义恢复 + 输出列表污染 ([4e442b3](https://github.com/0xPabloLI/inside-china-ai/commit/4e442b346b144c36a2f72ee9e536eb8bdff02399))
* **#219:** review fixes——shape 校验补齐 cover/video 数值 + 收敛导出面 + 文档漂移锚 ([7fd04f4](https://github.com/0xPabloLI/inside-china-ai/commit/7fd04f4a32cfc2a68a8904c8db50078ba6d5c541))
* **#225:** dh-pilot-qwen4 数字人照片修正回写 + scene-10 重生成资产 ([18726af](https://github.com/0xPabloLI/inside-china-ai/commit/18726af7da6386dd264c32ce0edf084c83883871))
* **#225:** review findings——缓存标记透传 + 失败路径计时保真 + DI 收敛 ([295fb53](https://github.com/0xPabloLI/inside-china-ai/commit/295fb5316ce774eef9f8b3fb0fcfa07b50ec38ea))
* **#225:** scene-7 声明 refStyle=data——A/B 实证 data instruct 完整念出数字句 ([e8508bb](https://github.com/0xPabloLI/inside-china-ai/commit/e8508bbf46d39462532ee31dac906b33daf15c40))
* **#269:** cdp-wx-login 参数解析支持 `--source <key>` 空格形式 ([06302f6](https://github.com/0xPabloLI/inside-china-ai/commit/06302f6ec6eabae9885cbdf7812b4ab217f22c3e))
* **#269:** douyin / thepaper 源修复 + 反爬假阳生产缺陷 + 补「抽取层」第三轴 ([6751ac7](https://github.com/0xPabloLI/inside-china-ai/commit/6751ac7e81c6b14ade37ee06aeeeb48d391e0590))
* **#269:** selector-health 判决修正——SPA 水合竞态与晚到反爬插页不再造成假判决 ([4f943b0](https://github.com/0xPabloLI/inside-china-ai/commit/4f943b04104506b5b8fb1dd45e8058bdb24f9d18))
* **#269:** 四轴定案——抽取层优先 + 驱动搜索框回收 registry 行 + 探针无路由分诊 ([2bc41b8](https://github.com/0xPabloLI/inside-china-ai/commit/2bc41b8a9c6e65da4f6996471971c1b4842c8e27))
* **#269:** 探针判据分词汇表 + CDP 二轮复检（[#331](https://github.com/0xPabloLI/inside-china-ai/issues/331)/[#333](https://github.com/0xPabloLI/inside-china-ai/issues/333) 落地） ([bdfc2ce](https://github.com/0xPabloLI/inside-china-ai/commit/bdfc2ced72b5e92b1cd0cef81c6ef10e8e9b32b8))
* **#269:** 清扫 CLI 加载 .env.local（loadEnv + --env 覆盖） ([7d3073e](https://github.com/0xPabloLI/inside-china-ai/commit/7d3073ee582d887bb32b8ec881b21811e5c51708))
* **#269:** 轴 3 的凭据入口补齐——api 源不再「没给 key」被判成端点已死 ([7c24926](https://github.com/0xPabloLI/inside-china-ai/commit/7c249260e3cacb6e12a76cd2d78d268907e2bde2))
* **#308:** surface CDP extraction script errors — proxy passthrough, ScriptError, script-error trajectory ([b28bdbf](https://github.com/0xPabloLI/inside-china-ai/commit/b28bdbffbc60a34302a1b2c6a9ab3af666886169))
* **analytics:** pending-analysis.json 在 manual-guide 档落笔，修复发布后永不写入的断链 ([#260](https://github.com/0xPabloLI/inside-china-ai/issues/260)) ([91747ec](https://github.com/0xPabloLI/inside-china-ai/commit/91747ec9c45fd1146b84fa09f362873c88234db6))
* **analytics:** tiktok-video-details 去 locale 硬编码 + 零产出 fail-loud ([d3f9782](https://github.com/0xPabloLI/inside-china-ai/commit/d3f978206adfc27c2f23702320ecc342d6cbbcd8))
* **assets:** gated assignment fail-closed — unbound fallback assets never assigned ([#297](https://github.com/0xPabloLI/inside-china-ai/issues/297)) ([a4ce959](https://github.com/0xPabloLI/inside-china-ai/commit/a4ce959e7fb40cded09468e13d7ba8ef6face778))
* **assets:** read youtube yt-dlp downloads' cookies from Chrome ([#313](https://github.com/0xPabloLI/inside-china-ai/issues/313)) ([9760bda](https://github.com/0xPabloLI/inside-china-ai/commit/9760bdabe77dfa6cefdd9f0e3ec46af0fda8235b))
* **assets:** rebuild coverr download URL from free rendition direct links ([#312](https://github.com/0xPabloLI/inside-china-ai/issues/312)) ([bfaf4da](https://github.com/0xPabloLI/inside-china-ai/commit/bfaf4daff4f1978832d81312446f0e6d2adc544b))
* **ci:** generate route tree before type check ([d2c4405](https://github.com/0xPabloLI/inside-china-ai/commit/d2c4405f3d3416c19b3f80807e0bd7722afaa3a2))
* **ci:** grandfather pre-cutoff closures out of the delivery-record ledger ([#315](https://github.com/0xPabloLI/inside-china-ai/issues/315)) ([5507c66](https://github.com/0xPabloLI/inside-china-ai/commit/5507c6627e34b1446df7c052afee4c077083f633))
* **ci:** install ffmpeg for audio test suites ([2ba4140](https://github.com/0xPabloLI/inside-china-ai/commit/2ba41403e88552b93bbe38576a3b8b5223f7b903))
* **ci:** read event name via context.eventName inside github-script ([bfb2264](https://github.com/0xPabloLI/inside-china-ai/commit/bfb22641ff0e70f830ec1ec8ce42670651875839))
* **ci:** remove dup hasRecord in recheck — compile gate added ([#315](https://github.com/0xPabloLI/inside-china-ai/issues/315)) ([cac72eb](https://github.com/0xPabloLI/inside-china-ai/commit/cac72eb24fdec2072a755fc44dbb18e61a59b0c7))
* **ci:** run quality job on macOS arm64 to match the dev platform ([34f7721](https://github.com/0xPabloLI/inside-china-ai/commit/34f77210e8f82ded9d5807f80626e27687c37a85))
* **ci:** sync package-lock with [@emnapi](https://github.com/emnapi) entries so npm ci works ([ba86840](https://github.com/0xPabloLI/inside-china-ai/commit/ba86840c9de56f1804fcdc34aaa6f63748136a01))
* **ci:** use npm install instead of npm ci ([b9768c5](https://github.com/0xPabloLI/inside-china-ai/commit/b9768c57e8b160e84fc6916211eda70f276e1e10))
* **ci:** 文档门禁的轮换豁免正则是死代码——真实行形态从来没被匹配过 ([4e9d09e](https://github.com/0xPabloLI/inside-china-ai/commit/4e9d09e13fed003d5b523f9b6b3603e6a6fc994f))
* **ci:** 清 knip finding——删 playwright-core + 配置化 remotion 包 + 收敛过时 ignore ([c62ec34](https://github.com/0xPabloLI/inside-china-ai/commit/c62ec340d3bd756c263fa3d167ea66fdfeaf2c6b)), closes [#330](https://github.com/0xPabloLI/inside-china-ai/issues/330)
* claim gate assigns explicit login with read-back assertion ([#311](https://github.com/0xPabloLI/inside-china-ai/issues/311)) ([3ece3c4](https://github.com/0xPabloLI/inside-china-ai/commit/3ece3c4e1718f1fd3c8485d6f9f72aa0b07b745a))
* **content:** add mediaStrategy + aiVideo.prompt to all anthropic-distillation scenes ([7c49803](https://github.com/0xPabloLI/inside-china-ai/commit/7c498035a1b136b7ef01dd2a58488d8981a88296))
* **dh:** AvatarCard 移除 loop（念完嘴仍动）+ DH_KERNEL_TAG 强制重生成绕行 ([0f84ae4](https://github.com/0xPabloLI/inside-china-ai/commit/0f84ae41623106155f2e71ce9c1e902d95360db0))
* **docs:** cloud-gpu-options AMD!GB 笔误修正为 AMD GPU ([fd9a83e](https://github.com/0xPabloLI/inside-china-ai/commit/fd9a83e9d5af35b3d56959c93f33ccdcddd742b9))
* **env:** ~/bin 隧道脚本不能是软链（launchd 无 TCC 授权）+ 加同步入口 ([2a132c8](https://github.com/0xPabloLI/inside-china-ai/commit/2a132c8df24940778bbf0abb36c5b89b168a00c7))
* **env:** colima 隧道恢复自愈 + session 基线改用 origin/main ([f44b117](https://github.com/0xPabloLI/inside-china-ai/commit/f44b1179a6e60345aeb26f46f811e7413bffb171))
* **hashtags:** map ant-group and amd in ENTITY_HASHTAG_MAP and entity aliases ([8e2cc06](https://github.com/0xPabloLI/inside-china-ai/commit/8e2cc06b68f3dcd15a8e6d8ccd1a2a4fc6010090))
* **health:** searxng_search 误判修复 + 体检「生产可用」兜底接管口径 ([d4f4343](https://github.com/0xPabloLI/inside-china-ai/commit/d4f4343ca11e266ee767765e67c602e426dbe098))
* **hooks:** block foreign-commit drops when a second worktree proves a parallel writer ([918c7e8](https://github.com/0xPabloLI/inside-china-ai/commit/918c7e89b8ab73f8860ce487f9c57badd15396e5))
* **kernels:** 模型源选型定则——国外云主选 HF，国内云主选 ModelScope ([837f3c4](https://github.com/0xPabloLI/inside-china-ai/commit/837f3c48c10baf22955241167d2437ce718f6349))
* **lint:** ignore research-mirror .venvs stalling the full-repo run ([fed4092](https://github.com/0xPabloLI/inside-china-ai/commit/fed4092678cb38b8c3cb2bcb0db272f30f2173ba))
* **main:** restore 17 paths clobbered by Lovable merge d32b470 ([680c172](https://github.com/0xPabloLI/inside-china-ai/commit/680c172a351d03e459c28792d17f6bbbd3d04c39))
* **media:** CDP preflight 硬门 + 搜索缓存即时落盘 ([3aa91e6](https://github.com/0xPabloLI/inside-china-ai/commit/3aa91e6be9a7f7a642e0fe00283eb079eba8ef1c))
* **pipeline:** fail closed when an avatar clip is shorter than its voiceover ([#272](https://github.com/0xPabloLI/inside-china-ai/issues/272)) ([9ec0489](https://github.com/0xPabloLI/inside-china-ai/commit/9ec0489d1167e226dd68b6e83f833d9f7e8ebacd))
* **pipeline:** fail closed when an avatar clip is shorter than its voiceover ([#272](https://github.com/0xPabloLI/inside-china-ai/issues/272)) ([4c4df6e](https://github.com/0xPabloLI/inside-china-ai/commit/4c4df6eaebcb7bc74572b92ff678c6cdb3861c70))
* **pipeline:** main.mjs 完成后优雅退出——关停常驻 ASR worker + 强制 exit ([#254](https://github.com/0xPabloLI/inside-china-ai/issues/254)) ([56bc8fc](https://github.com/0xPabloLI/inside-china-ai/commit/56bc8fcc3e1702bd42e1e5a0341a808529b09ae8))
* **remotion:** HookScene source slot 底边贴合 band 触发 container-overflow 0.277px ([#255](https://github.com/0xPabloLI/inside-china-ai/issues/255)) ([9e02c05](https://github.com/0xPabloLI/inside-china-ai/commit/9e02c056be81b775c9c64b121ba5302a74860fab))
* **review:** address code-review findings on readiness commits ([eb64e5d](https://github.com/0xPabloLI/inside-china-ai/commit/eb64e5d9efecb267a493b1507f317cc0dc0434f2))
* **scripts:** googleSiteFallback opens the Google page again — capabilities no longer shadow it ([#292](https://github.com/0xPabloLI/inside-china-ai/issues/292)) ([f3d10ba](https://github.com/0xPabloLI/inside-china-ai/commit/f3d10baa4176e9cc0d37b03cb9605f5f17062e45))
* **scripts:** map Serper link/snippet vocabulary in pool parseArticles ([#281](https://github.com/0xPabloLI/inside-china-ai/issues/281)) ([ef44779](https://github.com/0xPabloLI/inside-china-ai/commit/ef447798a8b12939d308c858cef2f1ffa15b04a5))
* **scripts:** pool runs before the Grok last resort — x_search pool-eligible via Bigsong bridge ([#292](https://github.com/0xPabloLI/inside-china-ai/issues/292)) ([d34b207](https://github.com/0xPabloLI/inside-china-ai/commit/d34b2070ce0b6e38045fff7b4d1846c6245073ed))
* **scripts:** publish-tiktok Supabase save resolved a nonexistent path ([14e5d4b](https://github.com/0xPabloLI/inside-china-ai/commit/14e5d4bd8a1de74ff30b0b287ed25372e84f6151))
* **scripts:** x_search exits the pool — platform-faithful chain per [#292](https://github.com/0xPabloLI/inside-china-ai/issues/292) verdict (2026-09-15) ([6021ad0](https://github.com/0xPabloLI/inside-china-ai/commit/6021ad0ffa4b6eb0aea12a2d972d8e5cd81bfa1b))
* **search-pool:** 测试断言跟上 [#226](https://github.com/0xPabloLI/inside-china-ai/issues/226) 引擎扩展——opts.engines 钉链 + 补 Serper 覆盖 ([2ecbc26](https://github.com/0xPabloLI/inside-china-ai/commit/2ecbc26970a45030b5ab680a831ca68833a9bfd4)), closes [#229](https://github.com/0xPabloLI/inside-china-ai/issues/229)
* **search:** pin mcp_grok_search output contract — mapper parses it ([#307](https://github.com/0xPabloLI/inside-china-ai/issues/307) follow-up) ([e6f7cbb](https://github.com/0xPabloLI/inside-china-ai/commit/e6f7cbb1d70d0111ff4d4dbf64461f229eaeb4e4))
* **search:** skip the [#269](https://github.com/0xPabloLI/inside-china-ai/issues/269) pre-flight probe for needsAuth sources ([#317](https://github.com/0xPabloLI/inside-china-ai/issues/317)) ([f7e18df](https://github.com/0xPabloLI/inside-china-ai/commit/f7e18df9302a3392d7ce523d3fdaa28b3cd0fe5e))
* **search:** stop unauthenticated probes judging login-gated sources ([#285](https://github.com/0xPabloLI/inside-china-ai/issues/285)) ([47fbeaf](https://github.com/0xPabloLI/inside-china-ai/commit/47fbeaf2d412b556815a6926fff1ef1742b96357))
* **search:** weibo_search time extraction survives the live DOM ([#317](https://github.com/0xPabloLI/inside-china-ai/issues/317)) ([866a90e](https://github.com/0xPabloLI/inside-china-ai/commit/866a90e0484572c06a190111d9d97613dd0d27e5))
* **skills:** break search-pool Route C circular reference into web-access ([#284](https://github.com/0xPabloLI/inside-china-ai/issues/284)) ([4c8e92c](https://github.com/0xPabloLI/inside-china-ai/commit/4c8e92c6e7ee27b70cb69830dc3f4a86f0a08ad2))
* **skills:** polish [#284](https://github.com/0xPabloLI/inside-china-ai/issues/284) wording after dual-axis review ([0340949](https://github.com/0xPabloLI/inside-china-ai/commit/03409494ddd15c769439ac979fbdc64410444782))
* **source-url-discover:** URL 对齐审计模式 + classifyUrlDiff ([ffed09b](https://github.com/0xPabloLI/inside-china-ai/commit/ffed09b067fecda447afd950f1c906b59da653e9))
* **sources:** digg_search 降级 Google site:digg.com 主层（[#269](https://github.com/0xPabloLI/inside-china-ai/issues/269) Round I 续） ([06eaa3b](https://github.com/0xPabloLI/inside-china-ai/commit/06eaa3bd2768b7de70097644e17a52c692aac776))
* **sources:** polymarket 搜索重定向修复 + duckduckgo 标记放弃（[#269](https://github.com/0xPabloLI/inside-china-ai/issues/269) Round I 续） ([9391b0f](https://github.com/0xPabloLI/inside-china-ai/commit/9391b0f156a7c7a35c3eb3899ecc347849779457))
* **sources:** techmeme_search / wechat_dongchabeating 换 h3 抽取（Google SERP legacy 块失效） ([4047051](https://github.com/0xPabloLI/inside-china-ai/commit/40470517f74133f06395967bafdd4c860282677f)), closes [#336](https://github.com/0xPabloLI/inside-china-ai/issues/336)
* **sourcing:** ytdlp-guard review fixes — anchor 412 match, reset ladder on expiry ([78a7952](https://github.com/0xPabloLI/inside-china-ai/commit/78a7952e2ee4cc9429224e786631dd3ffd1fbbb4))
* **tests:** cut the last real-network test dependencies ([#317](https://github.com/0xPabloLI/inside-china-ai/issues/317) follow-up) ([95a28b4](https://github.com/0xPabloLI/inside-china-ai/commit/95a28b4e1a94ad243168a02370777080385ae826))
* **tests:** make media-bg and visual-analyzer-pool suites portable ([5e1c97b](https://github.com/0xPabloLI/inside-china-ai/commit/5e1c97bcdd24ec5b6bfcbf99d7d965e99216d115))
* **tests:** 清零 9 个预存测试失败——三个陈旧测试桩 + 一个漏掉的可测性 seam ([d13cd7f](https://github.com/0xPabloLI/inside-china-ai/commit/d13cd7fd26772aa59c0be7613bcab274852c89d9))
* **tts,#225:** CosyVoice3 Kaggle 模型 Dataset 化 — 挂载替代在线下载 ([e29ed9a](https://github.com/0xPabloLI/inside-china-ai/commit/e29ed9a293d930430bacd8f6bba8a0c74d07f18b))
* **tts,#227:** 千分位数字 TTS 输入剥离逗号 — CosyVoice 断词根因修复 ([6d48180](https://github.com/0xPabloLI/inside-china-ai/commit/6d481804af4a650a017bccb274575777bdabfefb))
* **tts:** [#244](https://github.com/0xPabloLI/inside-china-ai/issues/244) hook floor 改为下界语义——不把 env/手设 override 拉回 1.1 ([74c6885](https://github.com/0xPabloLI/inside-china-ai/commit/74c68858ac33bef8ad1090e076ab124395b750f8))
* **tts:** CosyVoice3-MLX S3 tokenizer /tmp 依赖守卫（静默 0s 空音频） ([a63f688](https://github.com/0xPabloLI/inside-china-ai/commit/a63f688707443c37dcc2591465a32bcd6bfa53a1))
* **tts:** CosyVoice3-MLX 认领 _000 分块输出——新鲜 take 被 stale 文件顶替 ([49c328b](https://github.com/0xPabloLI/inside-china-ai/commit/49c328bfecb5708f68f7b41cafdbb85ebbb145df))
* **tts:** derive Kaggle kernel slug from content id, fail-fast without it ([#267](https://github.com/0xPabloLI/inside-china-ai/issues/267)) ([bb99899](https://github.com/0xPabloLI/inside-china-ai/commit/bb99899299ec5d36545d74eb58a4ed31d4e44cb6))
* **tts:** Kaggle 环境固化 + TTS Quality Gate 与自愈重试 + 口播双轨支持 ([#234](https://github.com/0xPabloLI/inside-china-ai/issues/234)) ([79c6d3a](https://github.com/0xPabloLI/inside-china-ai/commit/79c6d3a5e0fb784bf0aa8705c0c12f03ac15805d))
* **tts:** name the speed levers in the pacing floor block ([#271](https://github.com/0xPabloLI/inside-china-ai/issues/271) follow-up) ([bed1366](https://github.com/0xPabloLI/inside-china-ai/commit/bed1366328d4e0edcde96d6929e83a6974770498))
* **tts:** split Quality-Gate failures into pacing vs acoustic and fail closed ([#271](https://github.com/0xPabloLI/inside-china-ai/issues/271)) ([fd71d04](https://github.com/0xPabloLI/inside-china-ai/commit/fd71d04a4b802680aec34d9bee297d25526c575d))
* **tts:** 自动 fallback 链截断至 f5-mlx，qwen/edge/say 仅人工指定 ([2a36a48](https://github.com/0xPabloLI/inside-china-ai/commit/2a36a48fbf6d28c53819c6f6f4d776131f7950dc))
* **verify:** final frame 帧数 clamp 到实际视频帧数 ([4d6ebd4](https://github.com/0xPabloLI/inside-china-ai/commit/4d6ebd4aebbbcba2681074ba14674199f442d70c))
* **video:** hand yt-dlp the system proxy so --download-sections survives a proxied CDN ([#324](https://github.com/0xPabloLI/inside-china-ai/issues/324)) ([a94f1f3](https://github.com/0xPabloLI/inside-china-ai/commit/a94f1f3858ca1a343376d662276104fdd799ff76))
* **video:** resolve yt-dlp container-suffixed output — webm fallback no longer misreports file not found ([#323](https://github.com/0xPabloLI/inside-china-ai/issues/323)) ([753caee](https://github.com/0xPabloLI/inside-china-ai/commit/753caeef0ffe97040adeef9a2ec1f9a121d43b57))
* **video:** stop caching a failed system-proxy read, escape the --proxy value ([#324](https://github.com/0xPabloLI/inside-china-ai/issues/324)) ([3321cb2](https://github.com/0xPabloLI/inside-china-ai/commit/3321cb2d4df0a3e964606035077e616cc7fda9cf))


### Reverts

* restore tiktok-csi.mjs - deletion swept into c862428 by index pollution ([a490b64](https://github.com/0xPabloLI/inside-china-ai/commit/a490b64f326b34b34cb88167ac4d061ed1720f00))
