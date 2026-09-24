# DeskCupid DeepSeek 匹配

不改线上代码。第一次报名在 `enrich.py` 删除，不进模型。

```bash
python3 fetch_roster.py
python3 enrich.py          # 同一人只留第二次
python3 prepare_pool.py    # mask 姓名；过滤同班、异地
python3 score_deepseek.py  # 10 线程调用 DeepSeek，每轮带理由
python3 aggregate_scores.py
```

可调提示词：`DEEPSEEK_PROMPT.md`  
发给别人看：打开 `DeskCupid-matches.html`（浏览器即可，不需要 Cursor）。重新生成用 `python3 export_html.py`。  
API key 放 `.env` 的 `DEEPSEEK_API_KEY`，不要提交。
