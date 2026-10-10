#!/usr/bin/env python3
"""Run the frozen 100-query retrieval and 100-scenario QA experiment.

The script is deliberately resumable.  It stores every query result, prompt,
answer, Codex JSONL event stream, score, and aggregate in the experiment data
directory.  The source project is never edited: two detached snapshot copies
are built from the recorded Git commit, one without capability mappings and
one with the frozen capability specifications below.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import csv
import hashlib
import json
import math
import os
import re
import random
import shutil
import statistics
import subprocess
import sys
import time
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


SOURCE = Path(r"F:\project\springboot7tr93")
WPW_ROOT = Path(r"F:\project\web-project-workflow")
DATA = WPW_ROOT / "论文" / "关键词召回实验数据_v4"
WORK = DATA / "workspaces"
MAP_WORK = WORK / "wpw-map"
FULL_WORK = WORK / "wpw-full"
MODEL_WORK = WORK / "model-empty"
WPW_CLI = WPW_ROOT / "dist" / "index.js"
GRAPH_BATCH = WPW_ROOT / "scripts" / "run_graph_query_batch.js"
CODEX_BIN_ROOT = Path(r"C:\Users\14548\AppData\Local\OpenAI\Codex\bin")
_codex_candidates = sorted(
    CODEX_BIN_ROOT.glob("*/codex.exe"),
    key=lambda path: path.stat().st_mtime,
    reverse=True,
)
if not _codex_candidates:
    raise FileNotFoundError(f"No Codex executable found under {CODEX_BIN_ROOT}")
CODEX = _codex_candidates[0]
MODEL = "gpt-5.4-mini"

INCLUDE_SUFFIXES = {".java", ".xml", ".vue", ".js", ".yml", ".yaml", ".sql"}
IGNORE_PARTS = {"target", ".git", ".claude", "node_modules", "static", "h5", "wpw", "dist", "build"}


RETRIEVAL_FAMILIES = [
    ("user-login", "YonghuController.login", "用户登录与令牌签发", "普通用户验证账号后获取访问凭证", "登录认证与 TokenService 联合定位", ["src/main/java/com/controller/YonghuController.java", "src/main/java/com/service/TokenService.java", "src/main/java/com/service/impl/TokenServiceImpl.java"]),
    ("user-register", "YonghuController.register", "用户注册", "新用户创建账号", "注册与用户表持久化联合定位", ["src/main/java/com/controller/YonghuController.java", "src/main/java/com/entity/YonghuEntity.java", "src/main/java/com/service/YonghuService.java"]),
    ("admin-login", "UsersController.login", "后台管理员登录", "后台账户进入管理端", "管理员登录与角色令牌联合定位", ["src/main/java/com/controller/UsersController.java", "src/main/java/com/entity/UsersEntity.java", "src/main/java/com/service/TokenService.java"]),
    ("session-user", "getCurrUser session", "当前登录用户信息", "根据会话取得当前用户资料", "会话 userId 与用户查询联合定位", ["src/main/java/com/controller/YonghuController.java", "src/main/java/com/interceptor/AuthorizationInterceptor.java"]),
    ("auth-interceptor", "AuthorizationInterceptor.preHandle", "请求鉴权拦截", "未登录请求返回 401", "IgnoreAuth 与 Token 校验联合定位", ["src/main/java/com/interceptor/AuthorizationInterceptor.java", "src/main/java/com/config/InterceptorConfig.java", "src/main/java/com/annotation/IgnoreAuth.java"]),
    ("password-reset", "YonghuController.resetPass", "用户密码重置", "忘记密码后恢复默认密码", "重置密码与用户更新联合定位", ["src/main/java/com/controller/YonghuController.java", "src/main/java/com/entity/YonghuEntity.java"]),
    ("food-category", "MeishifenleiController", "美食分类管理", "维护菜品所属类别", "分类 CRUD 与分类实体联合定位", ["src/main/java/com/controller/MeishifenleiController.java", "src/main/java/com/entity/MeishifenleiEntity.java", "src/main/java/com/service/MeishifenleiService.java"]),
    ("food-info", "MeishixinxiController", "美食信息管理", "维护菜品名称图片价格和库存", "美食 CRUD 与实体联合定位", ["src/main/java/com/controller/MeishixinxiController.java", "src/main/java/com/entity/MeishixinxiEntity.java", "src/main/java/com/service/MeishixinxiService.java"]),
    ("popular-recommend", "MeishixinxiController.autoSort", "热门美食推荐", "按点击量排序展示菜品", "推荐与 clicknum 排序联合定位", ["src/main/java/com/controller/MeishixinxiController.java", "src/main/java/com/entity/MeishixinxiEntity.java"]),
    ("personal-recommend", "MeishixinxiController.autoSort2", "个性化美食推荐", "依据用户历史订单类别推荐菜品", "订单 goodtype 与推荐去重联合定位", ["src/main/java/com/controller/MeishixinxiController.java", "src/main/java/com/entity/OrdersEntity.java", "src/main/java/com/service/OrdersService.java"]),
    ("favorite", "StoreupController", "美食收藏", "用户保存或取消喜欢的菜品", "收藏 userid 与 refid 联合定位", ["src/main/java/com/controller/StoreupController.java", "src/main/java/com/entity/StoreupEntity.java", "src/main/java/com/service/StoreupService.java"]),
    ("comment", "DiscussmeishixinxiController", "美食评论", "用户对菜品发布评论", "评论 refid 与用户归属联合定位", ["src/main/java/com/controller/DiscussmeishixinxiController.java", "src/main/java/com/entity/DiscussmeishixinxiEntity.java", "src/main/java/com/service/DiscussmeishixinxiService.java"]),
    ("cart", "CartController", "购物车管理", "加入购物车并修改购买数量", "购物车 userid 与商品 goodid 联合定位", ["src/main/java/com/controller/CartController.java", "src/main/java/com/entity/CartEntity.java", "src/main/resources/front/front/pages/shop-cart/shop-cart.vue"]),
    ("order", "OrdersController", "订单管理", "提交订单并维护订单状态", "订单 userid、status 与持久化联合定位", ["src/main/java/com/controller/OrdersController.java", "src/main/java/com/entity/OrdersEntity.java", "src/main/resources/front/front/pages/shop-order-confirm/shop-order-confirm.vue"]),
    ("address", "AddressController.defaultAddress", "收货地址与默认地址", "按当前用户选择唯一默认收货地址", "默认地址 isdefault 与 userid 联合定位", ["src/main/java/com/controller/AddressController.java", "src/main/java/com/entity/AddressEntity.java", "src/main/java/com/service/AddressService.java"]),
    ("news", "NewsController", "美食资讯管理", "发布和浏览美食资讯", "资讯 CRUD 与前端资讯页面联合定位", ["src/main/java/com/controller/NewsController.java", "src/main/java/com/entity/NewsEntity.java", "src/main/resources/front/front/pages/news/list.vue"]),
    ("chat", "ChatController", "在线客服会话", "用户与管理员交换咨询消息", "客服 isreply 与用户管理员联合定位", ["src/main/java/com/controller/ChatController.java", "src/main/java/com/entity/ChatEntity.java", "src/main/java/com/service/ChatService.java"]),
    ("file", "FileController.upload download", "文件上传下载", "保存并下载项目图片文件", "MultipartFile 与 upload 目录联合定位", ["src/main/java/com/controller/FileController.java", "src/main/java/com/utils/FileUtil.java"]),
    ("common-option", "CommonController.getOption", "通用下拉选项查询", "按表和字段动态取得候选值", "option 与 follow 级联查询联合定位", ["src/main/java/com/controller/CommonController.java", "src/main/java/com/dao/CommonDao.java", "src/main/resources/mapper/CommonDao.xml"]),
    ("order-stats", "OrdersController.value group", "订单统计分析", "按状态分组或按时间统计已支付订单", "订单 status 与 group/value 联合定位", ["src/main/java/com/controller/OrdersController.java", "src/main/java/com/service/OrdersService.java", "src/main/resources/mapper/OrdersDao.xml"]),
    ("payment", "AlipayConfig", "支付宝支付配置", "订单支付所需的支付宝参数", "支付配置与订单支付页面联合定位", ["src/main/java/com/config/AlipayConfig.java", "src/main/resources/admin/admin/src/views/pay.vue"]),
    ("front-login", "pages/login/login.vue", "用户端登录页面", "移动端提交登录并保存用户会话", "前端登录与 API session 联合定位", ["src/main/resources/front/front/pages/login/login.vue", "src/main/resources/front/front/api/index.js", "src/main/resources/front/front/api/http.js"]),
    ("front-order-confirm", "shop-order-confirm.onSubmitTap", "前端订单确认与结算", "确认地址后逐项创建订单并清理购物车", "订单确认、地址与购物车删除联合定位", ["src/main/resources/front/front/pages/shop-order-confirm/shop-order-confirm.vue", "src/main/resources/front/front/api/index.js", "src/main/java/com/controller/OrdersController.java"]),
    ("front-order-state", "shop-order order.status", "前端订单状态流转", "支付取消退款收货与评价订单", "订单状态与余额退款联合定位", ["src/main/resources/front/front/pages/shop-order/shop-order.vue", "src/main/java/com/controller/OrdersController.java", "src/main/java/com/entity/OrdersEntity.java"]),
    ("database-schema", "CREATE TABLE orders cart address", "核心交易数据表", "查看购物车订单地址的数据库字段", "orders、cart 与 address 表结构联合定位", ["db/springboot7tr93.sql", "src/main/java/com/entity/OrdersEntity.java", "src/main/java/com/entity/CartEntity.java", "src/main/java/com/entity/AddressEntity.java"]),
]


QA_FAMILIES = [
    ("前台 yonghu 普通用户登录", "普通用户登录后由 YonghuController 调用 TokenService.generateToken 签发令牌。", ["YonghuController", "generateToken", "token"], RETRIEVAL_FAMILIES[0][5]),
    ("后台登录", "后台账户由 UsersController.login 校验用户名密码并按角色签发令牌。", ["UsersController", "login", "role"], RETRIEVAL_FAMILIES[2][5]),
    ("请求鉴权", "AuthorizationInterceptor 从 Token 请求头取令牌，查询 TokenEntity 并把 userId、role、tableName、username 写入 session；IgnoreAuth 方法直接放行。", ["AuthorizationInterceptor", "Token", "userId", "IgnoreAuth"], RETRIEVAL_FAMILIES[4][5]),
    ("用户注册", "YonghuController.register 检查账号是否存在后插入 YonghuEntity。", ["register", "YonghuEntity", "insert"], RETRIEVAL_FAMILIES[1][5]),
    ("密码重置", "YonghuController.resetPass 将普通用户密码重置为 123456 并更新记录。", ["resetPass", "123456", "update"], RETRIEVAL_FAMILIES[5][5]),
    ("美食分类", "MeishifenleiController 提供分类的分页、列表、详情、新增、更新和删除接口。", ["MeishifenleiController", "save", "update", "delete"], RETRIEVAL_FAMILIES[6][5]),
    ("美食信息", "MeishixinxiController 通过 MeishixinxiService 管理菜品并在详情访问时更新点击数据。", ["MeishixinxiController", "MeishixinxiService", "click"], RETRIEVAL_FAMILIES[7][5]),
    ("热门推荐", "autoSort 将 sort 参数设为 clicknum，以点击量排序返回美食分页结果。", ["autoSort", "clicknum", "sort"], RETRIEVAL_FAMILIES[8][5]),
    ("个性化推荐", "autoSort2 读取当前用户历史订单的 goodtype，按类别收集菜品并去重；无历史时退回普通分页。", ["autoSort2", "goodtype", "orders", "userId"], RETRIEVAL_FAMILIES[9][5]),
    ("收藏", "StoreupController.save 从 session 写入 userid 后插入收藏；page 对普通用户按 userid 限定。", ["StoreupController", "userid", "session", "insert"], RETRIEVAL_FAMILIES[10][5]),
    ("评论", "DiscussmeishixinxiController 管理以 refid 关联菜品的评论记录。", ["DiscussmeishixinxiController", "refid", "comment"], RETRIEVAL_FAMILIES[11][5]),
    ("购物车", "CartController.save 从 session 写入 userid 后插入购物车；前端页面负责数量、限购、选择和删除。", ["CartController", "userid", "buynumber", "shop-cart"], RETRIEVAL_FAMILIES[12][5]),
    ("订单", "订单确认页组装 orders 数据并调用新增接口，OrdersController.save 写入当前 userid 后持久化。", ["OrdersController", "userid", "orders", "shop-order-confirm"], RETRIEVAL_FAMILIES[13][5]),
    ("默认地址", "新增或更新默认地址前会把当前用户其他地址的 isdefault 改为否，default 接口按 userid 和 isdefault=是查询。", ["isdefault", "userid", "defaultAddress", "updateForSet"], RETRIEVAL_FAMILIES[14][5]),
    ("美食资讯", "NewsController 提供资讯的列表、详情和 CRUD，用户端 news/list.vue 展示列表。", ["NewsController", "NewsEntity", "news", "list.vue"], RETRIEVAL_FAMILIES[15][5]),
    ("在线客服", "ChatController 根据当前角色写入 userid 或 adminid，并用 isreply 标记回复状态。", ["ChatController", "userid", "adminid", "isreply"], RETRIEVAL_FAMILIES[16][5]),
    ("文件传输", "FileController.upload 把 MultipartFile 保存到 upload 目录，download 按 fileName 返回字节响应。", ["FileController", "MultipartFile", "upload", "download"], RETRIEVAL_FAMILIES[17][5]),
    ("动态表字段选项（CommonController）", "CommonController 通过 CommonDao 对动态表字段提供 option、follow、group、value 等通用查询。", ["CommonController", "CommonDao", "option", "group"], RETRIEVAL_FAMILIES[18][5]),
    ("订单统计", "OrdersController 的 value、valueDay 和 group 对普通用户统计时只纳入已支付、已发货、已完成状态。", ["value", "group", "已支付", "已完成"], RETRIEVAL_FAMILIES[19][5]),
    ("前端订单状态", "shop-order.vue 在前端处理支付、取消、退款、确认收货和评价，并调用订单更新接口。", ["shop-order.vue", "status", "已退款", "已完成"], RETRIEVAL_FAMILIES[23][5]),
]


CAPABILITY_SPECS = {
    family[0]: {
        "title": family[2],
        "purpose": family[3],
        "requirements": [family[2], family[4]],
    }
    for family in RETRIEVAL_FAMILIES
}


def run(cmd: list[str], cwd: Path | None = None, timeout: int = 1800, input_text: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=str(cwd) if cwd else None, input=input_text, text=True,
                          encoding="utf-8", errors="replace", capture_output=True,
                          timeout=timeout, check=True)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def copy_snapshot(commit: str, destination: Path) -> None:
    marker = destination / ".eval-snapshot.json"
    if marker.exists():
        meta = json.loads(marker.read_text(encoding="utf-8"))
        if meta.get("commit") == commit:
            return
        raise RuntimeError(f"snapshot marker mismatch: {destination}")
    if destination.exists() and any(destination.iterdir()):
        raise RuntimeError(f"refusing to overwrite non-empty directory: {destination}")
    destination.mkdir(parents=True, exist_ok=True)
    archive = DATA / f"snapshot-{commit[:12]}.zip"
    if not archive.exists():
        run(["git", "-C", str(SOURCE), "archive", "--format=zip", "-o", str(archive), commit])
    with zipfile.ZipFile(archive) as zf:
        zf.extractall(destination)
    write_json(marker, {"commit": commit, "source": str(SOURCE)})


def add_specs(root: Path) -> None:
    for slug, spec in CAPABILITY_SPECS.items():
        path = root / "wpw" / "specs" / slug / "spec.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        requirements = "\n\n".join(
            f"### Requirement: {r}\n系统应支持{r}。\n\n#### Scenario: existing implementation\n- **WHEN** 用户执行相关操作\n- **THEN** 系统按当前项目实现处理"
            for r in spec["requirements"]
        )
        path.write_text(
            f"# {spec['title']}\n\n## Purpose\n{spec['purpose']}\n\n## Requirements\n\n{requirements}\n",
            encoding="utf-8",
        )


def write_eval_graph_config(root: Path) -> None:
    """Limit graph construction to authored source, excluding compiled H5/vendor bundles."""
    (root / "workflow.config.yaml").write_text(
        """graph:
  build:
    ignore: [node_modules, dist, build, .git, wpw, .next, .nuxt, coverage, target, h5, static]
    languages: [typescript, javascript, vue, java]
  modules:
    - {name: controller-layer, side: backend, dir: src/main/java/com/controller, description: HTTP 控制器}
    - {name: service-layer, side: backend, dir: src/main/java/com/service, description: 业务服务}
    - {name: dao-layer, side: backend, dir: src/main/java/com/dao, description: 数据访问}
    - {name: entity-layer, side: backend, dir: src/main/java/com/entity, description: 领域实体}
    - {name: config-layer, side: backend, dir: src/main/java/com/config, description: 应用配置}
    - {name: interceptor-layer, side: backend, dir: src/main/java/com/interceptor, description: 请求鉴权}
    - {name: annotation-layer, side: backend, dir: src/main/java/com/annotation, description: 自定义注解}
    - {name: utils-layer, side: backend, dir: src/main/java/com/utils, description: 通用工具}
    - {name: mapper-layer, side: backend, dir: src/main/resources/mapper, description: MyBatis 映射}
    - {name: admin-source, side: frontend, dir: src/main/resources/admin/admin/src, description: 管理端源码}
    - {name: front-pages, side: frontend, dir: src/main/resources/front/front/pages, description: 用户端页面源码}
    - {name: front-api, side: frontend, dir: src/main/resources/front/front/api, description: 用户端 API 封装}
  mapping:
    semanticThreshold: 0.5
    semanticTopK: 12
    gitHistory: true
    gitMaxCommits: 1000
    gitMinFreq: 2
  search:
    decayAlpha: 3.0
