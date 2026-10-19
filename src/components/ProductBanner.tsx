import { Package } from "lucide-react";
import { PRODUCT } from "@/lib/product";

export default function ProductBanner() {
  return (
    <div className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
        <Package aria-hidden className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">분석 대상 상품 · {PRODUCT.category}</p>
        <p data-testid="product-name" className="truncate text-sm font-semibold">
          {PRODUCT.name}
        </p>
      </div>
    </div>
  );
}
