# 书影音时光簿

以豆瓣书影音收藏功能为案例的独立课程原型，包含作品收藏、推荐、回忆补标与书影音日历。使用观察者模式和策略模式，非豆瓣官方产品。

## 发布到 GitHub Pages

1. 将本目录内容放到自己的 GitHub 仓库根目录，保留 `.github/workflows/pages.yml` 和 `site` 文件夹。
2. 仓库 `Settings → Pages → Build and deployment → Source` 选择 `GitHub Actions`。
3. 推送到 `main` 或 `master` 后，`Actions` 会执行发布；也可以手动运行 `Publish book film music calendar` 工作流。
4. 等工作流成功，在 `Settings → Pages` 打开实际生成的 HTTPS 链接。示意格式为 `https://用户名.github.io/仓库名/`，以 GitHub 返回的地址为准。

GitHub Free 个人账户通常使用公开仓库发布 Pages。上传后，网站代码和内置示例素材可公开访问。

## 更新和数据

更新 `site` 中的文件后推送，工作流会更新同一网站。无需部署本地 Node.js 服务，也无需安装 npm 依赖。

个人收藏与体验保存在访问者自己的浏览器中。旧本地网址、线上网址、手机与电脑的存储各自独立。迁移时，在原页面导出 JSON，再在新页面导入；也可以通过 CSV 导入观看清单。空白用户可以点击“载入示例记录”体验功能。

本仓库只包含网站文件和明确标注的内置示例，不包含个人55部影视清单或浏览器备份。新访客不会自动看到个人观看历史。

素材来源与图标许可位于 `site/assets`。
