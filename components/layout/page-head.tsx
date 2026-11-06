import type { ReactNode } from "react";
import { PixelCursor } from "@/components/ui";

export function PageHead({
  index,
  en,
  title,
  description,
  actions,
  meta,
}: {
  index: string;
  en: string;
  title: string;
  description: string;
  actions?: ReactNode;
  meta?: string;
}) {
  return (
    <div className="border-b-2 border-ink bg-surface">
      <div aria-hidden="true" className="h-2 px-dither-brand opacity-[0.12]" />
      <div className="mx-auto max-w-[1520px] px-6 pb-6 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-6 w-6 items-center justify-center border-2 border-ink bg-ink font-mono text-[9px] font-semibold text-white">
              {index}
            </span>
            <span className="label label-brand">{en}</span>
            <span aria-hidden="true" className="h-3 w-[2px] bg-line" />
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-2">
              workspace
            </span>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
            {meta ?? "order-api 故障复盘 · 2026-10-02"}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-12 items-end gap-6">
          <h1 className="pixel-title col-span-12 text-[40px] md:text-[54px] lg:col-span-7">
            {title}
            <PixelCursor className="ml-2" />
          </h1>

          <div className="col-span-12 flex flex-col gap-4 lg:col-span-4 lg:col-start-9">
            <p className="max-w-[46ch] text-[12.5px] leading-6 text-muted">
              {description}
            </p>
            {actions ? (
              <div className="flex flex-wrap items-center gap-2">{actions}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SectionHead({
  index,
  title,
  description,
  aside,
}: {
  index: string;
  title: string;
  description?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div className="flex items-start gap-4">
        <span className="mt-[6px] flex h-5 w-5 shrink-0 items-center justify-center border-2 border-ink bg-surface font-mono text-[8px] font-semibold">
          {index}
        </span>
        <div>
          <h2 className="text-[22px] font-semibold leading-none tracking-[-0.025em]">
            {title}
          </h2>
          {description ? (
            <p className="mt-3 max-w-[62ch] text-[11.5px] leading-5 text-muted">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {aside}
    </div>
  );
}