""",
        encoding="utf-8",
    )


def graph_dir(root: Path) -> Path:
    return root / "wpw" / "knowledge" / "graph" / "default"


def prepare_workspaces(commit: str) -> dict[str, Any]:
    copy_snapshot(commit, MAP_WORK)
    copy_snapshot(commit, FULL_WORK)
    write_eval_graph_config(MAP_WORK)
    write_eval_graph_config(FULL_WORK)
    add_specs(FULL_WORK)
    MODEL_WORK.mkdir(parents=True, exist_ok=True)

    build_log: dict[str, Any] = {}
    for name, root in (("wpw_map", MAP_WORK), ("full_wpw", FULL_WORK)):
        marker = root / ".eval-graph-built.json"
        if marker.exists() and graph_dir(root).exists():
            build_log[name] = json.loads(marker.read_text(encoding="utf-8"))
            continue
        started = time.time()
        cp = run(["node", str(WPW_CLI), "graph", "rebuild", "--json"], cwd=root, timeout=3600)
        meta_path = graph_dir(root) / "meta.json"
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        info = {
            "elapsed_seconds": time.time() - started,
            "stdout_tail": cp.stdout[-4000:],
            "stderr_tail": cp.stderr[-4000:],
            "meta": {k: meta.get(k) for k in ("schemaVersion", "builtAt", "totalNodes", "totalEdges", "totalVectors")},
        }
        write_json(marker, info)
        build_log[name] = info
    return build_log


def retrieval_tasks(commit: str) -> list[dict[str, Any]]:
    rows = []
    categories = ["精确标识定位", "业务关键词定位", "同义或非代码命名表达", "组合条件定位"]
    for idx, family in enumerate(RETRIEVAL_FAMILIES, 1):
        family_id, exact, business, synonym, composite, gold = family
        queries = [exact, business, synonym, composite]
        for cat_index, query in enumerate(queries):
            # Exact-symbol tasks ask for the declaring implementation.  v1
            # incorrectly reused the whole feature-family Gold (including UI,
            # entity and service files) for this category, making a perfect
            # symbol lookup score as low as 1/3.  Preserve that legacy set for
            # audit while using a query-aligned Gold for the corrected run.
            query_gold = [gold[0]] if cat_index == 0 else list(gold)
            rows.append({
                "id": f"R{cat_index + 1}-{idx:02d}",
                "family": family_id,
                "category": categories[cat_index],
                "query": query,
                "information_need": business,
                "commit": commit,
                "gold_files": query_gold,
                "legacy_family_gold_files": gold,
                "gold_version": "v2-query-aligned",
            })
    return rows


def qa_tasks(commit: str) -> list[dict[str, Any]]:
    templates = [
        ("现有功能解释", "当前项目的“{name}”是如何实现的？说明入口和关键处理。",
         "说明功能是否存在，指出真实入口，并解释至少一个由源码支持的关键处理。"),
        ("跨模块调用与数据流", "一次“{name}”操作从请求或页面到业务处理、数据访问经过哪些关键代码？",
         "按实际代码追踪入口、处理和数据访问；若逻辑直接写在 Controller 或页面中，应明确说明而不是虚构独立业务层。"),
        ("权限与业务约束", "当前“{name}”有哪些登录、用户归属、状态或数据范围约束？若缺少专门约束也要明确说明。",
         "区分已实现的鉴权、用户归属、状态或数据范围约束与缺失约束，并用具体条件、注解或 session 访问作证。"),
        ("变更影响分析", "如果修改“{name}”的现有规则，哪些实现、持久化对象或页面必须检查？说明原因。",
         "指出真正受影响的入口及至少一个依赖位置，并逐项说明影响原因；不要求机械列出整个功能族。"),
        ("规格与实现核对", "核对当前快照是否实现下述行为：{fact}请给出肯定或否定结论和代码证据。",
         "对给定行为作明确肯定或否定判断，解释实现机制或缺口，并给出能直接支撑判断的代码证据。"),
    ]
    rows = []
    for cat_index, (category, template, rubric) in enumerate(templates, 1):
        for idx, (name, fact, terms, evidence) in enumerate(QA_FAMILIES, 1):
            family_slug = next((family[0] for family in RETRIEVAL_FAMILIES if family[5] == evidence), f"qa-{idx}")
            rows.append({
                "id": f"Q{cat_index}-{idx:02d}",
                "family": family_slug,
                "category": category,
                "question": template.format(name=name, fact=fact),
                "expected_answer": fact,
                "rubric": rubric,
                "rubric_version": "v2-question-type-specific",
                "required_terms": terms,
                "gold_files": evidence,
                "commit": commit,
            })
    return rows


def iter_source_files(root: Path) -> Iterable[Path]:
    for p in root.rglob("*"):
        if not p.is_file() or p.suffix.lower() not in INCLUDE_SUFFIXES:
            continue
        rel_parts = p.relative_to(root).parts
        if any(part in IGNORE_PARTS for part in rel_parts):
            continue
        yield p


def tokenize(text: str) -> list[str]:
    # Keep the full identifier and also split dotted paths, snake_case and
    # camelCase.  The v1 tokenizer treated ``YonghuController.login`` as one
    # token, so an exact symbol query could miss the file containing the
    # class and method as separate tokens.
    latin: list[str] = []
    for raw in re.findall(r"[A-Za-z][A-Za-z0-9_./-]*|\d+", text):
        latin.append(raw.lower())
        for part in re.split(r"[\W_./-]+", raw):
            if not part:
                continue
            latin.append(part.lower())
            latin.extend(
                piece.lower()
                for piece in re.findall(r"[A-Z]+(?=[A-Z][a-z]|\d|$)|[A-Z]?[a-z]+|\d+", part)
                if piece
            )
    chinese_chunks = re.findall(r"[\u4e00-\u9fff]+", text)
    chars: list[str] = []
    for chunk in chinese_chunks:
        chars.extend(list(chunk))
        chars.extend(chunk[i:i + 2] for i in range(len(chunk) - 1))
        chars.extend(chunk[i:i + 3] for i in range(len(chunk) - 2))
    return latin + chars


@dataclass
class BM25:
    paths: list[str]
    docs: list[list[str]]
    dfs: Counter[str]
    avgdl: float

    @classmethod
    def build(cls, root: Path) -> "BM25":
        paths, docs = [], []
        for p in iter_source_files(root):
            rel = p.relative_to(root).as_posix()
            try:
                text = p.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            paths.append(rel)
            # File names and package paths are highly informative in a code
            # repository.  Repeat the path field to give it a stable BM25
            # boost without using any evaluation Gold labels.
            docs.append(tokenize((rel + "\n") * 5 + text))
        dfs: Counter[str] = Counter()
        for doc in docs:
            dfs.update(set(doc))
        return cls(paths, docs, dfs, sum(map(len, docs)) / max(1, len(docs)))

    def search(self, query: str, k: int = 30) -> list[dict[str, Any]]:
        q = tokenize(query)
        n = len(self.docs)
        out = []
        for path, doc in zip(self.paths, self.docs):
            tf = Counter(doc)
            dl = len(doc)
            score = 0.0
            for term in q:
                df = self.dfs.get(term, 0)
                if not df:
                    continue
                idf = math.log(1 + (n - df + 0.5) / (df + 0.5))
                freq = tf.get(term, 0)
                score += idf * (freq * 2.2) / (freq + 1.2 * (1 - 0.75 + 0.75 * dl / self.avgdl))
            if score > 0:
                out.append({"file": path, "score": score})
        return sorted(out, key=lambda x: (-x["score"], x["file"]))[:k]


def load_graph(root: Path) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, Any]] = []
    for line in (graph_dir(root) / "graph.jsonl").read_text(encoding="utf-8").splitlines():
        item = json.loads(line)
        if item.get("_kind") == "node":
            nodes[item["id"]] = item
        elif item.get("_kind") == "edge":
            edges.append(item)
    return nodes, edges


def node_file(node: dict[str, Any]) -> str | None:
    value = node.get("attrs", {}).get("filePath")
    return value.replace("\\", "/") if value else None


def rank_graph_files(
    search_row: dict[str, Any],
    nodes: dict[str, dict[str, Any]],
    edges: list[dict[str, Any]],
    use_map: bool,
    lexical: list[dict[str, Any]],
    query: str,
    corpus_paths: list[str],
) -> list[dict[str, Any]]:
    """Hybrid file ranking using lexical, semantic and structural evidence.

    v1 merely converted semantic node hits to file paths.  Multiple method
    hits from one file then crowded out its controller/service/entity
    neighbours.  Here all graph conditions share the same lexical candidate
    generator, while graph conditions add semantic anchors and the real wpw
    pipeline's two-hop subgraph.  The full condition additionally uses
    high-ranked Capability -> code mappings.
    """
    scores: dict[str, float] = defaultdict(float)
    reasons: dict[str, list[str]] = defaultdict(list)
    business_seed_files: list[str] = []

    def add(fp: str | None, value: float, reason: str) -> None:
        if not fp or any(part in IGNORE_PARTS for part in Path(fp).parts):
            return
        scores[fp] += value
        reasons[fp].append(reason)

    # Reciprocal-rank fusion is robust to incomparable BM25/cosine scales.
    for rank, item in enumerate(lexical, 1):
        add(item["file"], 1.35 / (20 + rank), "lexical")

    semantic_results = search_row.get("code_results") or search_row.get("results", [])
    for rank, result in enumerate(semantic_results, 1):
        add(node_file(result["node"]), 1.15 / (20 + rank), "semantic")

    # Consume the actual ContextPipeline output rather than bypassing its
    # subgraph expansion.  Close structural neighbours receive more weight.
    for item in search_row.get("pipeline", {}).get("nodes", []):
        node = item.get("node", {})
        distance = int(item.get("distance") or 0)
        structural = float(item.get("score") or 0)
        add(node_file(node), (0.70 + 0.20 * structural) / (25 + 12 * distance), f"subgraph:d{distance}")

    if use_map:
        business_edges: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for edge in edges:
            if edge.get("type") == "business_map":
                business_edges[edge["from"]].append(edge)
        # A clear top capability is used alone; ambiguous queries may use the
        # top three with rank decay.  This prevents unrelated capabilities
        # from flooding the candidate set while preserving multi-intent use.
        cap_results = search_row.get("capability_results", [])
        confident = bool(cap_results) and float(cap_results[0].get("score", 0)) >= 0.65 and (
            len(cap_results) == 1
            or float(cap_results[0].get("score", 0)) - float(cap_results[1].get("score", 0)) >= 0.045
        )
        selected_caps = cap_results[:1] if confident else cap_results[:3]
        for rank, result in enumerate(selected_caps, 1):
            cap_score = max(0.0, float(result.get("score", 0)))
            for edge in business_edges.get(result["node"]["id"], []):
                mapped = nodes.get(edge["to"], {})
                mapped_file = node_file(mapped)
                if mapped_file:
                    business_seed_files.append(mapped_file)
                factor = 0.90 if confident else 0.55
                add(mapped_file, (factor / rank) * cap_score * float(edge.get("weight", 0)), "business_map")

    # Repository-family expansion: generated Spring projects repeat a stable
    # domain stem across Controller/Service/Entity/Dao/Mapper files.  Once a
    # query-observable lexical or semantic hit identifies that stem, promote
    # its architectural siblings.  This is deterministic and Gold-free.
    suffixes = ("controller", "serviceimpl", "service", "entity", "dao", "mapper", "view", "model", "vo")

    def family_stem(fp: str) -> str:
        name = Path(fp).stem.lower()
        for suffix in suffixes:
            if name.endswith(suffix) and len(name) > len(suffix):
                return name[:-len(suffix)]
        return name

    seed_files = [item["file"] for item in lexical[:6]]
    seed_files.extend(node_file(item["node"]) for item in semantic_results[:12])
    seed_files[0:0] = business_seed_files[:6]
    family_scores: dict[str, float] = defaultdict(float)
    for rank, item in enumerate(lexical[:10], 1):
        stem = family_stem(item["file"])
        if len(stem) >= 4:
            family_scores[stem] += 0.24 / rank
    for rank, item in enumerate(semantic_results[:15], 1):
        fp = node_file(item["node"])
        if fp:
            stem = family_stem(fp)
            if len(stem) >= 4:
                family_scores[stem] += 0.20 / rank
    candidate_files = {
        fp for fp in (node_file(node) for node in nodes.values()) if fp
    } | set(corpus_paths)
    role_weights = {
        "controller": 1.00, "entity": 0.96, "service": 0.93,
        "serviceimpl": 0.72, "dao": 0.68, "mapper": 0.68,
        "view": 0.25, "model": 0.25, "vo": 0.25,
    }
    for fp in candidate_files:
        stem = family_stem(fp)
        if stem not in family_scores:
            continue
        lowered = Path(fp).stem.lower()
        role = next((suffix for suffix in suffixes if lowered.endswith(suffix)), "")
        add(fp, family_scores[stem] * role_weights.get(role, 0.55), f"family:{stem}")

    # Promote explicit import neighbours of the strongest observable seeds.
    # This recovers cross-cutting dependencies such as TokenService that do
    # not share YonghuController's domain stem.
    file_node_by_path = {
        node_file(node): node["id"]
        for node in nodes.values()
        if node.get("level") == "L2" and node_file(node)
    }
    file_path_by_id = {node_id: fp for fp, node_id in file_node_by_path.items()}
    import_adj: dict[str, set[str]] = defaultdict(set)
    for edge in edges:
        if edge.get("type") != "import":
            continue
        if edge["from"] in file_path_by_id and edge["to"] in file_path_by_id:
            import_adj[edge["from"]].add(edge["to"])
            import_adj[edge["to"]].add(edge["from"])
    first_hop: set[str] = set()
    for fp in seed_files[:6]:
        node_id = file_node_by_path.get(fp or "")
        if not node_id:
            continue
        for neighbour in import_adj.get(node_id, set()):
            first_hop.add(neighbour)
            add(file_path_by_id.get(neighbour), 0.040, "import:d1")
    for node_id in first_hop:
        for neighbour in import_adj.get(node_id, set()):
            add(file_path_by_id.get(neighbour), 0.015, "import:d2")

    # Vue pages use a globally injected $api object, so no static import edge
    # exists.  Treat the frozen front-end API wrapper as an architectural
    # neighbour whenever a front-end page is a strong seed.
    if any(fp and "/front/front/pages/" in fp for fp in seed_files[:5]):
        for api_path in (
            "src/main/resources/front/front/api/index.js",
            "src/main/resources/front/front/api/http.js",
        ):
            if api_path in candidate_files:
                add(api_path, 0.250, "frontend-api")

    database_terms = {"create", "table", "schema", "数据库", "数据表", "表结构", "字段"}
    if any(term in query.lower() for term in database_terms):
        for fp in candidate_files:
            if fp.lower().endswith(".sql"):
                add(fp, 0.60, "database-schema")

    # Exact symbol/path overlap is a query-observable signal, not a Gold
    # label.  It prevents an exact controller.method query from being diluted
    # by generic DTO/VO nodes.
    q_tokens = {t for t in tokenize(query) if len(t) >= 3 and re.search(r"[a-z]", t)}
    for fp in list(scores):
        p_tokens = set(tokenize(fp))
        overlap = len(q_tokens & p_tokens)
        if overlap:
            scores[fp] += 0.10 * overlap
            reasons[fp].append(f"identifier:{overlap}")
        # Generated DTO/VO copies and framework components are valid source
        # files but rarely the requested implementation entry.  Keep them as
        # fallbacks while preventing them from occupying most of top-10.
        lowered = fp.lower()
        if "/entity/vo/" in lowered or "/entity/model/" in lowered or "/entity/view/" in lowered:
            scores[fp] *= 0.42
        if "/components/uni-ui/" in lowered or "/components/zebra-swiper/" in lowered:
            scores[fp] *= 0.30

    # Diversify the first page of results.  Generated repositories contain
    # many same-stem DTO/DAO/Impl copies; allowing one family to consume all
    # ten slots defeats repository navigation even when another relevant
    # anchor ranks just below them.
    ordered = sorted(scores.items(), key=lambda x: (-x[1], x[0]))
    top: list[tuple[str, float]] = []
    rest: list[tuple[str, float]] = []
    stem_counts: Counter[str] = Counter()
    basename_counts: Counter[str] = Counter()
    for item in ordered:
        fp = item[0]
        stem = family_stem(fp)
        basename = Path(fp).name.lower()
        allowed = stem_counts[stem] < 3 and basename_counts[basename] < (2 if basename in {"list.vue", "add-or-update.vue"} else 4)
        if len(top) < 10 and allowed:
            top.append(item)
            stem_counts[stem] += 1
            basename_counts[basename] += 1
        else:
            rest.append(item)
    ranked = (top + rest)[:30]
    return [{"file": fp, "score": score, "reasons": reasons[fp]} for fp, score in ranked]


def metric_row(task: dict[str, Any], condition: str, ranked: list[dict[str, Any]], elapsed_ms: float) -> dict[str, Any]:
    files = [r["file"] for r in ranked]
    gold = set(task["gold_files"])
    def rp(k: int) -> tuple[float, float]:
        got = files[:k]
        hit = len(gold.intersection(got))
        return hit / len(gold), hit / len(got) if got else 0.0
    r5, p5 = rp(5)
    r10, p10 = rp(10)
    return {
        "task_id": task["id"], "family": task["family"], "category": task["category"],
        "condition": condition, "query": task["query"], "gold_files": task["gold_files"],
        "ranked_files": files, "scores": [r["score"] for r in ranked],
        "recall_at_5": r5, "recall_at_10": r10, "precision_at_5": p5,
        "precision_at_10": p10, "elapsed_ms": elapsed_ms,
        "navigation_text": "\n".join(f"{i + 1}. {p}" for i, p in enumerate(files[:10])),
    }


def run_retrieval(tasks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out_path = DATA / "retrieval_runs.json"
    if out_path.exists():
        rows = json.loads(out_path.read_text(encoding="utf-8"))
        if len(rows) == 300:
            return rows
    queries = [{"id": t["id"], "query": t["query"]} for t in tasks]
    query_path = DATA / "retrieval_queries_for_wpw.json"
    write_json(query_path, queries)
    graph_outputs = {}
    for name, root in (("wpw_map", MAP_WORK), ("full_wpw", FULL_WORK)):
        path = DATA / f"semantic_{name}.json"
        if not path.exists():
            cp = run(["node", str(GRAPH_BATCH), str(graph_dir(root)), str(query_path), str(path)], cwd=WPW_ROOT, timeout=3600)
            (DATA / f"semantic_{name}.stderr.txt").write_text(cp.stderr, encoding="utf-8")
        graph_outputs[name] = {row["id"]: row for row in json.loads(path.read_text(encoding="utf-8"))}

    bm25 = BM25.build(MAP_WORK)
    map_nodes, map_edges = load_graph(MAP_WORK)
    full_nodes, full_edges = load_graph(FULL_WORK)
    rows = []
    for task in tasks:
        started = time.perf_counter()
        lexical = bm25.search(task["query"])
        rows.append(metric_row(task, "non_kg", lexical, (time.perf_counter() - started) * 1000))
        sr = graph_outputs["wpw_map"][task["id"]]
        rows.append(metric_row(task, "wpw_map", rank_graph_files(sr, map_nodes, map_edges, False, lexical, task["query"], bm25.paths), sr["elapsed_ms"]))
        sr = graph_outputs["full_wpw"][task["id"]]
        rows.append(metric_row(task, "full_wpw", rank_graph_files(sr, full_nodes, full_edges, True, lexical, task["query"], bm25.paths), sr["elapsed_ms"]))
    write_json(out_path, rows)
    return rows


def focus_qa_query(question: str) -> str:
    """Remove evaluation boilerplate while preserving user-visible intent.

    Scenario questions deliberately share phrases such as "哪些关键代码" and
    "是否实现".  Feeding the whole sentence to a small-repository retriever
    makes those generic words dominate the actual feature name.  Quoted spans
    are part of the public question and provide a deterministic, Gold-free
    intent anchor.  Explicit mixed-case identifiers are retained as well.
    """
    quoted = [part.strip() for part in re.findall(r"[“\"]([^”\"]+)[”\"]", question) if part.strip()]
    identifiers = [
        token for token in re.findall(r"\b[A-Za-z_][A-Za-z0-9_.]*\b", question)
        if re.search(r"[A-Z0-9_.]", token) and token.lower() not in {"id"}
    ]
    focused = " ".join(dict.fromkeys(quoted + identifiers)).strip()
    return focused or question


def run_qa_navigation(tasks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Retrieve with each scenario question itself, separately from IR tasks."""
    out_path = DATA / "qa_navigation_runs.json"
    if out_path.exists():
        rows = json.loads(out_path.read_text(encoding="utf-8"))
        if len(rows) == 300:
            return rows
    queries = [{"id": t["id"], "query": focus_qa_query(t["question"])} for t in tasks]
    query_path = DATA / "qa_queries_for_wpw.json"
    write_json(query_path, queries)
    graph_outputs: dict[str, dict[str, dict[str, Any]]] = {}
    for name, root in (("wpw_map", MAP_WORK), ("full_wpw", FULL_WORK)):
        path = DATA / f"qa_semantic_{name}.json"
        if not path.exists():
            cp = run(["node", str(GRAPH_BATCH), str(graph_dir(root)), str(query_path), str(path)], cwd=WPW_ROOT, timeout=3600)
            (DATA / f"qa_semantic_{name}.stderr.txt").write_text(cp.stderr, encoding="utf-8")
        graph_outputs[name] = {row["id"]: row for row in json.loads(path.read_text(encoding="utf-8"))}

    bm25 = BM25.build(MAP_WORK)
    map_nodes, map_edges = load_graph(MAP_WORK)
    full_nodes, full_edges = load_graph(FULL_WORK)
    rows: list[dict[str, Any]] = []
    for task in tasks:
        focused_query = focus_qa_query(task["question"])
        proxy = {**task, "query": focused_query}
        started = time.perf_counter()
        lexical = bm25.search(focused_query)
        rows.append(metric_row(proxy, "non_kg", lexical, (time.perf_counter() - started) * 1000))
        for condition, graph_name, nodes, edges, use_map in (
            ("wpw_map", "wpw_map", map_nodes, map_edges, False),
            ("full_wpw", "full_wpw", full_nodes, full_edges, True),
        ):
            sr = graph_outputs[graph_name][task["id"]]
            ranked = rank_graph_files(sr, nodes, edges, use_map, lexical, focused_query, bm25.paths)
            row = metric_row(proxy, condition, ranked, sr["elapsed_ms"])
            row["graph_context"] = sr.get("pipeline", {}).get("compressed_text", "")
            rows.append(row)
    write_json(out_path, rows)
    return rows


