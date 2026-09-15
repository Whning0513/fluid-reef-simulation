# DualSPHysics 高精度后端

该目录把网页中的二维浅水预览提升为完整的三维自由液面 WCSPH 算例。选用 **DualSPHysics 5.4.3**，原因是它面向自由液面和海岸工程，原生支持 NVIDIA GPU、STL 障碍、移动边界、粒子输出及等值面后处理。

## 生成算例

```powershell
python generate_case.py
```

默认粒子间距 `dp = 0.020 m`，水体在扣除礁石前约 500,000 个粒子。RTX 4060 8 GB 可先使用该档位。进一步收敛验证可运行：

```powershell
python generate_case.py --dp 0.015 --duration 8 --output-dt 0.025
```

`dp = 0.015 m` 的粗略上限约 119 万水粒子，时间和显存开销明显增加。不要只依赖一档分辨率作定量结论；至少比较 `0.025 / 0.020 / 0.015 m` 三档的自由液面和压力探针结果。

生成物包括：

- `case/ReefTank_Def.xml`：mDBC、Wendland 核、Symplectic 积分、Laminar+SPS、Fourtakas 密度扩散。
- `case/*.stl`：两座弧礁、后方渐高礁脊，以及用于交换/渲染的闭合环形活塞网格。
- `case/annular_actuator_particles.vtk`：按当前 `dp` 直接采样的环形移动边界粒子，便于在 ParaView 中独立检查。同一组点会写入 XML 的自由粒子绘制命令，避免薄壁 STL 在笛卡尔格点上漏采样，并保持精确的 `0.06/0.10 m` 内外半径。
- `case/manifest.json`：本次分辨率、粒子估计、动力源参数和网格三角形数。

## 校验预处理

只需验证 XML 与粒子化几何时，可从官方仓库安装 GenCase：

```powershell
.\setup_gencase.ps1
Push-Location case
..\bin\GenCase_win64.exe ReefTank_Def ../validation/ReefTank -save:all
Pop-Location
```

## 运行求解器

完整求解器需要从 [DualSPHysics 官方下载页](https://dual.sphysics.org/downloads/)取得。解压后运行：

```powershell
.\run_case.ps1 -DualSPHysicsRoot 'D:\path\to\DualSPHysics_v5.4.3'
```

脚本默认调用 CUDA GPU 版本；传入 `-Cpu` 可使用 CPU。已有输出不会被自动覆盖，只有显式传入 `-ForceClean` 才会清理本算例的输出目录。

## 精度边界

SPH 结果仍不是“绝对真值”。工程使用时应完成粒子间距收敛、时间步独立性、边界敏感性和实验/解析解验证。当前参数优先保证稳定且能分辨直径 `0.12 m` 的内孔；若要研究孔内射流和近壁剪切，建议进一步降到 `dp ≤ 0.010 m`，并相应评估 GPU 显存。
