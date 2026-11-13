### 实验准备
- 引物 [[引物稀释]]
- 模板RNA Primer(引物)
- $4\times gDNA wiper Mix~5\times HiScript II qRT SuperMix II$ (提前取出于冰上解冻，然后短暂离心，用移液枪吹打混匀)
- $RNase-free~ddH_2O$ 
- $2\times SYBR~green~mix$ 
### 实验步骤
一.gDNA去除
1. 将RNA模板,试剂盒在冰上解冻,轻柔均匀并短暂离心

| 组分                 | 体积      |
| ------------------ | ------- |
| 4 × gDNA wiper Mix | 4µL     |
| 模板RNA              | 1pg-1µg |
| RNase-free ddH₂O   | to 16µL |
| 总体积                | 16µL    |
- 使用移液枪轻轻吹打
- PCR仪反应时间为42°C,2min
- 模板RNA添加体积的计算:
	1. 测得RNA浓度为250ng/µL(通常使用NanoDrop或Qubit测定)
	2. 说明书要求不要超过1µg(1000ng),我们取目标质量为500ng
	3. 计算体积:500ng/250ng/µL=2µL
	4. 说明书表明体积不能超过2µL
- 按照“水$\rightarrow$Mix$\rightarrow$RNA"的顺序加样
二.配置逆转录体系
1. 向第一步的反应管中添加5 x HiScript II qRT SuperMix II

| 组分                                  | 体积   |
| ----------------------------------- | ---- |
| 第一步反应液                              | 16µL |
| 5 x HiScript II qRT SuperMix II<br> | 4µL  |
| 总体积                                 | 20µL |
- 用移液枪轻轻吹打
- 可选:No RT Control 阴性对照如果需检验RNA模板中是否有基因组DNA残留，可设置无逆转录酶的阴性对照。将 5 × HiScript II qRT SuperMix II 替换为 5 × No RT Control Mix (4 µL) + 第1步反应液 (16 µL) 即可
三.进行逆转录反应

| 温度   | 时间    |
| ---- | ----- |
| 50°C | 15min |
| 85°C | 5sec  |
- 产物保存:产物可立即用于qPCR,或在20°C保存(半年内使用);长期保存建议分装后与-70°C保存,cDNA应避免反复冻融
- 现在获得了cDNA,通常需要稀释5倍
四.qPCR扩增
1. 配制 qRT-PCR 反应体系（总体系 15 µL）

| 组分                    | 体积(µL) |
| --------------------- | ------ |
| 2 × SYBR green mix    | 7.5    |
| Primer Forward (3 µM) | 1      |
| Primer Reverse (3 µM) | 1      |
| $ddH_2O$              | 0      |
| $cDNA(1mg/\mu L$)     | 5.5    |
| Totle                 | 15     |
2. 上机循环条件(Cycles for RT-qPCR)

| 步骤                 | 温度       | 时间          | 循环数                 |
| ------------------ | -------- | ----------- | ------------------- |
| Holding Stage(预变性) | 95       | 10min       | 1                   |
| Cycling Stage(扩增)  | 95  60   | 15sec  1min | 40x             40x |
| Melting Curve      | 95  60   | 15sec 1min  | 1                1  |
|                    | up to 95 | In 0.5°C    | 70x                 |
3. 实验排版设计:
	1. 含有高浓度甘油的酶（如SuperMix）使用前请短暂离心收集到管底，并充分混匀。

	2. 20 µL 逆转录体系中，Total RNA 加入量建议不超过 1 µg。

	3. 如果 RNA 模板体积较大（>2 µL），请确保 RNA 是溶于水而不是 TE 中，因为 TE 中的 EDTA 会抑制逆转录反应。