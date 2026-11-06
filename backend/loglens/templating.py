from __future__ import annotations

from .models import LEVEL_ORDER, Record, TemplateInfo
from .parsing import template_id_of, template_of


class TemplateCollector:
    """Incremental template mining: mask dynamic tokens, count by pattern."""

    def __init__(self) -> None:
        self.items: dict[int, TemplateInfo] = {}

    def add(self, record: Record) -> TemplateInfo:
        pattern = template_of(record.message)
        template_id = template_id_of(pattern)
        info = self.items.get(template_id)
        if info is None:
            info = TemplateInfo(
                template_id=template_id,
                pattern=pattern,
                sample=record.message.strip().splitlines()[0][:500] if record.message.strip() else "",
                first_ts=record.ts,
                last_ts=record.ts,
            )
            self.items[template_id] = info
        info.count += 1
        if record.ts is not None:
            if info.first_ts is None or record.ts < info.first_ts:
                info.first_ts = record.ts
            if info.last_ts is None or record.ts > info.last_ts:
                info.last_ts = record.ts
        info.levels[record.level] = info.levels.get(record.level, 0) + 1
        info.modules[record.module] = info.modules.get(record.module, 0) + 1
        if LEVEL_ORDER.get(record.level, 2) > LEVEL_ORDER.get(info.severity, 2):
            info.severity = record.level
        record.template_id = template_id
        record.template = pattern
        return info

    def ranked(self) -> list[TemplateInfo]:
        return sorted(self.items.values(), key=lambda item: item.count, reverse=True)
