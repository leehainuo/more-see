import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SESSION_FILTERS,
  hasActiveSessionFilters,
  normalizeSessionFilters,
  type SessionFilters,
} from "@/lib/session-filters";

type SessionFilterField = "query" | "inputSource" | "status" | "updatedRange";

type SessionFilterBarProps = {
  value: SessionFilters;
  onApply: (nextValue: SessionFilters) => void;
  disabled?: boolean;
  className?: string;
  visibleFields?: SessionFilterField[];
};

const sourceOptions = [
  { value: "all", label: "全部来源" },
  { value: "camera", label: "摄像头" },
  { value: "screen", label: "屏幕共享" },
] as const;

const statusOptions = [
  { value: "all", label: "全部状态" },
  { value: "active", label: "进行中" },
  { value: "ended", label: "已结束" },
] as const;

const defaultVisibleFields: SessionFilterField[] = ["query", "inputSource", "status", "updatedRange"];

type FilterDatePickerProps = {
  valueFrom: string;
  valueTo: string;
  onChange: (nextValue: { updatedFrom: string; updatedTo: string }) => void;
  disabled: boolean;
};

function FilterDatePicker({ valueFrom, valueTo, onChange, disabled }: FilterDatePickerProps) {
  const [open, setOpen] = useState(false);
  const selectedRange: DateRange | undefined =
    valueFrom || valueTo
      ? {
          from: valueFrom ? parseISO(`${valueFrom}T00:00:00`) : undefined,
          to: valueTo ? parseISO(`${valueTo}T00:00:00`) : undefined,
        }
      : undefined;

  const displayText =
    valueFrom && valueTo
      ? `${format(parseISO(`${valueFrom}T00:00:00`), "yyyy / MM / dd")} - ${format(parseISO(`${valueTo}T00:00:00`), "yyyy / MM / dd")}`
      : valueFrom
        ? `${format(parseISO(`${valueFrom}T00:00:00`), "yyyy / MM / dd")} - 结束时间`
        : valueTo
          ? `开始时间 - ${format(parseISO(`${valueTo}T00:00:00`), "yyyy / MM / dd")}`
          : "选择时间范围";

  return (
    <div className="min-w-[180px] flex-1 space-y-2">
      <span className="text-xs font-medium text-zinc-700">更新时间</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "h-10 w-full justify-between rounded-lg border-black/10 bg-white px-3 text-sm font-normal text-zinc-900 hover:bg-white",
              !valueFrom && !valueTo && "text-zinc-500",
            )}
          >
            {displayText}
            <CalendarIcon className="size-4 text-zinc-700" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="range"
            selected={selectedRange}
            onSelect={(range) => {
              onChange({
                updatedFrom: range?.from ? format(range.from, "yyyy-MM-dd") : "",
                updatedTo: range?.to ? format(range.to, "yyyy-MM-dd") : "",
              });
              if (range?.from && range?.to) {
                setOpen(false);
              }
            }}
          />
          <div className="flex justify-end border-t border-black/10 p-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || (!valueFrom && !valueTo)}
              onClick={() => {
                onChange({ updatedFrom: "", updatedTo: "" });
                setOpen(false);
              }}
            >
              清空
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

type SessionFilterBarInnerProps = SessionFilterBarProps & {
  initialValue: SessionFilters;
};

function SessionFilterBarInner({
  value,
  onApply,
  disabled = false,
  className,
  visibleFields = defaultVisibleFields,
  initialValue,
}: SessionFilterBarInnerProps) {
  const [draft, setDraft] = useState<SessionFilters>(initialValue);
  const visibleFieldSet = useMemo(() => new Set(visibleFields), [visibleFields]);
  const active = useMemo(() => hasActiveSessionFilters(draft), [draft]);

  useEffect(() => {
    const normalizedDraft = normalizeSessionFilters(draft);
    const normalizedValue = normalizeSessionFilters(value);
    if (normalizedDraft.query === normalizedValue.query) {
      return;
    }

    const timer = window.setTimeout(() => {
      onApply(normalizedDraft);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [draft, onApply, value]);

  function updateAndApply(nextValue: SessionFilters) {
    const normalizedNextValue = normalizeSessionFilters(nextValue);
    setDraft(normalizedNextValue);
    onApply(normalizedNextValue);
  }

  const showQuery = visibleFieldSet.has("query");
  const showInputSource = visibleFieldSet.has("inputSource");
  const showStatus = visibleFieldSet.has("status");
  const showUpdatedRange = visibleFieldSet.has("updatedRange");

  return (
    <div className={cn("rounded-[24px] border border-black/10 bg-black/2 p-4", className)}>
      <div className="flex flex-wrap gap-3">
          {showQuery ? (
            <label className="min-w-[220px] flex-[1.2] space-y-2">
              <span className="text-xs font-medium text-zinc-700">会话 ID</span>
              <input
                value={draft.query}
                onChange={(event) => setDraft((prev) => ({ ...prev, query: event.target.value }))}
                placeholder="输入 sessionId 关键字"
                disabled={disabled}
                className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-black/30 disabled:cursor-not-allowed disabled:bg-zinc-100"
              />
            </label>
          ) : null}

          {showInputSource ? (
            <label className="min-w-[180px] flex-1 space-y-2">
              <span className="text-xs font-medium text-zinc-700">输入来源</span>
              <Select
                value={draft.inputSource}
                onValueChange={(value) =>
                  updateAndApply({
                    ...draft,
                    inputSource: value as SessionFilters["inputSource"],
                  })
                }
              >
                <SelectTrigger disabled={disabled}>
                  <SelectValue placeholder="全部来源" />
                </SelectTrigger>
                <SelectContent>
                  {sourceOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          ) : null}

          {showStatus ? (
            <label className="min-w-[180px] flex-1 space-y-2">
              <span className="text-xs font-medium text-zinc-700">会话状态</span>
              <Select
                value={draft.status}
                onValueChange={(value) =>
                  updateAndApply({
                    ...draft,
                    status: value as SessionFilters["status"],
                  })
                }
              >
                <SelectTrigger disabled={disabled}>
                  <SelectValue placeholder="全部状态" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          ) : null}

          {showUpdatedRange ? (
            <FilterDatePicker
              valueFrom={draft.updatedFrom}
              valueTo={draft.updatedTo}
              disabled={disabled}
              onChange={(nextValue) =>
                updateAndApply({
                  ...draft,
                  updatedFrom: nextValue.updatedFrom,
                  updatedTo: nextValue.updatedTo,
                })
              }
            />
          ) : null}

          <div className="flex items-end self-end">
            <Button
              type="button"
              variant="outline"
              className="h-10 px-5"
              disabled={disabled || !active}
              onClick={() => {
                setDraft(DEFAULT_SESSION_FILTERS);
                onApply(DEFAULT_SESSION_FILTERS);
              }}
            >
              重置
            </Button>
          </div>
      </div>
    </div>
  );
}

export function SessionFilterBar(props: SessionFilterBarProps) {
  const normalizedValue = useMemo(() => normalizeSessionFilters(props.value), [props.value]);
  const resetKey = useMemo(() => JSON.stringify(normalizedValue), [normalizedValue]);

  return <SessionFilterBarInner key={resetKey} {...props} value={normalizedValue} initialValue={normalizedValue} />;
}
