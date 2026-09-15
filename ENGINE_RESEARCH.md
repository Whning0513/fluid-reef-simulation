# 流体引擎调研与选型

调研日期：2026-09-09。目标不是泛泛比较渲染效果，而是匹配本项目的四个硬条件：三维自由液面、复杂礁石几何、完全浸没的周期移动边界、可在当前 RTX 4060 Laptop GPU 上运行。

## 结论

主后端选择 **DualSPHysics 5.4.3**，网页 Three.js 浅水模型保留为实时预览。DualSPHysics 官方列出的能力正好包括单相自由液面 SPH、NVIDIA GPU、STL/PLY/VTK CAD 导入、对物体施加预定义运动、活塞式造波和等值面后处理：[功能页](https://dual.sphysics.org/features/)、[运行与预处理说明](https://github.com/DualSPHysics/DualSPHysics/wiki/5.-Running-DualSPHysics)。官方当前下载版本为 5.4.3（2025 年 3 月发布，软件包在 2025-05-22 更新）：[下载页](https://dual.sphysics.org/downloads/)。

这一路线的物理精度显著高于网页高度场：水体在完整三维空间中由 WCSPH 粒子表示，能处理绕礁流、孔内流动、非单值自由液面和局部飞溅。代价是它不再是浏览器实时模拟，需要离线 GPU 计算和后处理。

## 候选比较

| 引擎 | 方法与优势 | 本项目的主要问题 | 结论 |
|---|---|---|---|
| DualSPHysics 5.4.3 | 面向海岸/海洋自由液面，GPU SPH；现成移动边界、CAD 导入、造波与测量工具 | 完整二进制包需在官网下载；高分辨率计算耗时 | **采用** |
| SPlisHSPlasH 2.18 | 多种现代 SPH 压力求解器、刚体边界、场景文件、Python 绑定；可启用双精度和 GPU 邻域搜索 | 官方 Python 绑定文档只列出在 Python 3.7/3.8 上测试，而本机是 3.12；整体更偏计算机图形学工具链 | 备选研究平台 |
| OpenFOAM interFoam | VOF 有限体积，可做黏性两相流、压力和动态网格；适合严格 CFD 验证 | 几何网格、动态边界和自由液面设置复杂，计算成本高，当前环境未安装 | 定量复核路线 |
| Mantaflow / Blender | FLIP/APIC 风格液体、移动障碍和高质量表面重建，视觉制作成熟 | 偏离线视觉特效，不以海岸工程测量和收敛性为核心；本机未安装 Blender | 只用于最终影片 |
| NVIDIA Warp | CUDA 加速计算框架，自带 HashGrid SPH 示例，便于定制 | 是开发框架而非完整、已验证的自由液面求解器；礁石边界和压力模型都要自行实现 | 不作为主引擎 |

依据：SPlisHSPlasH 官方文档列出刚体、边界、动画场、双精度和 GPU 邻域搜索等能力：[文档](https://splishsplash.readthedocs.io/en/latest/)。OpenFOAM 的 `interFoam` 使用 VOF/MULES 处理两相自由液面，并提供移动网格造波边界：[官方教程](https://www.openfoam.com/documentation/tutorial-guide/4-multiphase-flow/4.1-breaking-of-a-dam)、[waveMaker 说明](https://www.openfoam.com/news/main-news/openfoam-v1812/boundary-conditions)。Mantaflow 官方说明其 C++/Python 框架包含多种 Navier–Stokes 求解器并已集成 Blender，也提供移动障碍示例：[Mantaflow](https://mantaflow.com/index.html)。Warp 官方示例库包含 SPH 与流体示例，但展示的是可编程构件而非完整场景管线：[Warp 文档](https://nvidia.github.io/warp/latest/index.html)。

## 已完成的引擎验证

不是只生成了“推测可用”的配置。项目已下载并运行官方 `GenCase v5.4.354.01` 预处理器，默认 `dp = 0.020 m` 算例得到：

| 分类 | 粒子数 |
|---|---:|
| 固定边界（池壁与礁石） | 36,426 |
| 移动边界（环形活塞） | 426 |
| 流体 | 489,624 |
| 合计 | 526,476 |

预处理器确认存在独立 `Moving-Boundary mk=7` 块。正弦运动当前采用 `1.2 Hz / 0.085 m`；系统声速显式设为 `62.6418 m/s`，避免因为水面位于 `z=0`、池底位于负坐标而导致自动水深估算为零。

## 精度策略

默认 `dp=0.020 m` 是可用起点，不是最终收敛结论。建议三档运行：

| dp | 扣除固体前的水粒子粗略上限 | 用途 |
|---:|---:|---|
| 0.025 m | 约 25.6 万 | 快速检查稳定性与边界 |
| 0.020 m | 约 50 万 | 默认生产预览 |
| 0.015 m | 约 118.5 万 | 网格/粒子间距收敛 |

若三档的自由液面峰值、相位和礁石近旁压力仍没有收敛，应继续降至 `dp≈0.010 m`，而不是把其中一档结果当作真实值。