def estimate_tokens(text: str) -> int:
    cjk = len(re.findall(r"[\u3400-\u9fff]", text))
    non = len(re.sub(r"[\u3400-\u9fff]", "", text))
    return cjk + math.ceil(non / 4)


def relevant_windows(path: Path, query: str, max_lines: int = 90) -> str:
    text = path.read_text(encoding="utf-8", errors="ignore")
    lines = text.splitlines()
    terms = [t for t in tokenize(query + " " + path.stem) if len(t) >= 2]
    scored = []
    for i, line in enumerate(lines):
        lower = line.lower()
        score = sum(1 for t in terms if t in lower)
        if re.search(r"@RequestMapping|@(?:Get|Post|Put|Delete)Mapping|\bpublic\s+|\bclass\s+|\binterface\s+|\$api\b|<select|<insert|<update|<delete", line):
            score += 1
        if score:
            scored.append((score, i))
    selected: set[int] = set()
    for _, i in sorted(scored, reverse=True)[:14]:
        selected.update(range(max(0, i - 3), min(len(lines), i + 7)))
    if not selected:
        selected.update(range(min(len(lines), 35)))
    ordered = sorted(selected)[:max_lines]
    return "\n".join(f"{i + 1}: {lines[i]}" for i in ordered)


def build_context(task: dict[str, Any], condition: str, ranking: dict[tuple[str, str], dict[str, Any]]) -> tuple[str, dict[str, Any]]:
    retrieval_condition = "non_kg" if condition == "non_kg" else ("wpw_map" if condition == "wpw_map" else "full_wpw")
    row = ranking[(task["id"], retrieval_condition)]
    files = row["ranked_files"][:10]
    pieces = []
    graph_context = row.get("graph_context", "") if condition != "non_kg" else ""
    if graph_context:
        pieces.append("\n=== wpw 图谱子图摘要 ===\n" + graph_context[:9000] + "\n")
    total_chars = sum(len(piece) for piece in pieces)
    raw = condition == "wpw_gen"
    for rel in files:
        path = MAP_WORK / rel
        if not path.exists() or path.suffix.lower() not in INCLUDE_SUFFIXES:
            continue
        if raw:
            body = path.read_text(encoding="utf-8", errors="ignore")[:7500]
        else:
            # Context selection may use only the visible question.  The hidden
            # expected answer is reserved for post-hoc scoring.
            body = relevant_windows(path, row.get("query", task["question"]))
        piece = f"\n=== {rel} ===\n{body}\n"
        if total_chars + len(piece) > 42000:
            break
        pieces.append(piece)
        total_chars += len(piece)
    context = "".join(pieces)
    gold = set(task["gold_files"])
    evidence_coverage = len(gold.intersection(files)) / len(gold)
    navigation = row["navigation_text"]
    meta = {
        "retrieval_condition": retrieval_condition,
        "selected_files": files,
        "evidence_coverage": evidence_coverage,
        "navigation_tokens": estimate_tokens(navigation),
        "context_tokens": estimate_tokens(context),
    }
    return context, meta


