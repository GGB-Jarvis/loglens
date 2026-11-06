from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import __version__
from .log import get_logger
from .packs import list_packs
from .pipeline import analyze

logger = get_logger("cli")


def _analyze(args: argparse.Namespace) -> int:
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    run_id = args.name or "run"
    if (out / run_id).exists():
        index = 2
        while (out / f"{run_id}-{index}").exists():
            index += 1
        run_id = f"{run_id}-{index}"

    def progress(stage: str, pct: int, message: str = "") -> None:
        print(f"[{pct:3d}%] {stage:<9} {message}", file=sys.stderr)

    print(f"LogLens v{__version__} · pack={args.pack} · out={out / run_id}")
    logger.info("CLI 分析开始 run=%s pack=%s inputs=%s use_llm=%s", run_id, args.pack, args.paths, not args.no_llm)
    try:
        result = analyze(
            args.paths,
            pack=args.pack,
            out_dir=out,
            run_id=run_id,
            use_llm=not args.no_llm,
            cache_path=out.parent / "cache" / "template_labels.json",
            progress=progress,
        )
    except Exception as exc:
        logger.exception("CLI 分析失败 run=%s", run_id)
        print(f"分析失败：{exc}", file=sys.stderr)
        return 1
    logger.info(
        "CLI 分析完成 run=%s records=%s files=%s anomalies=%s llm_used=%s",
        run_id,
        result.records,
        len(result.files),
        len(result.anomalies),
        result.llm_used,
    )
    print()
    print(f"records     {result.records:,}")
    print(f"files       {len(result.files)}")
    print(f"anomalies   {len(result.anomalies)}")
    print(f"LLM         {'yes · ' + (result.llm_model or '') if result.llm_used else 'no (deterministic report)'}")
    for warning in result.warnings:
        print(f"warning     {warning}")
    print()
    print(f"report      {Path(result.out_dir) / 'report.md'}")
    print(f"html        {Path(result.out_dir) / 'report.html'}")
    print(f"evidence    {Path(result.out_dir) / 'evidence.json'}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="loglens", description="Evidence-grounded AI log analysis")
    parser.add_argument("--version", action="version", version=__version__)
    sub = parser.add_subparsers(dest="command", required=True)

    analyze_parser = sub.add_parser("analyze", help="Analyze a folder or files")
    analyze_parser.add_argument("paths", nargs="+", help="Files or directories to analyze")
    analyze_parser.add_argument("--pack", default="generic", help="Domain pack id or path to pack.yaml")
    analyze_parser.add_argument("--out", default="data/runs", help="Output root directory")
    analyze_parser.add_argument("--name", default="", help="Run id / output folder name")
    analyze_parser.add_argument("--no-llm", action="store_true", help="Skip LLM and use deterministic report")
    analyze_parser.set_defaults(func=_analyze)

    serve_parser = sub.add_parser("serve", help="Start the web UI")
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8000)
    serve_parser.add_argument("--reload", action="store_true")

    packs_parser = sub.add_parser("packs", help="List domain packs")
    packs_parser.set_defaults(func=lambda _: _print_packs())

    args = parser.parse_args(argv)
    logger.info("CLI command=%s", args.command)
    if args.command == "serve":
        import uvicorn

        logger.info("启动 Web 服务 host=%s port=%s reload=%s", args.host, args.port, args.reload)
        uvicorn.run("loglens.api:app", host=args.host, port=args.port, reload=args.reload)
        return 0
    return args.func(args)


def _print_packs() -> int:
    for pack in list_packs():
        print(f"{pack['id']:<16} {pack.get('version', '?'):<8} {pack.get('name', '')}")
        description = pack.get("description", "").strip()
        if description:
            print(f"{'':<26}{description[:100]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
