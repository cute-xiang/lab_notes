# LaTeX 公式速查

> Obsidian 内置 MathJax，**不需要装任何插件**即可写 LaTeX。
> 行内用 `$...$`，块级用 `$$...$$`（`$$` 必须单独占行）。

---

## 一、基本写法

行内公式适合夹在文字里：

```text
细胞浓度 $2 \times 10^5$ cells/mL，活力 $>95\%$。
```

效果：细胞浓度 $2 \times 10^5$ cells/mL，活力 $>95\%$。

块级公式单独成段，前后各留一个空行：

```text
$$
E = 10^{-1/\text{slope}} - 1
$$
```

$$
E = 10^{-1/\text{slope}} - 1
$$

---

## 二、常用符号

| 含义 | 源码 | 渲染 |
| --- | --- | --- |
| 上标 | `x^2` | $x^2$ |
| 下标 | `C_1` | $C_1$ |
| 多字符上下标 | `E_{\text{abs}}` | $E_{\text{abs}}$ |
| 分数 | `\frac{a}{b}` | $\frac{a}{b}$ |
| 根号 | `\sqrt{x}`、`\sqrt[3]{x}` | $\sqrt{x}$、$\sqrt[3]{x}$ |
| 乘号 | `\times` | $\times$ |
| 点乘 | `\cdot` | $\cdot$ |
| 加减 | `\pm` | $\pm$ |
| 约等于 | `\approx` | $\approx$ |
| 不等于 | `\neq` | $\neq$ |
| 小于等于 | `\le` | $\le$ |
| 大于等于 | `\ge` | $\ge$ |
| 正比 | `\propto` | $\propto$ |
| 无穷 | `\infty` | $\infty$ |
| 求和 | `\sum_{i=1}^{n}` | $\sum_{i=1}^{n}$ |
| 求积 | `\prod_{i=1}^{n}` | $\prod_{i=1}^{n}$ |
| 积分 | `\int_0^t` | $\int_0^t$ |
| 偏导 | `\frac{\partial y}{\partial x}` | $\frac{\partial y}{\partial x}$ |
| 箭头 | `\rightarrow`、`\rightleftharpoons` | $\rightarrow$、$\rightleftharpoons$ |
| 角度 | `90^\circ` | $90^\circ$ |
| 正体文字 | `\text{cells/mL}` | $\text{cells/mL}$ |
| 希腊字母 | `\alpha \beta \gamma \Delta \mu \sigma` | $\alpha\ \beta\ \gamma\ \Delta\ \mu\ \sigma$ |
| 加粗向量 | `\mathbf{v}` | $\mathbf{v}$ |

---

## 三、实验常用公式

### 稀释计算

```text
$$
C_1 V_1 = C_2 V_2
$$
```

$$
C_1 V_1 = C_2 V_2
$$

### qPCR 扩增效率

```text
$$
E = 10^{-1/\text{slope}} - 1, \qquad R^2 = 0.998
$$
```

$$
E = 10^{-1/\text{slope}} - 1, \qquad R^2 = 0.998
$$

### 核酸定量（A260 = 1 时 dsDNA ≈ 50 µg/mL）

```text
$$
c\ (\mu\text{g/mL}) = A_{260} \times 50 \times \text{稀释倍数}
$$
```

$$
c\ (\mu\text{g/mL}) = A_{260} \times 50 \times \text{稀释倍数}
$$

### 拷贝数换算

```text
$$
\text{copies}/\mu\text{L} =
\frac{c \times 6.022 \times 10^{23}}{\text{length (bp)} \times 660}
$$
```

$$
\text{copies}/\mu\text{L} =
\frac{c \times 6.022 \times 10^{23}}{\text{length (bp)} \times 660}
$$

### 回收率与变异系数

```text
$$
\text{回收率} = \frac{\text{实测值}}{\text{理论值}} \times 100\%
\qquad
CV = \frac{SD}{\bar{x}} \times 100\%
$$
```

$$
\text{回收率} = \frac{\text{实测值}}{\text{理论值}} \times 100\%
\qquad
CV = \frac{SD}{\bar{x}} \times 100\%
$$

### 摩尔浓度

```text
$$
c = \frac{n}{V}, \qquad n = \frac{m}{M}
$$
```

$$
c = \frac{n}{V}, \qquad n = \frac{m}{M}
$$

### 细胞活力（台盼蓝计数）

```text
$$
\text{活力}(\%) =
\frac{\text{活细胞数}}{\text{活细胞数} + \text{死细胞数}} \times 100\%
$$
```

$$
\text{活力}(\%) =
\frac{\text{活细胞数}}{\text{活细胞数} + \text{死细胞数}} \times 100\%
$$

---

## 四、多行、分段与编号

多行推导用 `aligned`，`&` 对齐等号，`\\` 换行：

```text
$$
\begin{aligned}
A &= \varepsilon c l \\
  &= 0.85 \times 2.0 \times 1 \\
  &= 1.70
\end{aligned}
$$
```

$$
\begin{aligned}
A &= \varepsilon c l \\
  &= 0.85 \times 2.0 \times 1 \\
  &= 1.70
\end{aligned}
$$

分段函数用 `cases`：

```text
$$
f(x) =
\begin{cases}
1, & x > 0 \\
0, & x = 0 \\
-1, & x < 0
\end{cases}
$$
```

$$
f(x) =
\begin{cases}
1, & x > 0 \\
0, & x = 0 \\
-1, & x < 0
\end{cases}
$$

公式编号在末尾加 `\tag{1}`：

```text
$$
\Delta C_t = C_{t,\text{target}} - C_{t,\text{ref}} \tag{1}
$$
```

$$
\Delta C_t = C_{t,\text{target}} - C_{t,\text{ref}} \tag{1}
$$

---

## 五、化学式（mhchem，Obsidian 内置）

```text
$$
\ce{2H2 + O2 -> 2H2O}
$$
```

$$
\ce{2H2 + O2 -> 2H2O}
$$

```text
$$
\ce{CH3COOH <=> H+ + CH3COO-}
$$
```

$$
\ce{CH3COOH <=> H+ + CH3COO-}
$$

离子与同位素：`\ce{Fe^3+}` → $\ce{Fe^3+}$，`\ce{^{14}C}` → $\ce{^{14}C}$。

---

## 六、六个容易踩的坑

1. **`$` 后紧跟空格可能不渲染**：写成 `$x$` 比 `$ x $` 稳。
2. **中文紧贴公式**：`浓度$1$mg` 容易失效，中英文两侧各留一个空格。
3. **`$$` 块内不要有空行**，否则会被截断成两段。
4. **字面美元符号**写 `\$`（例如价格 "$5"）。
5. **想展示源码不渲染**：用反引号包起来，写成 `` `$x^2$` ``。
6. **文字里别用 `_` 或 `^`**：`snake_case` 会被当成下标，需写 `snake\_case`。

---

## 七、效率插件

- **Latex Suite**：输入 `/alpha` 自动变 $\alpha$，`//` 快速生成 `\frac{}{}`，`sr` 变 `^2`，自动补全 `\begin{aligned}`。常写公式强烈推荐。
- **TikZJax**：支持 TikZ 画图，但学习成本高；画通路示意图用 Excalidraw 更划算。

---

## 相关笔记

- [[QPCR原理]]
- [[QPCR]]
- [[Western blot 原理]]
- [[Flow cytometry 原理]]
- [[RNA抽提]]
- [[蛋白提取]]