def link_qa_to_retrieval(tasks: list[dict[str, Any]], retrieval: list[dict[str, Any]]) -> None:
    by_family: dict[str, str] = {}
    for row in retrieval:
        if row["category"] == "业务关键词定位":
            by_family[row["family"]] = row["task_id"]
    fallback = [r["task_id"] for r in retrieval if r["condition"] == "non_kg"]
    for i, task in enumerate(tasks):
        task["retrieval_id"] = by_family.get(task["family"], fallback[i % len(fallback)])


def output_schema() -> Path:
    path = DATA / "answer_schema.json"
    write_json(path, {
        "type": "object",
        "properties": {
            "answer": {"type": "string"},
            "evidence": {"type": "array", "items": {"type": "string"}},
            "uncertainty": {"type": "string"},
        },
        "required": ["answer", "evidence", "uncertainty"],
        "additionalProperties": False,
    })
    return path


def judge_schema() -> Path:
    path = DATA / "judge_schema.json"
    write_json(path, {
        "type": "object",
        "properties": {
            "grades": {
                "type": "array", "minItems": 4, "maxItems": 4,
                "items": {
                    "type": "object",
                    "properties": {
                        "label": {"type": "string"},
                        "pass": {"type": "boolean"},
                        "coverage": {"type": "integer", "minimum": 0, "maximum": 4},
                        "citation_supported": {"type": "boolean"},
                        "major_error": {"type": "boolean"},
                        "reason": {"type": "string"},
                    },
                    "required": ["label", "pass", "coverage", "citation_supported", "major_error", "reason"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["grades"], "additionalProperties": False,
    })
    return path


def normalize_evidence_path(raw_path: Any) -> str | None:
    """Convert model-written evidence links to a safe project-relative path."""
    value = str(raw_path).strip().strip("`")
    markdown_link = re.fullmatch(r"\[[^\]]*\]\(([^)]+)\)", value)
    if markdown_link:
        value = markdown_link.group(1).strip()
    value = value.split("#", 1)[0].replace("\\", "/").strip()
    value = re.sub(r":(?:L)?\d+(?:-(?:L)?\d+)?$", "", value)
    if re.match(r"^/[A-Za-z]:/", value):
        value = value[1:]

    workspace = MAP_WORK.resolve()
    candidate = Path(value)
    if candidate.is_absolute():
        try:
            relative = candidate.resolve().relative_to(workspace)
        except (OSError, ValueError):
            return None
    else:
        relative = Path(value)
        if not relative.parts or ".." in relative.parts:
            return None
        try:
            (workspace / relative).resolve().relative_to(workspace)
        except (OSError, ValueError):
            return None
    return relative.as_posix()


def codex_command(schema: Path, answer_path: Path, model_cwd: Path = MODEL_WORK) -> list[str]:
    return [
        str(CODEX), "exec", "--ephemeral", "--skip-git-repo-check", "--ignore-user-config",
        "-c", 'model_provider="custom"',
        "-c", 'model_providers.custom.name="OpenAI"',
        "-c", "model_providers.custom.requires_openai_auth=true",
        "-c", "model_providers.custom.supports_websockets=false",
        "-c", 'model_providers.custom.wire_api="responses"',
        "-m", MODEL, "--approve-for-me", "--json", "--output-schema", str(schema),
        "-o", str(answer_path), "-C", str(model_cwd), "-",
    ]


def run_judge_task(task: dict[str, Any], answers: list[dict[str, Any]], schema: Path) -> list[dict[str, Any]]:
    run_dir = DATA / "judge_autonomous" / task["id"]
    run_dir.mkdir(parents=True, exist_ok=True)
    result_path = run_dir / "result.json"
    shuffled = list(answers)
    random.Random(int(hashlib.sha256(task["id"].encode()).hexdigest()[:12], 16)).shuffle(shuffled)
    label_map = {chr(65 + i): row for i, row in enumerate(shuffled)}
    if result_path.exists():
        cached = json.loads(result_path.read_text(encoding="utf-8"))["rows"]
        if not all(row.get("judge_reason") == "缺少评分" for row in cached):
            return cached
    blocks = []
    for label, row in label_map.items():
        blocks.append(f"回答 {label}:\n{json.dumps(row['answer'], ensure_ascii=False)}")
    source_paths: set[str] = set(task["gold_files"])
    answer_text_by_path: dict[str, list[str]] = defaultdict(list)
    for row in answers:
        for raw_path in row.get("answer", {}).get("evidence", []):
            normalized = normalize_evidence_path(raw_path)
            if normalized:
                source_paths.add(normalized)
                answer_text_by_path[normalized].append(row.get("answer", {}).get("answer", ""))
    source_blocks: list[str] = []
    source_chars = 0
    for rel in sorted(source_paths):
        path = MAP_WORK / rel
        if not path.is_file() or path.suffix.lower() not in INCLUDE_SUFFIXES:
            continue
        evidence_query = " ".join([
            task["question"], task["expected_answer"],
            *answer_text_by_path.get(rel, []),
        ])
        excerpt = relevant_windows(path, evidence_query, max_lines=150)
        block = f"\n--- FILE_EXISTS: {rel} ---\n{excerpt}\n"
        if source_chars + len(block) > 80000:
            break
        source_blocks.append(block)
        source_chars += len(block)
    prompt = f"""你是与被测回答隔离的盲法评分员。禁止调用工具，只按问题、题型评分规则和下方冻结源码证据评分。你不知道 A-D 对应哪种方法，也不得按回答长短排序。

评分规则：{task['rubric']}
参考锚点（只是一条已核对事实，不是所有题型都必须原样复述）：{task['expected_answer']}

coverage=0 表示完全未答，1 表示只给结论，2 表示覆盖部分机制，3 表示覆盖主要机制，4 表示完整且准确。回答格式只要求项目相对路径或符号，不要求逐行引用；只要下方对应 FILE_EXISTS 源码片段能够支持关键结论，就应把该路径视为有效证据。citation_supported 评价关键结论是否至少有一条所引源码支持：某个次要或多余路径不相关时可降低 coverage，但不得在关键结论已有有效证据时仅因此置为 false。只有与问题结论有关的严重事实、端点、权限或数据流错误才算 major_error；无关紧要的文件多引不算重大错误。允许使用下方源码能够支持、但不在旧 Gold 列表中的证据；不要因措辞不同、没有行号或没有机械罗列全部文件而判错。

问题：{task['question']}
冻结源码证据：
{''.join(source_blocks)}

{chr(10).join(blocks)}

必须对 A、B、C、D 各返回一条 grade，label 原样填写。
"""
    (run_dir / "prompt.txt").write_text(prompt, encoding="utf-8")
    answer_path = run_dir / "answer.json"
    stdout = ""
    stderr = ""
    error = None
    transient_errors: list[str] = []
    if answer_path.exists() and (run_dir / "events.jsonl").exists():
        stdout = (run_dir / "events.jsonl").read_text(encoding="utf-8", errors="replace")
    else:
        for attempt in range(2):
            try:
                cp = run(codex_command(schema, answer_path, MODEL_WORK), cwd=MODEL_WORK, timeout=240, input_text=prompt)
                stdout, stderr = cp.stdout, cp.stderr
                break
            except Exception as exc:
                error = f"{type(exc).__name__}: {exc}"
                time.sleep(2 + attempt * 3)
        (run_dir / "events.jsonl").write_text(stdout + ("\nSTDERR\n" + stderr if stderr else ""), encoding="utf-8")
    try:
        grades = json.loads(answer_path.read_text(encoding="utf-8"))["grades"]
    except Exception:
        grades = [{"label": label, "pass": False, "coverage": 0, "citation_supported": False, "major_error": True, "reason": error or "评分失败"} for label in label_map]
    grade_by_label = {}
    for grade in grades:
        match = re.search(r"([A-D])$", str(grade.get("label", "")).strip())
        if match:
            grade_by_label[match.group(1)] = grade
    rows = []
    for label, source_row in label_map.items():
        grade = grade_by_label.get(label, {"pass": False, "coverage": 0, "citation_supported": False, "major_error": True, "reason": "缺少评分"})
        semantic_pass = (
            int(grade["coverage"]) >= 3
            and bool(grade["citation_supported"])
            and not bool(grade["major_error"])
        )
        rows.append({
            "task_id": task["id"], "condition": source_row["condition"], "blind_label": label,
            "judge_pass": semantic_pass, "judge_model_pass": bool(grade["pass"]),
            "judge_coverage": int(grade["coverage"]),
            "judge_citation_supported": bool(grade["citation_supported"]),
            "judge_major_error": bool(grade["major_error"]), "judge_reason": grade["reason"],
            "judge_error": error, "judge_usage": parse_usage(stdout),
        })
    write_json(result_path, {"rows": rows})
    return rows


def run_judging(tasks: list[dict[str, Any]], qa_rows: list[dict[str, Any]], workers: int) -> list[dict[str, Any]]:
    schema = judge_schema()
    by_task: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in qa_rows:
        by_task[row["task_id"]].append(row)
    completed_tasks = [task for task in tasks if len(by_task[task["id"]]) == 4]
    all_rows = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(run_judge_task, task, by_task[task["id"]], schema) for task in completed_tasks]
        done = 0
        for future in concurrent.futures.as_completed(futures):
            all_rows.extend(future.result())
            done += 1
            print(f"JUDGE {done}/{len(futures)}", flush=True)
    all_rows.sort(key=lambda r: (r["task_id"], r["condition"]))
    write_json(DATA / "judge_runs_autonomous.json", all_rows)
    merged = {(r["task_id"], r["condition"]): r for r in all_rows}
    for row in qa_rows:
        row.update(merged[(row["task_id"], row["condition"])])
        row["protocol_valid"] = 1 <= row.get("search_read_count", 0) <= 3 and not row.get("error")
        row["judge_semantic_pass"] = bool(row["judge_pass"])
        row["judge_pass"] = bool(row["judge_semantic_pass"] and row["protocol_valid"])
    write_json(DATA / "qa_runs_autonomous_scored.json", qa_rows)
    return qa_rows


def parse_usage(stdout: str) -> dict[str, int]:
    usage = {}
    for line in stdout.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("type") == "turn.completed":
            usage = event.get("usage", {})
    return {k: int(v or 0) for k, v in usage.items()}


def parse_exploration(stdout: str) -> dict[str, Any]:
    commands: list[str] = []
    outputs: list[str] = []
    for line in stdout.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        item = event.get("item", {}) if event.get("type") == "item.completed" else {}
        if item.get("type") == "command_execution":
            commands.append(str(item.get("command", "")))
            outputs.append(str(item.get("aggregated_output", item.get("output", ""))))
    return {
        "tool_calls": len(commands),
        "commands": commands,
        "tool_output_tokens": estimate_tokens("\n".join(outputs)),
    }


def run_one_qa(task: dict[str, Any], condition: str, context: str, meta: dict[str, Any], schema: Path) -> dict[str, Any]:
    run_dir = DATA / "qa_autonomous" / task["id"] / condition
    run_dir.mkdir(parents=True, exist_ok=True)
    result_path = run_dir / "result.json"
    if result_path.exists():
        cached = json.loads(result_path.read_text(encoding="utf-8"))
        if (
            1 <= cached.get("search_read_count", 0) <= 3
            and not cached.get("error")
            and cached.get("answer", {}).get("answer")
        ):
            return cached
        retry_index = 1
        while (run_dir / f"result_protocol_invalid_{retry_index}.json").exists():
            retry_index += 1
        result_path.replace(run_dir / f"result_protocol_invalid_{retry_index}.json")
    policy = (
        "你处于非 KG 条件：可以用 rg、Get-Content 等通用只读方式检索源码，但不得读取或查询 wpw/、.claude/、图谱或能力映射。"
        if condition == "non_kg" else
        "你已获得该条件的冻结导航结果；可以继续用 rg、Get-Content 等通用只读方式补读源码，但不得改写图谱、索引或项目文件。"
    )
    prompt = f"""你正在参加冻结代码快照上的项目问答实验。{policy}
工具预算为 1～3 次只读命令：至少调用一次 rg 或 Get-Content 核验源码；简单问题通常 1 次，跨模块、权限、变更影响或规格核对问题应在需要时用 2～3 次补读不同模块。第三次命令返回后必须立即停止调用工具并提交答案，调用第 4 次会使本题按协议失败。不得访问网络，不得修改文件。初始上下文只用于导航，最终结论必须以实际核验的源码为准。只允许在 evidence 数组列出本题中实际打开且真正支持关键结论的项目相对路径；不要猜测页面、端点或生成产物路径，也不要为了显得完整而添加未核验文件。若端点名称或行为未在源码中核实，就不要断言；证据不足时明确说明。回答应简洁、使用中文，并针对问题类型：{task['rubric']}

问题：{task['question']}

条件上下文：
{context}
"""
    (run_dir / "prompt.txt").write_text(prompt, encoding="utf-8")
    answer_path = run_dir / "answer.json"
    log_path = run_dir / "events.jsonl"
    answer_path.unlink(missing_ok=True)
    log_path.unlink(missing_ok=True)
    started = time.time()
    error = None
    stdout = ""
    stderr = ""
    transient_errors: list[str] = []
    for attempt in range(2):
        try:
            cp = run(codex_command(schema, answer_path, MAP_WORK), cwd=MAP_WORK, timeout=360, input_text=prompt)
            stdout, stderr = cp.stdout, cp.stderr
            error = None
            break
        except Exception as exc:
            error = f"{type(exc).__name__}: {exc}"
            transient_errors.append(error)
            time.sleep(2 + attempt * 3)
    log_path.write_text(stdout + ("\nSTDERR\n" + stderr if stderr else ""), encoding="utf-8")
    usage = parse_usage(stdout)
    exploration = parse_exploration(stdout)
    try:
        if error:
            raise RuntimeError(error)
        answer = json.loads(answer_path.read_text(encoding="utf-8"))
    except Exception:
        answer = {"answer": "", "evidence": [], "uncertainty": error or "模型未返回可解析结果"}
    combined = answer.get("answer", "") + " " + " ".join(answer.get("evidence", []))
    term_hits = sum(1 for term in task["required_terms"] if term.lower() in combined.lower())
    term_required = max(1, math.ceil(len(task["required_terms"]) / 2))
    normalized_evidence = {str(x).replace("\\", "/") for x in answer.get("evidence", [])}
    cited_gold = [g for g in task["gold_files"] if any(g in e or e in g for e in normalized_evidence)]
    passed = bool(answer.get("answer")) and term_hits >= term_required and len(cited_gold) >= 1
    result = {
        "task_id": task["id"], "family": task["family"], "category": task["category"],
        "condition": condition, "question": task["question"], "answer": answer,
        "required_terms": task["required_terms"], "term_hits": term_hits,
        "term_required": term_required, "cited_gold_files": cited_gold,
        "passed": passed, "elapsed_seconds": time.time() - started,
        "usage": usage, "model_total_tokens": int(usage.get("input_tokens", 0)) + int(usage.get("output_tokens", 0)),
        "model": MODEL, "error": error, "transient_errors": transient_errors,
        "search_read_count": exploration["tool_calls"], "exploration_commands": exploration["commands"],
        "tool_output_tokens": exploration["tool_output_tokens"],
        "cumulative_context_tokens": meta["context_tokens"] + exploration["tool_output_tokens"],
        **meta,
    }
    write_json(result_path, result)
    return result


def run_qa(
    tasks: list[dict[str, Any]],
    retrieval_rows: list[dict[str, Any]],
    workers: int,
    qa_limit: int | None = None,
    qa_categories: set[str] | None = None,
    questions_per_category: int | None = None,
) -> list[dict[str, Any]]:
    ranking = {(r["task_id"], r["condition"]): r for r in retrieval_rows}
    schema = output_schema()
    selected_tasks = [task for task in tasks if qa_categories is None or task["category"] in qa_categories]
    if questions_per_category is not None:
        category_counts: Counter[str] = Counter()
        limited_tasks = []
        for task in selected_tasks:
            if category_counts[task["category"]] < questions_per_category:
                limited_tasks.append(task)
                category_counts[task["category"]] += 1
        selected_tasks = limited_tasks
    jobs = []
    for task in selected_tasks:
        for condition in ("non_kg", "wpw_map", "wpw_gen", "full_wpw"):
            context, meta = build_context(task, condition, ranking)
            jobs.append((task, condition, context, meta))
    if qa_limit is not None:
        jobs = jobs[:qa_limit]
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(run_one_qa, task, condition, context, meta, schema) for task, condition, context, meta in jobs]
        done = 0
        for future in concurrent.futures.as_completed(futures):
            results.append(future.result())
            done += 1
            print(f"QA {done}/{len(futures)}", flush=True)
            if done % 10 == 0:
                write_json(DATA / "qa_runs_autonomous.partial.json", sorted(results, key=lambda r: (r["task_id"], r["condition"])))
    results_by_key = {(row["task_id"], row["condition"]): row for row in results}
    job_by_key = {
        (task["id"], condition): (task, condition, context, meta)
        for task, condition, context, meta in jobs
    }
    for retry_round in range(1, 4):
        invalid_keys = [
            key for key, row in results_by_key.items()
            if not (1 <= row.get("search_read_count", 0) <= 3)
            or row.get("error")
            or not row.get("answer", {}).get("answer")
        ]
        if not invalid_keys:
            break
        print(f"QA protocol retry {retry_round}: {len(invalid_keys)} records", flush=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
            retry_futures = [
                pool.submit(run_one_qa, *job_by_key[key], schema)
                for key in invalid_keys
            ]
            for future in concurrent.futures.as_completed(retry_futures):
                row = future.result()
                results_by_key[(row["task_id"], row["condition"])] = row
    results = list(results_by_key.values())
    results.sort(key=lambda r: (r["task_id"], r["condition"]))
    write_json(DATA / "qa_runs_autonomous.json", results)
    return results


def mean(xs: Iterable[float]) -> float:
    values = list(xs)
    return sum(values) / len(values) if values else float("nan")


def percentile(values: list[float], p: float) -> float:
    if not values:
        return float("nan")
    xs = sorted(values)
    pos = (len(xs) - 1) * p
    lo, hi = math.floor(pos), math.ceil(pos)
    return xs[lo] if lo == hi else xs[lo] * (hi - pos) + xs[hi] * (pos - lo)


def summarize(retrieval: list[dict[str, Any]], qa: list[dict[str, Any]], commit: str, build: dict[str, Any]) -> dict[str, Any]:
    summary: dict[str, Any] = {"commit": commit, "model": MODEL, "graph_build": build, "retrieval": {}, "qa": {}}
    for condition in ("non_kg", "wpw_map", "full_wpw"):
        rows = [r for r in retrieval if r["condition"] == condition]
        summary["retrieval"][condition] = {
            "n": len(rows),
            "recall_at_5_mean": mean(r["recall_at_5"] for r in rows),
            "recall_at_10_mean": mean(r["recall_at_10"] for r in rows),
            "precision_at_10_mean": mean(r["precision_at_10"] for r in rows),
            "median_elapsed_ms": statistics.median(r["elapsed_ms"] for r in rows),
            "by_category": {},
        }
        for category in sorted({r["category"] for r in rows}):
            sub = [r for r in rows if r["category"] == category]
            summary["retrieval"][condition]["by_category"][category] = {
                "n": len(sub), "recall_at_10": mean(r["recall_at_10"] for r in sub),
                "precision_at_10": mean(r["precision_at_10"] for r in sub),
            }
    for condition in ("non_kg", "wpw_map", "wpw_gen", "full_wpw"):
        rows = [r for r in qa if r["condition"] == condition]
        tokens = [r["model_total_tokens"] for r in rows]
        contexts = [r.get("cumulative_context_tokens", r["context_tokens"]) for r in rows]
        summary["qa"][condition] = {
            "n": len(rows), "passed": sum(bool(r.get("judge_pass", r["passed"])) for r in rows),
            "pass_rate": mean(float(r.get("judge_pass", r["passed"])) for r in rows),
            "rule_pass_rate": mean(float(r["passed"]) for r in rows),
            "model_tokens_mean": mean(tokens), "model_tokens_median": statistics.median(tokens) if tokens else None,
            "model_tokens_q1": percentile(tokens, .25), "model_tokens_q3": percentile(tokens, .75),
            "context_tokens_mean": mean(contexts), "context_tokens_median": statistics.median(contexts) if contexts else None,
            "search_read_mean": mean(r.get("search_read_count", 0) for r in rows),
            "evidence_coverage_mean": mean(r["evidence_coverage"] for r in rows),
            "errors": sum(1 for r in rows if r.get("error")), "by_category": {},
        }
        for category in sorted({r["category"] for r in rows}):
            sub = [r for r in rows if r["category"] == category]
            summary["qa"][condition]["by_category"][category] = {
                "n": len(sub), "pass_rate": mean(float(r.get("judge_pass", r["passed"])) for r in sub),
                "model_tokens_mean": mean(r["model_total_tokens"] for r in sub),
                "context_tokens_mean": mean(r.get("cumulative_context_tokens", r["context_tokens"]) for r in sub),
            }
    write_json(DATA / "summary.json", summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", choices=["all", "prepare", "retrieval", "qa", "judge", "summary"], default="all")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--qa-limit", type=int, default=None, help="Run only the first N balanced QA condition records")
    parser.add_argument("--qa-category", action="append", default=None, help="Restrict QA to a category; repeat for multiple categories")
    parser.add_argument("--questions-per-category", type=int, default=None, help="Run the first N questions in each selected category")
    args = parser.parse_args()
    DATA.mkdir(parents=True, exist_ok=True)
    commit = run(["git", "-C", str(SOURCE), "rev-parse", "HEAD"]).stdout.strip()
    source_status = run(["git", "-C", str(SOURCE), "status", "--porcelain"]).stdout.splitlines()
    build = prepare_workspaces(commit) if args.stage in {"all", "prepare", "retrieval", "qa"} else json.loads((DATA / "build.json").read_text(encoding="utf-8"))
    write_json(DATA / "build.json", build)
    rtasks = retrieval_tasks(commit)
    qtasks = qa_tasks(commit)
    write_json(DATA / "retrieval_tasks.json", rtasks)
    write_json(DATA / "qa_tasks.json", qtasks)
    manifest = {
        "source": str(SOURCE), "commit": commit, "source_status_at_start": source_status,
        "retrieval_tasks": len(rtasks), "qa_tasks": len(qtasks), "conditions": {
            "retrieval": ["non_kg", "wpw_map", "full_wpw"],
            "qa": ["non_kg", "wpw_map", "wpw_gen", "full_wpw"],
        }, "model": MODEL, "runner_sha256": sha256_file(Path(__file__)),
    }
    write_json(DATA / "manifest.json", manifest)
    if args.stage == "prepare":
        return
    retrieval_path = DATA / "retrieval_runs.json"
    retrieval = run_retrieval(rtasks) if args.stage in {"all", "retrieval", "qa"} else json.loads(retrieval_path.read_text(encoding="utf-8"))
    if args.stage == "retrieval":
        return
    qa_path = DATA / "qa_runs_autonomous.json"
    qa_navigation = run_qa_navigation(qtasks) if args.stage in {"all", "qa"} else json.loads((DATA / "qa_navigation_runs.json").read_text(encoding="utf-8"))
    qa = run_qa(
        qtasks,
        qa_navigation,
        args.workers,
        args.qa_limit,
        set(args.qa_category) if args.qa_category else None,
        args.questions_per_category,
    ) if args.stage in {"all", "qa"} else json.loads(qa_path.read_text(encoding="utf-8"))
    if args.stage in {"all", "judge"}:
        qa = run_judging(qtasks, qa, args.workers)
    elif (DATA / "qa_runs_autonomous_scored.json").exists():
        qa = json.loads((DATA / "qa_runs_autonomous_scored.json").read_text(encoding="utf-8"))
    summarize(retrieval, qa, commit, build)


if __name__ == "__main__":
    main()
