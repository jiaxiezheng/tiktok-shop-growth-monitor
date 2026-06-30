# TikTok Shop 店铺动销后台

这是一个和短视频对标账号后台分开的独立程序，用来跟踪 TikTok Shop 单店铺产品的动销增长。

## 已支持

- 添加 TikTok Shop 店铺分享链接或 sellerId
- 自动从分享中转链接解析 sellerId 和地区
- 防止同店铺重复添加
- 店铺备注、添加人、删除
- 产品当前销量、昨日、近 3 日、近 7 日、近 10 日增长排序
- 按地区、店铺、最低销量、最低增长筛选
- 每天定时采集入口
- 独立数据目录，不影响短视频后台

## 重要说明

TikTok Shop 店铺分享链接在网页端只暴露中转页和 sellerId，不直接暴露完整商品列表。真实自动采集商品销量需要接入可访问的数据源：

1. TikTok Shop / Affiliate 官方接口
2. 已登录浏览器可访问的商品列表接口
3. 运营导出的商品表，再由本工具每天导入快照

如果设置 `SHOP_API_ENDPOINT`，程序会请求：

```text
SHOP_API_ENDPOINT?sellerId=xxx&region=MX
```

接口返回可以是数组，或 `{ "products": [...] }`。

## Railway 变量

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=5186
DATA_DIR=/app/data
SCAN_SLOTS=00:10,12:10
TIME_ZONE=Asia/Shanghai
SHOP_API_ENDPOINT=
```

部署到 Railway 时建议给 `/app/data` 加 Volume。
