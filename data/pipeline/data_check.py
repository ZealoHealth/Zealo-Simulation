#!/usr/bin/env python
"""Print what data is missing, interim or invalid, and regenerate data/DATA_TODO.md.

    make data-check
"""

from __future__ import annotations

from zealo.pipeline.data_status import INVALID, TODO_MD, collect, render_todo

SYMBOL = {"complete": "OK ", "decided": "OK ", "interim": "~  ", "optional": ".  ",
          "pending": "!  ", "invalid": "XX "}


def main() -> int:
    items = collect()
    for i in items:
        print(f"{SYMBOL.get(i.status, '?  ')} {i.id:<4} {i.title:<50} {i.status:<9} {i.progress}")
        for p in i.problems:
            print(f"       ! {p}")
    TODO_MD.write_text(render_todo(items))
    print(f"\nWrote {TODO_MD.relative_to(TODO_MD.parents[1])}")
    return 1 if any(i.status == INVALID for i in items) else 0


if __name__ == "__main__":
    raise SystemExit(main())
