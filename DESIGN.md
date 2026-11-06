---
name: 微疫世界 MicroWorld
description: 深海青绿观察界面、海沫绿状态与琥珀提示
colors:
  ground: "#0a1216"
  panel: "rgba(12, 24, 30, 0.94)"
  panel-2: "rgba(16, 32, 40, 0.9)"
  line: "rgba(120, 200, 220, 0.14)"
  ink: "#cfe8ea"
  dim: "#96b7bb"
  accent: "#90c8af"
  amber: "#e8b45a"
  danger: "#ff6b6b"
  good: "#9acdb6"
typography:
  body:
    fontFamily: "'Segoe UI', 'Microsoft YaHei', system-ui, sans-serif"
    fontSize: "13px"
rounded:
  panel: "14px"
  popover: "12px"
  field: "8px"
spacing:
  hud-inline: "12px"
  drawer-inline: "14px"
components:
  hud-button:
    backgroundColor: "transparent"
    padding: "5px 12px"
    rounded: "12px"
  popover:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    padding: "14px"
    rounded: "12px"
---

# Design System: 微疫世界 MicroWorld

## Overview

深海青绿观察主题保持地图主导，海沫绿用于状态和操作，琥珀用于提醒与键盘焦点。深色半透明面板覆盖地图，入口保留现有球体图像与轻微渐变。

记录依据：`css/style.css` 与 2026-11-06 已实现的界面调整；这里只描述当前视觉与响应式行为。

## Colors

蓝绿底与青白墨形成海洋色相层级，次级文字同样带青色。红色提示风险，海沫绿提示良好状态，琥珀提示需要关注的信息。

## Typography

系统中文无衬线字族，正文 13px / 1.5；入口标题为轻字重 34px，手机为 30px。HUD 数字使用 tabular-nums，标签按层级缩为 11–12px。

## Layout

地图铺满屏幕，顶部 HUD 的实际高度决定菜单与详情抽屉起点，底部保留新闻带和可折叠事件卡。宽屏 HUD 为一行（56px）；601–1120px 改为两行（90px）。≤600px 改为三行（116px）：世界/日期、五项统计、速度/菜单；迷你模式为 92px。手机表单变单列，按钮多为 36–40px；详情抽屉宽不超过 380px，设置弹层可滚动且最大高度按 HUD 和 100dvh 计算。≤540px 高度压缩入口间距。

## Elevation & Depth

观察面板通过半透明深青底、细青边及弹层阴影区分层级；主地图不增加装饰性发光。入口现有球体和渐变属于保留的视觉元素。

## Shapes

入口面板为 14px 圆角，菜单与事件卡为 12px，字段与抽屉操作为 8px；速度按钮组合形成整体控件。

## Components

当前速度与抽屉标签用海沫绿浅底和亮字；菜单与设置由实际 HUD 高度定位。焦点为 2px 琥珀外圈（offset 3px）；减少动态效果设置停止球体和新闻滚动动画。

## Do's and Don'ts

- Do 根据 HUD 的实际高度排列菜单和详情抽屉。
- Don't 将海洋配色改为纯灰或新增霓虹背景。
